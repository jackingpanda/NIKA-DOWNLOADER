/**
 * REA-IDM Content Script - Injected Floating Video Sniffer & Quality Selector
 */

let capturedStreams = [];
let snifferButton = null;
let currentVideoElement = null;

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

// Format bytes
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

let pendingAutoDownloadQuality = null;

// Add or update stream in capturedStreams
function addStreamItem(item) {
  if (!item || !item.url || typeof item.url !== 'string') return;
  // For YouTube MSE chunks or non-handled blobs, reject them. But allow WhatsApp status and media blobs!
  if (item.url.startsWith('blob:') && !item.isBlob && !window.location.hostname.includes('whatsapp.com')) return;
  // Ignore webmanifest or non-media URLs
  if (item.url.includes('.webmanifest') || item.url.includes('manifest.json')) return;

  const existingIdx = capturedStreams.findIndex(s => {
    if (item.isYouTube && item.itag && s.itag) {
      return s.itag === item.itag;
    }
    return s.url === item.url;
  });

  if (existingIdx >= 0) {
    if (!capturedStreams[existingIdx].contentLength && item.contentLength) {
      capturedStreams[existingIdx].contentLength = item.contentLength;
    }
  } else {
    capturedStreams.push(item);
  }

  sortCapturedStreams();
  updateSnifferButtonBadge();

  // If user previously requested this quality via Fetch & DL, auto-trigger download
  if (pendingAutoDownloadQuality && item.quality && (item.quality.toLowerCase().includes(pendingAutoDownloadQuality.toLowerCase()) || pendingAutoDownloadQuality.toLowerCase().includes(item.quality.toLowerCase()))) {
    const target = item;
    pendingAutoDownloadQuality = null;
    triggerDownload(target);
  }

  const activeVid = document.querySelector('video') || currentVideoElement;
  if (activeVid) {
    showFloatingSniffer(activeVid);
  } else {
    showGlobalSniffer();
  }
}

// Sort streams: Combined 720p/360p first (hasAudio), then 1080p FHD, then other video, then Audio
function sortCapturedStreams() {
  capturedStreams.sort((a, b) => {
    // 1. Muxed Video + Audio (itag 22: 720p HD, itag 18: 360p)
    const aMuxed = a.hasAudio && a.type === 'video' ? (a.itag === 22 ? 300 : 200) : 0;
    const bMuxed = b.hasAudio && b.type === 'video' ? (b.itag === 22 ? 300 : 200) : 0;
    if (aMuxed !== bMuxed) return bMuxed - aMuxed;

    // 2. 1080p Full HD
    const aFhd = a.quality?.includes('1080') ? 150 : 0;
    const bFhd = b.quality?.includes('1080') ? 150 : 0;
    if (aFhd !== bFhd) return bFhd - aFhd;

    // 3. Audio streams vs Video streams
    const aIsAudio = a.type === 'audio' || a.contentType?.includes('audio');
    const bIsAudio = b.type === 'audio' || b.contentType?.includes('audio');
    if (!aIsAudio && bIsAudio) return -1;
    if (aIsAudio && !bIsAudio) return 1;

    return (b.contentLength || 0) - (a.contentLength || 0);
  });
}

// Listen for detected media streams from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'MEDIA_DETECTED') {
    addStreamItem(message.payload);
  }
});

// Request initially captured media for this tab
chrome.runtime.sendMessage({ type: 'GET_TAB_MEDIA' }, (response) => {
  if (response?.media && response.media.length > 0) {
    for (const m of response.media) {
      addStreamItem(m);
    }
  }
});

let availableLevels = [];

// Listen for response from YouTube in-page bridge (yt-bridge.js)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'REA_IDM_YT_STREAM_DATA') {
    const { streams, title } = event.data;
    if (streams && streams.length > 0) {
      for (const s of streams) {
        addStreamItem(s);
      }
    }
  } else if (event.data?.type === 'REA_IDM_YT_AVAILABLE_LEVELS') {
    const { levels } = event.data;
    if (Array.isArray(levels) && levels.length > 0) {
      availableLevels = levels;
      updateSnifferButtonBadge();
    }
  }
});

// Watch for video players entering viewport or being added to DOM
function observeVideos() {
  const isYouTube = window.location.hostname.includes('youtube.com');
  if (isYouTube) {
    window.postMessage({ type: 'REA_IDM_QUERY_YT' }, '*');
    window.addEventListener('yt-navigate-finish', () => {
      capturedStreams = [];
      updateSnifferButtonBadge();
      setTimeout(() => {
        window.postMessage({ type: 'REA_IDM_QUERY_YT' }, '*');
      }, 800);
      setTimeout(() => {
        window.postMessage({ type: 'REA_IDM_QUERY_YT' }, '*');
      }, 2200);
    });
  }

  const videos = document.querySelectorAll('video');
  videos.forEach(attachSnifferToVideo);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'VIDEO') {
            attachSnifferToVideo(node);
          } else {
            const innerVideos = node.querySelectorAll?.('video');
            innerVideos?.forEach(attachSnifferToVideo);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function attachSnifferToVideo(video) {
  if (video.dataset.reaIdmAttached) return;
  video.dataset.reaIdmAttached = 'true';

  const container = video.closest('.html5-video-player') ||
                    video.closest('[class*="player"]') ||
                    video.closest('.video-container') ||
                    video.parentElement ||
                    document.body;

  const onHover = () => {
    currentVideoElement = video;
    showFloatingSniffer(video);
  };

  video.addEventListener('mouseenter', onHover);
  container.addEventListener('mouseenter', onHover);
  video.addEventListener('play', () => {
    onHover();
    if (window.location.hostname.includes('youtube.com')) {
      window.postMessage({ type: 'REA_IDM_QUERY_YT' }, '*');
    }
  });

  // Direct src check (non-YouTube HTML5 videos, including WhatsApp status blobs)
  if (video.src || video.currentSrc) {
    const src = video.currentSrc || video.src;
    const isBlob = src.startsWith('blob:');
    if ((src.startsWith('http://') || src.startsWith('https://') || isBlob) && !src.includes('googlevideo.com')) {
      const isWA = window.location.hostname.includes('whatsapp.com');
      addStreamItem({
        url: src,
        quality: isWA ? 'WhatsApp Status' : (isBlob ? 'Blob Stream' : 'Video'),
        label: isWA ? 'WhatsApp Status Video' : (isBlob ? 'Media Stream' : 'HTML5 Video'),
        ext: src.includes('.webm') ? 'webm' : 'mp4',
        type: 'video',
        contentType: 'video/mp4',
        contentLength: 0,
        isBlob,
        timestamp: Date.now()
      });
    }
  }
}

function positionSniffer(targetEl) {
  if (!snifferButton) return;
  
  if (!document.body.contains(snifferButton)) {
    document.body.appendChild(snifferButton);
  }
  snifferButton.style.display = 'flex';

  // If user has manually moved the button, preserve their chosen position
  if (snifferButton.dataset.customPositioned === 'true') {
    return;
  }

  const isWA = window.location.hostname.includes('whatsapp.com');
  if (isWA) {
    // In WhatsApp Web, position fixed in the top-right safe zone (below X button, away from header controls and video tap overlay)
    snifferButton.style.top = '85px';
    snifferButton.style.right = '28px';
    snifferButton.style.left = 'auto';
    snifferButton.style.bottom = 'auto';
    return;
  }

  if (targetEl && targetEl.getBoundingClientRect) {
    const rect = targetEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const top = Math.max(16, rect.top + 16);
      const right = Math.max(16, (window.innerWidth - rect.right) + 16);
      snifferButton.style.top = `${top}px`;
      snifferButton.style.right = `${right}px`;
      snifferButton.style.left = 'auto';
      snifferButton.style.bottom = 'auto';
      return;
    }
  }

  snifferButton.style.top = '16px';
  snifferButton.style.right = '20px';
  snifferButton.style.left = 'auto';
  snifferButton.style.bottom = 'auto';
}

function showFloatingSniffer(video) {
  if (!snifferButton) {
    createSnifferButton();
  }

  currentVideoElement = video;
  positionSniffer(video);
}

function showGlobalSniffer() {
  if (!snifferButton) {
    createSnifferButton();
  }
  positionSniffer(currentVideoElement);
}

function createSnifferButton() {
  if (snifferButton) return;

  snifferButton = document.createElement('div');
  snifferButton.className = 'rea-idm-video-sniffer-btn';
  snifferButton.id = 'rea-idm-floating-sniffer';
  snifferButton.title = 'Drag to reposition • Click to download';
  snifferButton.innerHTML = `
    <div class="rea-idm-sniffer-icon">
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
    </div>
    <span class="rea-idm-sniffer-label">Download This Video</span>
    <span class="rea-idm-sniffer-count" id="rea-idm-stream-count">1</span>
  `;

  // Always attach directly to document.body to break out of all website stacking contexts & overlays!
  document.body.appendChild(snifferButton);

  // Create Dropdown Menu
  const dropdown = document.createElement('div');
  dropdown.className = 'rea-idm-sniffer-dropdown';
  dropdown.style.display = 'none';
  snifferButton.appendChild(dropdown);

  // DRAG & DROP SUPPORT WITH CLICK ISOLATION
  let isDragging = false;
  let hasDragged = false;
  let startX = 0, startY = 0;
  let initLeft = 0, initTop = 0;
  let ignoreNextClick = false;

  snifferButton.addEventListener('mousedown', (e) => {
    if (e.target.closest('.rea-idm-sniffer-dropdown') || e.target.closest('button')) {
      return;
    }
    isDragging = true;
    hasDragged = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = snifferButton.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    snifferButton.classList.add('is-dragging');
    // Isolate event so page layers do not trigger or pause, but DO NOT call e.preventDefault() so click fires!
    e.stopPropagation();
  }, { capture: true });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasDragged = true;
      ignoreNextClick = true;
    }
    if (hasDragged) {
      const newLeft = Math.max(8, Math.min(window.innerWidth - snifferButton.offsetWidth - 8, initLeft + dx));
      const newTop = Math.max(8, Math.min(window.innerHeight - snifferButton.offsetHeight - 8, initTop + dy));
      snifferButton.style.left = `${newLeft}px`;
      snifferButton.style.top = `${newTop}px`;
      snifferButton.style.right = 'auto';
      snifferButton.style.bottom = 'auto';
      snifferButton.dataset.customPositioned = 'true';
    }
  }, { capture: true });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      snifferButton.classList.remove('is-dragging');
      if (hasDragged) {
        setTimeout(() => { ignoreNextClick = false; }, 80);
      }
    }
  }, { capture: true });

  // Stop pointer events from bubbling to WhatsApp / video player overlays
  ['pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
    snifferButton.addEventListener(evt, (e) => {
      e.stopPropagation();
    }, { capture: true });
  });

  snifferButton.addEventListener('click', (e) => {
    if (ignoreNextClick || hasDragged) {
      ignoreNextClick = false;
      hasDragged = false;
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    e.stopImmediatePropagation();

    const isWA = window.location.hostname.includes('whatsapp.com');
    if (isWA) {
      downloadCurrentWhatsAppStatus();
      return;
    }

    toggleDropdown(dropdown);
  }, { capture: true });

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });
}

function updateSnifferButtonBadge() {
  const countEl = document.getElementById('rea-idm-stream-count');
  if (countEl) {
    const capturedQualities = new Set(capturedStreams.map(s => s.quality));
    const uncapturedLevels = availableLevels.filter(lvl => !capturedQualities.has(lvl.quality));
    const total = capturedStreams.length + uncapturedLevels.length;
    countEl.textContent = total || 1;
  }
}

function toggleDropdown(dropdown) {
  if (dropdown.style.display === 'flex') {
    dropdown.style.display = 'none';
    return;
  }

  dropdown.innerHTML = '';

  const capturedQualities = new Set(capturedStreams.map(s => s.quality));
  const uncapturedLevels = availableLevels.filter(lvl => !capturedQualities.has(lvl.quality));
  const totalCount = capturedStreams.length + uncapturedLevels.length;

  const header = document.createElement('div');
  header.className = 'rea-idm-dropdown-header';
  header.innerHTML = `
    <span>Available Qualities (${totalCount})</span>
    <span style="font-size: 10px; font-weight: normal; color: #64748b;">Click to download</span>
  `;
  dropdown.appendChild(header);

  const listContainer = document.createElement('div');
  listContainer.className = 'rea-idm-dropdown-list';

  if (totalCount === 0) {
    window.postMessage({ type: 'REA_IDM_QUERY_YT' }, '*');
    dropdown.innerHTML = `
      <div class="rea-idm-dropdown-header">
        <span>Available Qualities (0)</span>
      </div>
      <div style="padding: 14px 16px; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        Scanning YouTube stream qualities...<br>
        Please start playing the video to capture formats.
      </div>
    `;
    dropdown.style.display = 'flex';
    return;
  }

  // 1. Render Captured Streams (Direct downloadable)
  for (let i = 0; i < capturedStreams.length; i++) {
    const s = capturedStreams[i];
    const quality = s.quality || 'Video';
    const label = s.label || 'Video Stream';
    const size = formatSize(s.contentLength);

    const isFhd = quality.includes('1080');
    const isHd = quality.includes('720') || quality.includes('1440') || quality.includes('2160') || quality.includes('4K');
    const isAudio = s.type === 'audio' || s.contentType?.includes('audio');

    let badgeClass = 'badge-sd';
    if (isFhd) badgeClass = 'badge-fhd';
    else if (isHd) badgeClass = 'badge-hd';
    else if (isAudio) badgeClass = 'badge-audio';

    const item = document.createElement('div');
    item.className = 'rea-idm-sniffer-item';
    item.innerHTML = `
      <div class="rea-idm-item-left">
        <span class="rea-idm-quality-badge ${badgeClass}">${quality}</span>
        <div class="rea-idm-item-text">
          <span class="rea-idm-item-label">${label}</span>
          <span class="rea-idm-item-size">${size ? size : 'Ready to Download'}</span>
        </div>
      </div>
      <button class="rea-idm-download-btn" type="button">Download</button>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerDownload(s);
      dropdown.style.display = 'none';
    });

    listContainer.appendChild(item);
  }

  // 2. Render Uncaptured YouTube Quality Levels (Switch & Download)
  for (let j = 0; j < uncapturedLevels.length; j++) {
    const lvl = uncapturedLevels[j];
    const quality = lvl.quality || lvl.level;
    const label = lvl.label || `${quality} Stream`;

    const isFhd = quality.includes('1080');
    const isHd = quality.includes('720') || quality.includes('1440') || quality.includes('2160') || quality.includes('4K');

    let badgeClass = 'badge-sd';
    if (isFhd) badgeClass = 'badge-fhd';
    else if (isHd) badgeClass = 'badge-hd';

    const item = document.createElement('div');
    item.className = 'rea-idm-sniffer-item';
    item.innerHTML = `
      <div class="rea-idm-item-left">
        <span class="rea-idm-quality-badge ${badgeClass}">${quality}</span>
        <div class="rea-idm-item-text">
          <span class="rea-idm-item-label">${label}</span>
          <span class="rea-idm-item-size" style="color: #38bdf8;">Click to switch & download</span>
        </div>
      </div>
      <button class="rea-idm-download-btn" type="button" style="background: rgba(6, 182, 212, 0.2); border: 1px solid rgba(6, 182, 212, 0.5); color: #06b6d4;">Fetch & DL</button>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = item.querySelector('.rea-idm-download-btn');
      if (btn) btn.textContent = 'Switching... ⏳';

      const numMatch = quality.match(/\d{3,4}/);
      const targetLabel = numMatch ? numMatch[0] : quality;
      pendingAutoDownloadQuality = targetLabel;

      triggerYouTubeGearQuality(targetLabel);

      window.postMessage({
        type: 'REA_IDM_TRIGGER_QUALITY',
        level: lvl.level
      }, '*');

      setTimeout(() => {
        if (btn && btn.textContent.includes('Switching')) {
          btn.textContent = 'Streaming... 🔄';
        }
      }, 1500);
    });

    listContainer.appendChild(item);
  }

  dropdown.appendChild(listContainer);
  dropdown.style.display = 'flex';
}

function triggerYouTubeGearQuality(qualityLabel) {
  try {
    const settingsBtn = document.querySelector('.ytp-settings-button');
    if (!settingsBtn) return false;

    const panel = document.querySelector('.ytp-popup.ytp-settings-menu');
    const isVisible = panel && panel.style.display !== 'none';
    if (!isVisible) {
      settingsBtn.click();
    }

    setTimeout(() => {
      const menuItems = Array.from(document.querySelectorAll('.ytp-menuitem'));
      const qualityItem = menuItems.find(m => {
        const text = m.textContent.toLowerCase();
        return text.includes('quality') || text.includes('kualitas');
      }) || menuItems[menuItems.length - 1];

      if (qualityItem) {
        qualityItem.click();

        setTimeout(() => {
          const qItems = Array.from(document.querySelectorAll('.ytp-quality-menu .ytp-menuitem, .ytp-panel-menu .ytp-menuitem'));
          const numMatch = qualityLabel.match(/\d{3,4}/);
          const targetNum = numMatch ? numMatch[0] : qualityLabel;

          const targetItem = qItems.find(i => i.textContent.includes(targetNum) || i.textContent.includes(qualityLabel));
          if (targetItem) {
            targetItem.click();
          } else {
            settingsBtn.click();
          }
        }, 120);
      } else {
        settingsBtn.click();
      }
    }, 120);
    return true;
  } catch (err) {
    console.warn('[REA-IDM] Error switching YouTube quality via gear:', err);
    return false;
  }
}

// ==========================================
// WhatsApp Web Status Integration
// ==========================================
function isWhatsAppWeb() {
  return window.location.hostname.includes('whatsapp.com');
}

function getWhatsAppStatusContainer() {
  return document.querySelector('div[role="dialog"]') ||
         document.querySelector('div[role="region"]') ||
         document.querySelector('[data-testid="status-v3-header"]')?.closest('div[style*="z-index"]') ||
         document.querySelector('div[data-animate-status-v3="true"]');
}

function getActiveWhatsAppMedia() {
  const container = getWhatsAppStatusContainer() || document.body;

  // 1. Check for active video
  const video = container.querySelector('video') || document.querySelector('video');
  if (video && (video.currentSrc || video.src)) {
    const src = video.currentSrc || video.src;
    return {
      element: video,
      url: src,
      type: 'video',
      ext: src.includes('.webm') ? 'webm' : 'mp4',
      isBlob: src.startsWith('blob:')
    };
  }

  // 2. Check for active status image / photo (exclude small contact avatars)
  const images = Array.from(container.querySelectorAll('img'));
  const statusImg = images.find(img => {
    const src = img.src || '';
    if (!src || src.includes('avatar') || src.includes('profile')) return false;
    const rect = img.getBoundingClientRect();
    return rect.width > 200 && rect.height > 200;
  });

  if (statusImg && statusImg.src) {
    return {
      element: statusImg,
      url: statusImg.src,
      type: 'image',
      ext: 'jpg',
      isBlob: statusImg.src.startsWith('blob:')
    };
  }

  return null;
}

function getWhatsAppStatusContact() {
  const selectors = [
    'header span[title]',
    '[data-testid="status-v3-header"] span[title]',
    'header span[dir="auto"]',
    'div[role="dialog"] header span[dir="auto"]',
    'div[role="region"] header span[dir="auto"]',
    'div[data-animate-status-v3="true"] header span'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.getAttribute('title') || el?.textContent;
    if (text && text.trim() && text.length > 1 && text.length < 50 && !text.includes(':')) {
      return text.trim();
    }
  }
  return null;
}

function downloadCurrentWhatsAppStatus() {
  const media = getActiveWhatsAppMedia();
  const label = snifferButton?.querySelector('.rea-idm-sniffer-label');

  if (!media || !media.url) {
    if (capturedStreams.length > 0) {
      triggerDownload(capturedStreams[0]);
      return;
    }
    if (label) {
      label.textContent = 'No media found!';
      setTimeout(() => { label.textContent = 'Download Status Media'; }, 2000);
    }
    return;
  }

  const contact = getWhatsAppStatusContact();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const cleanContact = contact ? contact.replace(/[\\/:*?"<>|]/g, '').trim() : 'Media';
  const filename = `WhatsApp_Status_${cleanContact}_${dateStr}.${media.ext}`;

  if (label) {
    label.textContent = 'Saving to NIKA... ⏳';
  }

  triggerDownload({
    url: media.url,
    title: `WhatsApp_Status_${cleanContact}`,
    filename,
    ext: media.ext,
    type: media.type,
    isBlob: media.isBlob,
    quality: 'WhatsApp Status'
  });
}

function initWhatsAppStatusObserver() {
  if (!isWhatsAppWeb()) return;

  const checkStatus = () => {
    const statusContainer = getWhatsAppStatusContainer();
    if (statusContainer) {
      const media = getActiveWhatsAppMedia();
      if (media && media.url) {
        if (!snifferButton) {
          createSnifferButton();
        }
        positionSniffer(media.element);
        const label = snifferButton.querySelector('.rea-idm-sniffer-label');
        if (label && !label.textContent.includes('Saved') && !label.textContent.includes('Saving')) {
          label.textContent = media.type === 'video' ? 'Download Status Video' : 'Download Status Photo';
        }
        const count = snifferButton.querySelector('.rea-idm-sniffer-count');
        if (count) count.textContent = '1';
        snifferButton.style.display = 'flex';
      }
    } else if (snifferButton && !snifferButton.dataset.customPositioned) {
      snifferButton.style.display = 'none';
    }
  };

  setInterval(checkStatus, 700);
}

function triggerDownload(item) {
  const isWhatsApp = window.location.hostname.includes('whatsapp.com');
  let cleanTitle = item.title;

  if (!cleanTitle && isWhatsApp) {
    const contact = getWhatsAppStatusContact();
    if (contact) {
      cleanTitle = `WhatsApp_Status_${contact.replace(/[\\/:*?"<>|]/g, '').trim()}`;
    } else {
      cleanTitle = `WhatsApp_Status_${Date.now()}`;
    }
  } else if (!cleanTitle) {
    cleanTitle = document.title.replace(/\s*-\s*YouTube$/i, '').trim();
    cleanTitle = cleanTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'video';
  }

  const ext = item.ext || (item.contentType?.includes('audio') ? 'm4a' : (item.contentType?.includes('webm') ? 'webm' : (item.type === 'image' ? 'jpg' : 'mp4')));
  const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
  const qualityTag = item.quality && !item.quality.includes('Auto') && !item.quality.includes('Status') ? ` [${item.quality.replace(/\s+/g, '')}]` : '';
  const filename = item.filename || `${cleanTitle}${qualityTag}${dotExt}`;

  // Special Handling for in-memory blob URLs (e.g. WhatsApp status)
  if (item.url && item.url.startsWith('blob:')) {
    const label = snifferButton?.querySelector('.rea-idm-sniffer-label');
    if (label) label.textContent = 'Saving to NIKA... ⏳';

    try {
      fetch(item.url)
        .then(res => res.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result?.split(',')[1];
            if (base64Data) {
              chrome.runtime.sendMessage({
                type: 'SAVE_BLOB_MEDIA',
                payload: {
                  base64Data,
                  filename,
                  sourceUrl: item.url,
                  contentType: blob.type || (item.type === 'image' ? 'image/jpeg' : 'video/mp4')
                }
              }, (response) => {
                if (!response || !response.success) {
                  // Fallback to browser direct anchor download if bridge is offline
                  const a = document.createElement('a');
                  a.href = item.url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => a.remove(), 1000);
                }
              });
            } else {
              const a = document.createElement('a');
              a.href = item.url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => a.remove(), 1000);
            }
          };
          reader.readAsDataURL(blob);
        })
        .catch(err => {
          console.warn('[NIKA] Blob fetch fallback to browser download:', err);
          const a = document.createElement('a');
          a.href = item.url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 1000);
        });
    } catch {
      const a = document.createElement('a');
      a.href = item.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 1000);
    }

    if (label) {
      label.textContent = 'Status Saved! ✅';
      setTimeout(() => {
        const isWA = window.location.hostname.includes('whatsapp.com');
        label.textContent = isWA ? 'Download Status Media' : 'Download This Video';
      }, 2500);
    }
    return;
  }

  // Standard HTTP/HTTPS download forwarded to NIKA engine
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_MEDIA',
    payload: {
      url: item.url,
      filename,
      referer: window.location.href,
      isYouTube: true
    }
  }, (res) => {
    const label = snifferButton?.querySelector('.rea-idm-sniffer-label');
    if (label) {
      if (res?.success) {
        label.textContent = 'Sent to NIKA! ✅';
      } else {
        label.textContent = 'Check NIKA App ⚠️';
      }
      setTimeout(() => { label.textContent = 'Download This Video'; }, 2500);
    }
  });
}

// Start observing once DOM is ready
function initObservers() {
  observeVideos();
  initWhatsAppStatusObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObservers);
} else {
  initObservers();
}
