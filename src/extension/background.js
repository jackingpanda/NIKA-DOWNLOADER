/**
 * REA-IDM WebExtension Background Service Worker
 * Manages WebSocket bridge connection, download interception, and media stream sniffing.
 */

const WS_PORT = 41719;
const WS_URL = `ws://127.0.0.1:${WS_PORT}`;

let ws = null;
let isConnected = false;
let reconnectTimer = null;
let reconnectDelay = 1000;

// Settings cache
let settings = {
  interceptDownloads: true,
  videoSnifferEnabled: true
};

// Map of tabId -> Array of captured media objects
const tabMediaMap = new Map();

// Initialize settings from storage
chrome.storage.local.get(['interceptDownloads', 'videoSnifferEnabled'], (res) => {
  if (res.interceptDownloads !== undefined) settings.interceptDownloads = res.interceptDownloads;
  if (res.videoSnifferEnabled !== undefined) settings.videoSnifferEnabled = res.videoSnifferEnabled;
  setupContextMenus();
  connectWebSocket();
});

// Setup Right-Click Context Menus
function setupContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'rea-idm-download-link',
      title: 'Download with NIKA',
      contexts: ['link']
    });

    chrome.contextMenus.create({
      id: 'rea-idm-download-media',
      title: 'Download Media with NIKA',
      contexts: ['video', 'audio', 'image']
    });

    chrome.contextMenus.create({
      id: 'rea-idm-download-selection',
      title: 'Download Selection with NIKA',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'rea-idm-download-page',
      title: 'Download with NIKA...',
      contexts: ['page']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  injectContentScriptsIntoExistingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

function injectContentScriptsIntoExistingTabs() {
  if (!chrome.scripting) return;
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js']
      }).catch(() => {});
      chrome.scripting.insertCSS({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.css']
      }).catch(() => {});

      // Inject MAIN_WORLD bridges for YouTube and WhatsApp Web
      if (tab.url?.includes('youtube.com')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          files: ['yt-bridge.js']
        }).catch(() => {});
      }
      if (tab.url?.includes('whatsapp.com')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          files: ['wa-bridge.js']
        }).catch(() => {});
      }
    }
  });
}

// Handle Context Menu Clicks
chrome.contextMenus?.onClicked.addListener((info, tab) => {
  let targetUrl = info.linkUrl || info.srcUrl;
  if (!targetUrl && info.selectionText) {
    const text = info.selectionText.trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      targetUrl = text;
    } else if (text.startsWith('www.')) {
      targetUrl = 'https://' + text;
    }
  }
  if (!targetUrl && info.pageUrl) {
    targetUrl = info.pageUrl;
  }

  if (!targetUrl) return;

  if (!isConnected) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'NIKA Disconnected',
      message: 'Desktop app is not running. Please start start-desktop.bat to download.'
    });
    connectWebSocket();
    return;
  }

  chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
    let cookieHeader = '';
    if (cookies && cookies.length > 0) {
      cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }

    sendToDesktop('add_download', {
      url: targetUrl,
      referer: tab ? tab.url : undefined,
      cookies: cookieHeader,
      headers: { 'User-Agent': navigator.userAgent },
      autoStart: true
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'NIKA Download Added',
      message: `Sent to NIKA engine:\n${targetUrl.substring(0, 75)}...`
    });
  });
});

// WebSocket Connection Manager
function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      isConnected = true;
      reconnectDelay = 5000;
      updateBadge();
      console.log('[NIKA Extension] Connected to desktop bridge on port', WS_PORT);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleDesktopMessage(message);
      } catch (err) {
        console.warn('[NIKA Extension] Error parsing desktop message:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      ws = null;
      updateBadge();
      scheduleReconnect();
    };

    ws.onerror = () => {
      isConnected = false;
      updateBadge();
      // onclose will automatically fire after onerror
    };
  } catch (err) {
    isConnected = false;
    ws = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
    reconnectDelay = Math.min(60000, reconnectDelay * 1.5);
  }, reconnectDelay);
}

function sendToDesktop(type, payload) {
  if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
    return true;
  }
  connectWebSocket();
  return false;
}

function sendToDesktopAsync(type, payload, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type, payload }));
        return resolve(true);
      } catch {
        // Fall through to reconnect
      }
    }

    connectWebSocket();

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
        clearInterval(interval);
        try {
          ws.send(JSON.stringify({ type, payload }));
          return resolve(true);
        } catch {
          return resolve(false);
        }
      }
      if (Date.now() - startTime >= timeoutMs) {
        clearInterval(interval);
        return resolve(false);
      }
    }, 100);
  });
}

function updateBadge() {
  if (isConnected) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#64748b' }); // Muted
  }
}

function handleDesktopMessage(message) {
  // Can handle events from desktop if needed
}

// 1. Download Interception
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (!settings.interceptDownloads || !isConnected) {
    return; // Let browser handle it
  }

  // Intercept the download
  const targetUrl = item.finalUrl || item.url;

  // Retrieve cookies for this URL
  chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
    let cookieHeader = '';
    if (cookies && cookies.length > 0) {
      cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }

    sendToDesktop('add_download', {
      url: targetUrl,
      filename: item.filename,
      destinationDir: undefined,
      cookies: cookieHeader,
      referer: item.referrer || undefined,
      headers: {
        'User-Agent': navigator.userAgent
      },
      autoStart: true
    });

    // Cancel browser download
    chrome.downloads.cancel(item.id, () => {
      chrome.downloads.erase({ id: item.id });
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'NIKA Intercepted Download',
      message: `File: ${item.filename || 'download'}\nRedirected to NIKA engine.`
    });
  });
});

// 2. Media Stream Sniffing via webRequest
const MEDIA_MIME_PATTERNS = [
  'video/',
  'audio/',
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'application/dash+xml'
];

const MEDIA_EXTENSIONS = ['.m3u8', '.mpd', '.mp4', '.webm', '.ts', '.mkv', '.flv', '.mp3', '.m4a'];

const EXCLUDED_PATTERNS = [
  '.webmanifest',
  'manifest.json',
  '/manifest.',
  'analytics',
  '/stats/',
  '/api/',
  '/log_event',
  '/generate_204',
  '/ptracking',
  '/pagead/'
];

const ITAG_MAP = {
  // Muxed Video + Audio
  18: { quality: '360p', ext: 'mp4', type: 'video', label: 'MP4 360p (Video + Audio)' },
  22: { quality: '720p HD', ext: 'mp4', type: 'video', label: 'MP4 720p HD (Video + Audio)' },

  // 4K 2160p Video
  313: { quality: '2160p 4K', ext: 'webm', type: 'video', label: 'WebM 4K 2160p Ultra HD' },
  315: { quality: '2160p60 4K', ext: 'webm', type: 'video', label: 'WebM 4K 2160p 60fps' },
  337: { quality: '2160p60 HDR', ext: 'webm', type: 'video', label: 'WebM 4K 2160p HDR 60fps' },
  401: { quality: '2160p 4K', ext: 'mp4', type: 'video', label: 'MP4 4K 2160p (AV1)' },

  // 1440p 2K Video
  271: { quality: '1440p 2K', ext: 'webm', type: 'video', label: 'WebM 1440p 2K Quad HD' },
  308: { quality: '1440p60 2K', ext: 'webm', type: 'video', label: 'WebM 1440p 2K 60fps' },
  400: { quality: '1440p 2K', ext: 'mp4', type: 'video', label: 'MP4 1440p 2K (AV1)' },

  // 1080p Full HD Video
  137: { quality: '1080p FHD', ext: 'mp4', type: 'video', label: 'MP4 1080p Full HD' },
  248: { quality: '1080p FHD', ext: 'webm', type: 'video', label: 'WebM 1080p Full HD' },
  299: { quality: '1080p60 FHD', ext: 'mp4', type: 'video', label: 'MP4 1080p Full HD 60fps' },
  303: { quality: '1080p60 FHD', ext: 'webm', type: 'video', label: 'WebM 1080p Full HD 60fps' },
  399: { quality: '1080p FHD', ext: 'mp4', type: 'video', label: 'MP4 1080p Full HD (AV1)' },

  // 720p HD Video
  136: { quality: '720p HD', ext: 'mp4', type: 'video', label: 'MP4 720p HD' },
  247: { quality: '720p HD', ext: 'webm', type: 'video', label: 'WebM 720p HD' },
  298: { quality: '720p60 HD', ext: 'mp4', type: 'video', label: 'MP4 720p HD 60fps' },
  302: { quality: '720p60 HD', ext: 'webm', type: 'video', label: 'WebM 720p HD 60fps' },
  398: { quality: '720p HD', ext: 'mp4', type: 'video', label: 'MP4 720p HD (AV1)' },

  // 480p Video
  135: { quality: '480p', ext: 'mp4', type: 'video', label: 'MP4 480p' },
  244: { quality: '480p', ext: 'webm', type: 'video', label: 'WebM 480p' },
  397: { quality: '480p', ext: 'mp4', type: 'video', label: 'MP4 480p (AV1)' },

  // 360p Video
  134: { quality: '360p', ext: 'mp4', type: 'video', label: 'MP4 360p' },
  243: { quality: '360p', ext: 'webm', type: 'video', label: 'WebM 360p' },
  396: { quality: '360p', ext: 'mp4', type: 'video', label: 'MP4 360p (AV1)' },

  // 240p & 144p Video
  133: { quality: '240p', ext: 'mp4', type: 'video', label: 'MP4 240p' },
  242: { quality: '240p', ext: 'webm', type: 'video', label: 'WebM 240p' },
  160: { quality: '144p', ext: 'mp4', type: 'video', label: 'MP4 144p' },
  278: { quality: '144p', ext: 'webm', type: 'video', label: 'WebM 144p' },

  // Audio Streams
  140: { quality: '128k', ext: 'm4a', type: 'audio', label: 'Audio M4A (128 kbps)' },
  251: { quality: '160k', ext: 'webm', type: 'audio', label: 'Audio Opus (160 kbps)' },
  250: { quality: '70k', ext: 'webm', type: 'audio', label: 'Audio Opus (70 kbps)' },
  249: { quality: '50k', ext: 'webm', type: 'audio', label: 'Audio Opus (50 kbps)' }
};

// Canonical media key generator to deduplicate stream chunks across requests
function getCanonicalMediaKey(urlStr, contentType = '', itag = null) {
  if (itag) return `yt:itag:${itag}`;
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();

    // YouTube videoplayback
    if (host.includes('googlevideo.com') || host.includes('youtube.com')) {
      const itagParam = u.searchParams.get('itag');
      if (itagParam) return `yt:itag:${itagParam}`;
      const id = u.searchParams.get('id');
      if (id) return `yt:id:${id}`;
    }

    // Meta CDN: Instagram / Facebook (*.fbcdn.net, *.cdninstagram.com, *.facebook.com, *.instagram.com)
    if (host.includes('fbcdn.net') || host.includes('cdninstagram.com') || host.includes('facebook.com') || host.includes('instagram.com')) {
      const isAudio = (contentType || '').includes('audio') || u.pathname.toLowerCase().includes('/audio');
      return `meta:${u.pathname}:${isAudio ? 'audio' : 'video'}`;
    }

    // TikTok CDN
    if (host.includes('tiktokcdn.com') || host.includes('byteoversea.com') || host.includes('ibytedtos.com')) {
      return `tiktok:${u.pathname}`;
    }

    // Twitter / X CDN
    if (host.includes('twimg.com') || host.includes('x.com')) {
      return `twitter:${u.pathname}`;
    }

    // WhatsApp
    if (host.includes('whatsapp.net') || host.includes('whatsapp.com')) {
      return `wa:${u.pathname}`;
    }

    // Generic media: clean query parameters that vary across chunks (range, offset, session IDs, timestamps)
    const sp = new URLSearchParams(u.search);
    const volatileParams = ['bytestart', 'byteend', 'range', 'rn', '_nc_gid', 't', 'ts', '_', 'sq', 'playback_host'];
    for (const p of volatileParams) {
      sp.delete(p);
    }
    const cleanSearch = sp.toString();
    return `generic:${u.origin}${u.pathname}${cleanSearch ? '?' + cleanSearch : ''}`;
  } catch {
    return urlStr;
  }
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!settings.videoSnifferEnabled || details.tabId < 0) return;

    const urlLower = details.url.toLowerCase();

    // Ignore webmanifest, analytics, tracking, etc.
    if (EXCLUDED_PATTERNS.some(p => urlLower.includes(p))) {
      return;
    }

    let contentType = '';
    let contentLength = 0;
    let fullContentLength = 0;

    if (details.responseHeaders) {
      for (const h of details.responseHeaders) {
        const name = h.name.toLowerCase();
        if (name === 'content-type') {
          contentType = h.value.toLowerCase();
        } else if (name === 'content-length') {
          contentLength = parseInt(h.value, 10) || 0;
        } else if (name === 'content-range') {
          // Content-Range: bytes 0-1048575/83733220 -> extract true total file size!
          const match = h.value.match(/bytes\s+\d+-\d+\/(\d+)/i);
          if (match && match[1]) {
            fullContentLength = parseInt(match[1], 10) || 0;
          }
        }
      }
    }

    const actualContentLength = fullContentLength > 0 ? fullContentLength : contentLength;

    // Special Handling: YouTube videoplayback streams
    if (urlLower.includes('googlevideo.com/videoplayback')) {
      try {
        const parsedUrl = new URL(details.url);
        const itag = parseInt(parsedUrl.searchParams.get('itag'), 10);
        const clen = parseInt(parsedUrl.searchParams.get('clen'), 10) || actualContentLength;
        const mime = parsedUrl.searchParams.get('mime') || contentType;

        // Clean range parameters to allow full stream downloading
        parsedUrl.searchParams.delete('range');
        parsedUrl.searchParams.delete('rn');
        const cleanStreamUrl = parsedUrl.toString();

        const meta = ITAG_MAP[itag] || {
          quality: itag ? `itag ${itag}` : 'Video',
          ext: mime.includes('webm') ? 'webm' : (mime.includes('audio') ? 'm4a' : 'mp4'),
          type: mime.includes('audio') ? 'audio' : 'video',
          label: `${mime.includes('audio') ? 'Audio' : 'Video'} (${itag || 'HD'})`
        };

        addCapturedMedia(details.tabId, {
          url: cleanStreamUrl,
          itag,
          canonicalKey: `yt:itag:${itag}`,
          quality: meta.quality,
          label: meta.label,
          ext: meta.ext,
          type: meta.type,
          contentType: mime || 'video/mp4',
          contentLength: clen,
          isYouTube: true,
          timestamp: Date.now()
        });
        return;
      } catch (err) {
        console.warn('Error parsing videoplayback:', err);
      }
    }

    // Generic Media Check (HLS m3u8, DASH mpd, MP4, WebM, etc.)
    let isMedia = false;
    try {
      const cleanPath = new URL(details.url).pathname.toLowerCase();
      if (MEDIA_EXTENSIONS.some(ext => cleanPath.endsWith(ext))) {
        isMedia = true;
      }
    } catch {}

    if (contentType && MEDIA_MIME_PATTERNS.some(p => contentType.includes(p))) {
      isMedia = true;
    }

    if (isMedia) {
      if (actualContentLength > 0 && actualContentLength < 30000 && !urlLower.includes('.m3u8') && !urlLower.includes('.mpd')) {
        return;
      }

      // Clean range parameters (e.g. bytestart/byteend for Meta/Instagram/Facebook CDN, or range/rn)
      let cleanUrl = details.url;
      try {
        const u = new URL(details.url);
        let changed = false;
        if (u.searchParams.has('bytestart') || u.searchParams.has('byteend')) {
          u.searchParams.delete('bytestart');
          u.searchParams.delete('byteend');
          changed = true;
        }
        if (u.searchParams.has('range') || u.searchParams.has('rn')) {
          u.searchParams.delete('range');
          u.searchParams.delete('rn');
          changed = true;
        }
        if (changed) {
          cleanUrl = u.toString();
        }
      } catch {}

      const isAudio = contentType.includes('audio') || cleanUrl.includes('/audio');
      const isMeta = urlLower.includes('fbcdn.net') || urlLower.includes('cdninstagram.com');
      const label = isMeta ? (isAudio ? 'Audio Stream' : 'Video Stream') : (isAudio ? 'Audio Stream' : 'Video Stream');
      const quality = isMeta ? (isAudio ? 'Audio' : 'Video') : (isAudio ? 'Audio' : 'Video');

      addCapturedMedia(details.tabId, {
        url: cleanUrl,
        contentType,
        contentLength: actualContentLength,
        label,
        quality,
        type: isAudio ? 'audio' : 'video',
        ext: isAudio ? 'm4a' : 'mp4',
        timestamp: Date.now()
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

function addCapturedMedia(tabId, mediaItem) {
  let list = tabMediaMap.get(tabId);
  if (!list) {
    list = [];
    tabMediaMap.set(tabId, list);
  }

  const canonicalKey = mediaItem.canonicalKey || getCanonicalMediaKey(mediaItem.url, mediaItem.contentType, mediaItem.itag);
  mediaItem.canonicalKey = canonicalKey;

  const existingIdx = list.findIndex(m => {
    if (canonicalKey && m.canonicalKey && m.canonicalKey === canonicalKey) return true;
    if (mediaItem.isYouTube && mediaItem.itag && m.itag) return m.itag === mediaItem.itag;
    return m.url === mediaItem.url;
  });

  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    // Keep URL fresh with latest tokens
    existing.url = mediaItem.url;
    if (mediaItem.contentLength && (!existing.contentLength || mediaItem.contentLength > existing.contentLength)) {
      existing.contentLength = mediaItem.contentLength;
    }
    if (mediaItem.quality && !existing.quality) existing.quality = mediaItem.quality;
    if (mediaItem.label && !existing.label) existing.label = mediaItem.label;
    existing.timestamp = Date.now();

    chrome.tabs.sendMessage(tabId, {
      type: 'MEDIA_UPDATED',
      payload: existing,
      totalCount: list.length
    }).catch(() => {});
    return;
  }

  list.push(mediaItem);

  // Notify content script on active tab
  chrome.tabs.sendMessage(tabId, {
    type: 'MEDIA_DETECTED',
    payload: mediaItem,
    totalCount: list.length
  }).catch(() => {});
}

// Clean up media when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaMap.delete(tabId);
});

// Clean up media when tab navigates or changes URL on single-page apps (Instagram, TikTok, Twitter/X)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const urlLower = changeInfo.url.toLowerCase();
    if (urlLower.includes('instagram.com/reels/') || urlLower.includes('instagram.com/p/') ||
        urlLower.includes('tiktok.com/') || urlLower.includes('twitter.com/') || urlLower.includes('x.com/')) {
      tabMediaMap.delete(tabId);
    }
  }
});

// 3. Extension Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'GET_STATUS': {
      sendResponse({
        isConnected,
        settings
      });
      break;
    }

    case 'GET_TAB_MEDIA': {
      const tabId = payload?.tabId || sender.tab?.id;
      sendResponse({
        media: tabMediaMap.get(tabId) || []
      });
      break;
    }

    case 'CLEAR_TAB_MEDIA': {
      const tabId = payload?.tabId || sender.tab?.id;
      if (tabId) {
        tabMediaMap.delete(tabId);
      }
      sendResponse({ success: true });
      break;
    }

    case 'DOWNLOAD_MEDIA': {
      const { url, filename, referer, isYouTube } = payload;
      const isGoogleVideo = isYouTube || (typeof url === 'string' && (url.includes('googlevideo.com') || url.includes('youtube.com')));

      const dispatchDownload = async (cookieHeader = '') => {
        const reqHeaders = {
          'User-Agent': navigator.userAgent
        };
        if (isGoogleVideo || (referer && referer.includes('youtube.com'))) {
          reqHeaders['Referer'] = 'https://www.youtube.com/';
          reqHeaders['Origin'] = 'https://www.youtube.com';
        }

        const sent = await sendToDesktopAsync('add_download', {
          url,
          filename,
          referer: referer || (sender.tab ? sender.tab.url : (isGoogleVideo ? 'https://www.youtube.com/' : undefined)),
          cookies: isGoogleVideo ? '' : cookieHeader, // CRITICAL: NEVER send YouTube cookies to googlevideo.com
          headers: reqHeaders,
          autoStart: true
        });

        if (sent) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'NIKA Download Added',
            message: `Sent to NIKA:\n${filename || (url.length > 60 ? url.substring(0, 60) + '...' : url)}`
          });
        }
        sendResponse({ success: sent });
      };

      if (!isGoogleVideo && url && (url.startsWith('http://') || url.startsWith('https://'))) {
        chrome.cookies.getAll({ url }, (cookies) => {
          let cookieHeader = '';
          if (cookies && cookies.length > 0) {
            cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          }
          dispatchDownload(cookieHeader);
        });
      } else {
        dispatchDownload('');
      }
      return true; // Keep message channel open for async response
    }

    case 'SAVE_BLOB_MEDIA': {
      const { base64Data, filename, sourceUrl, contentType } = payload;
      sendToDesktopAsync('save_blob_media', {
        base64Data,
        filename,
        sourceUrl,
        contentType
      }).then(sent => {
        if (sent) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'NIKA Media Saved',
            message: `Saved: ${filename}\nSaved directly to your Downloads folder.`
          });
        }
        sendResponse({ success: sent });
      });
      return true;
    }

    case 'TOGGLE_SETTING': {
      const { key, value } = payload;
      settings[key] = value;
      chrome.storage.local.set({ [key]: value }, () => {
        sendResponse({ success: true, settings });
      });
      return true;
    }

    case 'RECONNECT': {
      connectWebSocket();
      sendResponse({ status: 'connecting' });
      break;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});
