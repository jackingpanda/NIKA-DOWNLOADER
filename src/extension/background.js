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
  return false;
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
  18: { quality: '360p', ext: 'mp4', type: 'video', label: 'MP4 360p (Video + Audio)' },
  22: { quality: '720p HD', ext: 'mp4', type: 'video', label: 'MP4 720p HD (Video + Audio)' },
  137: { quality: '1080p FHD', ext: 'mp4', type: 'video', label: 'MP4 1080p Full HD' },
  248: { quality: '1080p FHD', ext: 'webm', type: 'video', label: 'WebM 1080p Full HD' },
  136: { quality: '720p HD', ext: 'mp4', type: 'video', label: 'MP4 720p HD' },
  247: { quality: '720p HD', ext: 'webm', type: 'video', label: 'WebM 720p HD' },
  135: { quality: '480p', ext: 'mp4', type: 'video', label: 'MP4 480p' },
  244: { quality: '480p', ext: 'webm', type: 'video', label: 'WebM 480p' },
  134: { quality: '360p', ext: 'mp4', type: 'video', label: 'MP4 360p' },
  243: { quality: '360p', ext: 'webm', type: 'video', label: 'WebM 360p' },
  133: { quality: '240p', ext: 'mp4', type: 'video', label: 'MP4 240p' },
  140: { quality: '128k', ext: 'm4a', type: 'audio', label: 'Audio M4A (128 kbps)' },
  251: { quality: '160k', ext: 'webm', type: 'audio', label: 'Audio Opus (160 kbps)' }
};

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

    if (details.responseHeaders) {
      for (const h of details.responseHeaders) {
        const name = h.name.toLowerCase();
        if (name === 'content-type') {
          contentType = h.value.toLowerCase();
        } else if (name === 'content-length') {
          contentLength = parseInt(h.value, 10) || 0;
        }
      }
    }

    // Special Handling: YouTube videoplayback streams
    if (urlLower.includes('googlevideo.com/videoplayback')) {
      try {
        const parsedUrl = new URL(details.url);
        const itag = parseInt(parsedUrl.searchParams.get('itag'), 10);
        const clen = parseInt(parsedUrl.searchParams.get('clen'), 10) || contentLength;
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
      if (contentLength > 0 && contentLength < 30000 && !urlLower.includes('.m3u8') && !urlLower.includes('.mpd')) {
        return;
      }

      addCapturedMedia(details.tabId, {
        url: details.url,
        contentType,
        contentLength,
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

  // Deduplicate YouTube streams by itag or clean URL
  if (mediaItem.isYouTube && mediaItem.itag) {
    const idx = list.findIndex(m => m.itag === mediaItem.itag);
    if (idx >= 0) {
      if (!list[idx].contentLength && mediaItem.contentLength) {
        list[idx].contentLength = mediaItem.contentLength;
      }
      return;
    }
  } else {
    if (list.some(m => m.url === mediaItem.url)) {
      return;
    }
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

    case 'DOWNLOAD_MEDIA': {
      const { url, filename, referer, isYouTube } = payload;
      const cookieUrl = (isYouTube || url.includes('googlevideo.com')) ? 'https://www.youtube.com' : url;
      chrome.cookies.getAll({ url: cookieUrl }, (cookies) => {
        let cookieHeader = '';
        if (cookies && cookies.length > 0) {
          cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        }

        const reqHeaders = {
          'User-Agent': navigator.userAgent
        };
        if (isYouTube || url.includes('googlevideo.com') || (referer && referer.includes('youtube.com'))) {
          reqHeaders['Referer'] = 'https://www.youtube.com/';
          reqHeaders['Origin'] = 'https://www.youtube.com';
        }

        const sent = sendToDesktop('add_download', {
          url,
          filename,
          referer: referer || (sender.tab ? sender.tab.url : undefined),
          cookies: cookieHeader,
          headers: reqHeaders,
          autoStart: true
        });

        sendResponse({ success: sent });
      });
      return true; // Keep message channel open for async cookies query
    }

    case 'SAVE_BLOB_MEDIA': {
      const { base64Data, filename, sourceUrl, contentType } = payload;
      if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
      }
      const sent = sendToDesktop('save_blob_media', {
        base64Data,
        filename,
        sourceUrl,
        contentType
      });
      if (sent) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'NIKA Media Saved',
          message: `Saved: ${filename}\nSaved directly to your Downloads folder.`
        });
      }
      sendResponse({ success: sent });
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
