import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { logger } from './logger.js';

/**
 * Native Node.js HTTP/HTTPS stream request with redirect following.
 * Completely avoids Undici / fetch internal socket assertion bugs (e.g. assert(!this.paused)).
 */
function requestStream(targetUrl, options = {}, redirectCount = 0) {
  if (redirectCount > 10) {
    return Promise.reject(new Error('Too many HTTP redirects (exceeded 10)'));
  }

  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }

    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.request(urlObj, {
      method: options.method || 'GET',
      headers: options.headers || {},
      signal: options.signal,
      timeout: options.timeout || 30000,
    }, (res) => {
      // Follow HTTP redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, targetUrl).toString();
        // Drain response body to prevent socket hang
        res.resume();
        return requestStream(redirectUrl, options, redirectCount + 1).then(resolve, reject);
      }

      resolve(res);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Connection timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Worker responsible for downloading an individual byte segment
 */
export class SegmentWorker {
  /**
   * @param {Object} chunk - Chunk descriptor
   * @param {string} url - Target URL
   * @param {import('./storage.js').ReaStorage} storage - File storage
   * @param {Object} [options={}] - Custom headers, credentials, retries
   */
  constructor(chunk, url, storage, options = {}) {
    this.chunk = chunk;
    this.url = url;
    this.storage = storage;
    this.options = options;
    this.maxRetries = options.maxRetries || 5;
    this.retryDelayMs = options.retryDelayMs || 1000;
    this.abortController = null;
  }

  /**
   * Starts downloading this segment with automatic retry on intermittent network drop
   * @param {Function} onProgress - Callback for byte updates: (bytesReceived) => void
   * @param {AbortSignal} [externalSignal] - Signal to pause/cancel
   * @returns {Promise<void>}
   */
  async start(onProgress, externalSignal) {
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      if (externalSignal && externalSignal.aborted) {
        this.chunk.status = 'paused';
        return;
      }

      // If chunk is already completed, exit early
      if (this.chunk.endByte !== null && this.chunk.currentOffset > this.chunk.endByte) {
        this.chunk.status = 'completed';
        return;
      }

      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      // Link external abort signal if provided
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => this.abortController.abort(), { once: true });
      }

      try {
        await this._downloadStream(onProgress, signal);
        this.chunk.status = 'completed';
        logger.debug('WORKER', `Segment #${this.chunk.id} finished successfully (${this.chunk.downloadedBytes} bytes)`);
        return;
      } catch (err) {
        if (signal.aborted || (externalSignal && externalSignal.aborted)) {
          this.chunk.status = 'paused';
          logger.debug('WORKER', `Segment #${this.chunk.id} paused/aborted`);
          return;
        }

        attempt++;
        this.chunk.status = 'retrying';
        logger.warn('WORKER', `Segment #${this.chunk.id} encountered error: ${err.message}. Retrying (attempt ${attempt}/${this.maxRetries})...`);

        if (attempt > this.maxRetries) {
          this.chunk.status = 'error';
          this.chunk.error = err.message;
          logger.error('WORKER', `Segment #${this.chunk.id} permanently failed after ${this.maxRetries} retries`, err);
          throw new Error(`Chunk ${this.chunk.id} failed after ${this.maxRetries} retries: ${err.message}`);
        }

        // Wait with exponential backoff before retrying
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  /**
   * Internal stream reader loop
   * @private
   */
  async _downloadStream(onProgress, signal) {
    this.chunk.status = 'downloading';

    const headers = {
      'User-Agent': this.options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': '*/*',
      ...(this.options.headers || {})
    };

    const isGoogleVideo = this.url.includes('googlevideo.com') || (this.options.referer && this.options.referer.includes('youtube.com'));

    if (isGoogleVideo) {
      delete headers['Cookie']; // CRITICAL: NEVER send YouTube cookies to googlevideo.com
      if (!headers['Referer']) headers['Referer'] = 'https://www.youtube.com/';
      if (!headers['Origin']) headers['Origin'] = 'https://www.youtube.com';
    } else {
      if (this.options.cookies) {
        headers['Cookie'] = this.options.cookies;
      }
      if (this.options.referer) {
        headers['Referer'] = this.options.referer;
      }
    }

    // Set byte range header if Range is supported
    if (this.chunk.endByte !== null) {
      headers['Range'] = `bytes=${this.chunk.currentOffset}-${this.chunk.endByte}`;
    }

    const res = await requestStream(this.url, {
      method: 'GET',
      headers,
      signal
    });

    // CRITICAL CORRUPTION GUARD:
    // If this worker requested a range beyond byte 0 (startByte > 0), the server MUST return 206 Partial Content.
    // If the server returns 200 OK, it sent the full payload from byte 0. Writing that at an offset > 0 corrupts the file!
    if (this.chunk.startByte > 0 && res.statusCode === 200) {
      res.resume(); // drain
      throw new Error(`Server returned HTTP 200 instead of 206 Partial Content for chunk #${this.chunk.id} (Range header not honored by server)`);
    }

    // Check status code: 206 (Partial Content) or 200 (OK for chunk #0 or single stream)
    if (res.statusCode !== 200 && res.statusCode !== 206) {
      res.resume(); // drain
      throw new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage || 'Request Failed'}`);
    }

    try {
      for await (const chunk of res) {
        if (signal.aborted) {
          res.destroy();
          break;
        }

        if (chunk && chunk.length > 0) {
          if (this.options.limiter) {
            await this.options.limiter.consume(chunk.length, signal);
          }

          // Direct random-access offset write into preallocated file
          await this.storage.writeAt(chunk, this.chunk.currentOffset);

          const bytesRead = chunk.length;
          this.chunk.currentOffset += bytesRead;
          this.chunk.downloadedBytes += bytesRead;

          if (onProgress) {
            onProgress(bytesRead);
          }
        }
      }
    } finally {
      if (!res.destroyed) {
        res.destroy();
      }
    }
  }

  /**
   * Aborts active download stream immediately
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
