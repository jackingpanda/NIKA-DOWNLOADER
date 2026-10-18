import path from 'node:path';
import { logger } from './logger.js';

/**
 * MIME type to common file extension mappings
 */
const MIME_EXTENSIONS = {
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  'application/x-tar': '.tar',
  'application/gzip': '.tar.gz',
  'application/pdf': '.pdf',
  'application/octet-stream': '.bin',
  'application/x-msdownload': '.exe',
  'application/x-dosexec': '.exe',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

/**
 * Parses Content-Disposition header to retrieve filename
 * @param {string|null} disposition 
 * @returns {string|null}
 */
export function parseContentDispositionFilename(disposition) {
  if (!disposition) return null;

  // RFC 5987 / RFC 6266 utf-8 filename: filename*=UTF-8''filename.ext
  const rfc5987Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;\r\n]+)/i);
  if (rfc5987Match) {
    try {
      return decodeURIComponent(rfc5987Match[1]);
    } catch {
      return rfc5987Match[1];
    }
  }

  // Standard filename: filename="filename.ext" or filename=filename.ext
  const stdMatch = disposition.match(/filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i);
  if (stdMatch) {
    return stdMatch[1] || stdMatch[2] || stdMatch[3] || null;
  }

  return null;
}

/**
 * Probes a remote URL to test Range support, content length, and file metadata
 * @param {string} url - Target download URL
 * @param {Object} [options={}] - Custom headers, cookies, user-agent
 * @returns {Promise<Object>} Probe metadata
 */
export async function probeUrl(url, options = {}) {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    throw new Error('Blob URLs exist only in browser process memory and cannot be downloaded directly.');
  }

  const isGoogleVideo = typeof url === 'string' && (url.includes('googlevideo.com') || url.includes('youtube.com'));

  const headers = {
    'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity', // Ensure raw byte stream, not gzip/brotli compressed lengths
    ...(options.headers || {})
  };

  if (isGoogleVideo) {
    delete headers['Cookie']; // CRITICAL: NEVER send YouTube cookies to googlevideo.com
    if (!headers['Referer']) headers['Referer'] = 'https://www.youtube.com/';
    if (!headers['Origin']) headers['Origin'] = 'https://www.youtube.com';
  } else if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }

  if (options.referer) {
    headers['Referer'] = options.referer;
  }

  let response = null;
  let supportsRange = false;
  let contentLength = null;
  let filename = null;
  let contentType = 'application/octet-stream';
  let etag = null;
  let lastModified = null;
  let finalUrl = url;

  // Step 0: For Google Video streams, extract clen and mime upfront from query parameters
  if (isGoogleVideo) {
    try {
      const u = new URL(url);
      const clenParam = u.searchParams.get('clen');
      if (clenParam) {
        contentLength = parseInt(clenParam, 10);
        supportsRange = true;
      }
      const mimeParam = u.searchParams.get('mime');
      if (mimeParam) {
        contentType = mimeParam;
      }
    } catch {}
  }

  // Step 1: Try HTTP HEAD request first (skip HEAD for Google Video since HEAD returns 400 Bad Request)
  if (!isGoogleVideo) {
    try {
      response = await fetch(url, {
        method: 'HEAD',
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeoutMs || 10000)
      });
      finalUrl = response.url || url;
    } catch (err) {
      // If HEAD fails (some servers block HEAD), we proceed to GET range check
      response = null;
    }
  }

  // If HEAD succeeded, inspect headers
  if (response && response.ok) {
    contentType = response.headers.get('content-type') || contentType;
    etag = response.headers.get('etag');
    lastModified = response.headers.get('last-modified');
    const acceptRanges = response.headers.get('accept-ranges');
    const cl = response.headers.get('content-length');
    if (cl) {
      contentLength = parseInt(cl, 10);
    }
    const disposition = response.headers.get('content-disposition');
    filename = parseContentDispositionFilename(disposition);

    if (acceptRanges === 'bytes') {
      supportsRange = true;
    }
  }

  // Step 2: If Range support or Content-Length was not verified by HEAD,
  // do a lightweight GET request with Range: bytes=0-0
  if (!supportsRange || contentLength === null || isNaN(contentLength)) {
    try {
      const rangeCheckHeaders = {
        ...headers,
        'Range': 'bytes=0-0'
      };

      const rangeResponse = await fetch(finalUrl, {
        method: 'GET',
        headers: rangeCheckHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeoutMs || 10000)
      });

      finalUrl = rangeResponse.url || finalUrl;

      if (rangeResponse.status === 206) {
        supportsRange = true;
        const cr = rangeResponse.headers.get('content-range'); // e.g. bytes 0-0/10485760
        if (cr) {
          const match = cr.match(/\/(\d+|\*)$/);
          if (match && match[1] !== '*') {
            contentLength = parseInt(match[1], 10);
          }
        }
      } else if (rangeResponse.status === 200) {
        // Server ignored Range header and returned full content
        supportsRange = false;
        const cl = rangeResponse.headers.get('content-length');
        if (cl) {
          contentLength = parseInt(cl, 10);
        }
      }

      if (!filename) {
        const disposition = rangeResponse.headers.get('content-disposition');
        filename = parseContentDispositionFilename(disposition);
      }
      contentType = rangeResponse.headers.get('content-type') || contentType;
      etag = rangeResponse.headers.get('etag') || etag;
      lastModified = rangeResponse.headers.get('last-modified') || lastModified;

      // Cancel stream immediately so we don't download unneeded bytes
      if (rangeResponse.body) {
        try {
          const reader = rangeResponse.body.getReader();
          await reader.cancel();
        } catch {}
      }
    } catch (rangeErr) {
      // Keep any values obtained from HEAD if GET fails
    }
  }

  // Step 2.5: For Google Video streams, extract clen parameter if contentLength was not provided
  if (isGoogleVideo && (!contentLength || isNaN(contentLength))) {
    try {
      const u = new URL(finalUrl);
      const clenParam = u.searchParams.get('clen');
      if (clenParam) {
        contentLength = parseInt(clenParam, 10);
        supportsRange = true;
      }
    } catch {}
  }

  // Step 3: Deduce filename if still not resolved
  if (!filename) {
    try {
      const parsedUrl = new URL(finalUrl);
      const pathname = parsedUrl.pathname;
      const basename = path.basename(pathname);
      if (basename && basename.includes('.')) {
        filename = decodeURIComponent(basename);
      }
    } catch {}
  }

  if (!filename) {
    const ext = MIME_EXTENSIONS[contentType.split(';')[0].trim().toLowerCase()] || '.bin';
    filename = `download-${Date.now()}${ext}`;
  }

  // Sanitize filename for Windows filesystem
  filename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();

  logger.info('PROBE', `Probe completed for "${filename}": ${contentLength ? (contentLength + ' bytes') : 'Unknown size'}, Range: ${supportsRange ? 'Yes' : 'No'}`);

  return {
    url: finalUrl,
    filename,
    contentLength: (contentLength && !isNaN(contentLength) && contentLength > 0) ? contentLength : null,
    supportsRange,
    contentType,
    etag,
    lastModified,
    headers
  };
}
