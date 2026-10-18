/**
 * REA-IDM Content Script - Injected Floating Video Sniffer & Quality Selector
 */

let capturedStreams = [];
let snifferButton = null;
let currentVideoElement = null;

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
    // CRITICAL: Always upgrade URL if the incoming item has a live googlevideo.com URL
    if (item.url && (item.url.includes('googlevideo.com') || !capturedStreams[existingIdx].url)) {
      capturedStreams[existingIdx].url = item.url;
    }
    if (item.contentLength) {
      capturedStreams[existingIdx].contentLength = item.contentLength;
    }
    if (item.quality && !capturedStreams[existingIdx].quality) {
      capturedStreams[existingIdx].quality = item.quality;
    }
    if (item.label && !capturedStreams[existingIdx].label) {
      capturedStreams[existingIdx].label = item.label;
    }
    if (item.title && !capturedStreams[existingIdx].title) {
      capturedStreams[existingIdx].title = item.title;
    }
  } else {
    capturedStreams.push(item);
  }

  sortCapturedStreams();
  updateSnifferButtonBadge();

  // If user previously requested this quality via Fetch & DL, auto-trigger download
  if (pendingAutoDownloadQuality) {
    const p = String(pendingAutoDownloadQuality).toLowerCase();
    const q = String(item.quality || '').toLowerCase();
    const l = String(item.label || '').toLowerCase();
    const isMatch = q.includes(p) || p.includes(q) || l.includes(p) ||
      (p.includes('1440') && (item.itag === 271 || item.itag === 308 || item.itag === 400)) ||
      (p.includes('2160') && (item.itag === 313 || item.itag === 315 || item.itag === 337 || item.itag === 401)) ||
      (p.includes('1080') && (item.itag === 137 || item.itag === 248 || item.itag === 299 || item.itag === 303 || item.itag === 399)) ||
      (p.includes('720') && (item.itag === 136 || item.itag === 247 || item.itag === 298 || item.itag === 302 || item.itag === 22));

    if (isMatch) {
      const target = item;
      pendingAutoDownloadQuality = null;
      showNikaToast(`Captured ${item.quality || 'stream'}! Starting download...`);
      triggerDownload(target);
    }
  }

  const activeVid = document.querySelector('video') || currentVideoElement;
  if (activeVid) {
    showFloatingSniffer(activeVid);
  } else {
    showGlobalSniffer();
  }
}

// Sort streams: Combined 720p/360p first (hasAudio), then 4K, 1440p, 1080p, then Audio
function sortCapturedStreams() {
  const getResScore = (item) => {
    const q = (item.quality || '').toLowerCase();
    if (q.includes('2160') || q.includes('4k')) return 260;
    if (q.includes('1440') || q.includes('2k')) return 220;
    if (q.includes('1080')) return 180;
    if (q.includes('720')) return 140;
    if (q.includes('480')) return 90;
    if (q.includes('360')) return 60;
    return 10;
  };

  capturedStreams.sort((a, b) => {
    // 1. Muxed Video + Audio (itag 22: 720p HD, itag 18: 360p)
    const aMuxed = a.hasAudio && a.type === 'video' ? (a.itag === 22 ? 300 : 200) : 0;
    const bMuxed = b.hasAudio && b.type === 'video' ? (b.itag === 22 ? 300 : 200) : 0;
    if (aMuxed !== bMuxed) return bMuxed - aMuxed;

    // 2. High Resolution sorting
    const aRes = getResScore(a);
    const bRes = getResScore(b);
    if (aRes !== bRes) return bRes - aRes;

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

  // On WhatsApp Web, status and media lightboxes are managed exclusively by the dedicated
  // status observer. Do not attach hover listeners that fight with status overlay controls.
  if (window.location.hostname.includes('whatsapp.com')) {
    return;
  }

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

  // Stop pointer events from bubbling to WhatsApp / video player overlays (EXCEPT dropdown menu)
  ['pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
    snifferButton.addEventListener(evt, (e) => {
      if (e.target.closest('.rea-idm-sniffer-dropdown')) return;
      e.stopPropagation();
    }, { capture: true });
  });

  snifferButton.addEventListener('click', (e) => {
    // CRITICAL: If click occurred inside the dropdown menu, NEVER intercept or toggle! Let dropdown items handle their clicks!
    if (e.target.closest('.rea-idm-sniffer-dropdown')) {
      return;
    }

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

  // Close dropdown when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (!snifferButton.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
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

    const handleDirectDownload = (e) => {
      e.stopPropagation();
      e.preventDefault();
      triggerDownload(s);
      dropdown.style.display = 'none';
    };

    item.addEventListener('click', handleDirectDownload);
    const dlBtn = item.querySelector('.rea-idm-download-btn');
    if (dlBtn) dlBtn.addEventListener('click', handleDirectDownload);

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

    const handleFetchDownload = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const btn = item.querySelector('.rea-idm-download-btn');
      if (btn) btn.textContent = 'Switching... ⏳';

      const numMatch = quality.match(/\d{3,4}/);
      const targetLabel = numMatch ? numMatch[0] : quality;
      pendingAutoDownloadQuality = targetLabel;

      showNikaToast(`Switching YouTube to ${quality}... ⏳`);
      const labelEl = snifferButton?.querySelector('.rea-idm-sniffer-label');
      if (labelEl) labelEl.textContent = `Switching to ${quality}... ⏳`;

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

      // Safety timeout: If stream not captured within 3.5 seconds, download best available stream!
      setTimeout(() => {
        if (pendingAutoDownloadQuality === targetLabel) {
          pendingAutoDownloadQuality = null;
          if (capturedStreams.length > 0) {
            showNikaToast(`Sending available stream (${capturedStreams[0].quality || 'HD'}) to NIKA...`);
            triggerDownload(capturedStreams[0]);
          } else {
            showNikaToast(`Please play video in ${quality} for a moment to capture!`, true);
          }
        }
      }, 3500);

      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 600);
    };

    item.addEventListener('click', handleFetchDownload);
    const fetchBtn = item.querySelector('.rea-idm-download-btn');
    if (fetchBtn) fetchBtn.addEventListener('click', handleFetchDownload);

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

// In-Page Toast for instant visual feedback on WhatsApp Web
function showNikaToast(message, isError = false) {
  let toast = document.getElementById('nika-floating-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nika-floating-toast';
    toast.style.cssText = `
      position: fixed !important;
      bottom: 30px !important;
      right: 30px !important;
      background: rgba(11, 15, 23, 0.96) !important;
      color: #fff !important;
      border: 1px solid ${isError ? 'rgba(239, 68, 68, 0.6)' : 'rgba(6, 182, 212, 0.6)'} !important;
      border-radius: 10px !important;
      padding: 10px 18px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      box-shadow: 0 10px 25px rgba(0,0,0,0.7), 0 0 15px ${isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(6, 182, 212, 0.3)'} !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      transition: opacity 0.3s ease, transform 0.3s ease !important;
      opacity: 0 !important;
      transform: translateY(10px) !important;
    `;
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <span style="font-size: 16px;">${isError ? '⚠️' : '⚡'}</span>
    <span>${message}</span>
  `;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3500);
}

// Extract blob binary via MAIN_WORLD bridge (wa-bridge.js)
function fetchBlobViaBridge(url, filename, contentType) {
  return new Promise((resolve, reject) => {
    const id = 'wa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    let timeoutTimer = null;

    const onResult = (event) => {
      if (event.data?.type === 'NIKA_WA_BLOB_RESULT' && event.data.id === id) {
        window.removeEventListener('message', onResult);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        if (event.data.success && event.data.base64Data) {
          resolve({
            base64Data: event.data.base64Data,
            filename: event.data.filename || filename,
            contentType: event.data.contentType || contentType
          });
        } else {
          reject(new Error(event.data.error || 'Bridge blob extraction failed'));
        }
      }
    };

    window.addEventListener('message', onResult);

    timeoutTimer = setTimeout(() => {
      window.removeEventListener('message', onResult);
      reject(new Error('Timeout waiting for MAIN_WORLD bridge'));
    }, 8000);

    window.postMessage({
      type: 'NIKA_WA_FETCH_BLOB',
      id,
      url,
      filename,
      contentType
    }, '*');
  });
}

// Instant Canvas extraction for rendered images
function extractImageBase64(imgEl) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth || imgEl.videoWidth || imgEl.width || 1080;
    canvas.height = imgEl.naturalHeight || imgEl.videoHeight || imgEl.height || 1920;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    return dataUrl.split(',')[1] || null;
  } catch (err) {
    console.warn('[NIKA] Canvas extraction error:', err);
    return null;
  }
}

// Browser direct anchor download fallback
function downloadViaAnchor(url, filename) {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  } catch (err) {
    console.warn('[NIKA] Anchor download fallback error:', err);
  }
}

// WhatsApp Status viewer container detector - NEVER queries generic div[role="region"]
function getWhatsAppStatusContainer() {
  const v3Header = document.querySelector('[data-testid="status-v3-header"]');
  if (v3Header) {
    return v3Header.closest('[data-animate-status-v3="true"]') ||
           v3Header.closest('div[style*="z-index"]') ||
           v3Header.parentElement?.parentElement;
  }

  const v3Container = document.querySelector('div[data-animate-status-v3="true"]') ||
                      document.querySelector('[data-testid="status-v3-main"]')?.closest('div');
  if (v3Container) return v3Container;

  // Media preview lightbox dialog
  const dialogs = document.querySelectorAll('div[role="dialog"]');
  for (const d of dialogs) {
    if (d.querySelector('video') || d.querySelector('img[src*="blob:"]') || d.querySelector('[data-icon="x-viewer"]')) {
      return d;
    }
  }

  return null;
}

function getActiveWhatsAppMedia() {
  const container = getWhatsAppStatusContainer();
  if (!container) return null;

  // 1. Check for active <video>
  const videos = Array.from(container.querySelectorAll('video'));
  for (const v of videos) {
    const src = v.currentSrc || v.src || v.querySelector('source')?.src;
    if (src && (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://'))) {
      return {
        element: v,
        url: src,
        type: 'video',
        ext: src.includes('.webm') ? 'webm' : 'mp4',
        isBlob: src.startsWith('blob:')
      };
    }
  }

  const allVideos = Array.from(document.querySelectorAll('video'));
  for (const v of allVideos) {
    const rect = v.getBoundingClientRect();
    if (rect.width > 200 && rect.height > 200) {
      const src = v.currentSrc || v.src || v.querySelector('source')?.src;
      if (src) {
        return {
          element: v,
          url: src,
          type: 'video',
          ext: src.includes('.webm') ? 'webm' : 'mp4',
          isBlob: src.startsWith('blob:')
        };
      }
    }
  }

  // 2. Check for active status photo/image
  const images = Array.from(container.querySelectorAll('img'));
  const statusImg = images.find(img => {
    const src = img.src || '';
    if (!src) return false;
    if (src.includes('avatar') || src.includes('profile') || src.includes('emoji')) return false;
    const rect = img.getBoundingClientRect();
    return (rect.width > 200 && rect.height > 200) || (img.naturalWidth > 200 && img.naturalHeight > 200);
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
  const statusContainer = getWhatsAppStatusContainer();
  if (statusContainer) {
    const v3Header = statusContainer.querySelector('[data-testid="status-v3-header"]') || statusContainer.querySelector('header');
    if (v3Header) {
      const titleSpan = v3Header.querySelector('span[title]') || v3Header.querySelector('span[dir="auto"]');
      const text = titleSpan?.getAttribute('title') || titleSpan?.textContent;
      if (text && text.trim() && text.trim().length < 60) {
        return text.trim();
      }
    }
  }

  const selectors = [
    '[data-testid="status-v3-header"] span[title]',
    '[data-testid="status-v3-header"] span[dir="auto"]',
    'div[data-animate-status-v3="true"] header span[title]',
    'div[data-animate-status-v3="true"] header span[dir="auto"]',
    'div[role="dialog"] header span[title]',
    'div[role="dialog"] header span[dir="auto"]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.getAttribute('title') || el?.textContent;
    if (text && text.trim() && text.length > 0 && text.length < 60 && !text.includes(':') && text.toLowerCase() !== 'status') {
      return text.trim();
    }
  }
  return null;
}

let waStatusActive = false;
let waStatusMedia = null;
let waHideDebounceTimer = null;

function initWhatsAppStatusObserver() {
  if (!isWhatsAppWeb()) return;
  if (window !== window.top) return; // Guard: Top window only!

  const updateWhatsAppStatusState = () => {
    const container = getWhatsAppStatusContainer();
    if (container) {
      const media = getActiveWhatsAppMedia();
      if (media && media.url) {
        waStatusMedia = media;
        waStatusActive = true;

        if (waHideDebounceTimer) {
          clearTimeout(waHideDebounceTimer);
          waHideDebounceTimer = null;
        }

        if (!snifferButton) {
          createSnifferButton();
        }

        positionSniffer(media.element);

        const label = snifferButton.querySelector('.rea-idm-sniffer-label');
        if (label && !label.textContent.includes('Saved') && !label.textContent.includes('Saving') && !label.textContent.includes('Extracting')) {
          label.textContent = media.type === 'video' ? 'Download Status Video' : 'Download Status Photo';
        }
        const count = snifferButton.querySelector('.rea-idm-sniffer-count');
        if (count) count.textContent = '1';

        snifferButton.style.display = 'flex';
        snifferButton.style.opacity = '1';
        return;
      }
    }

    // Debounce hiding so story slide transitions do not cause the button to blink
    if (waStatusActive && !waHideDebounceTimer) {
      waHideDebounceTimer = setTimeout(() => {
        const recheckContainer = getWhatsAppStatusContainer();
        const recheckMedia = getActiveWhatsAppMedia();
        if (!recheckContainer || !recheckMedia) {
          waStatusActive = false;
          waStatusMedia = null;
          if (snifferButton && !snifferButton.dataset.customPositioned) {
            snifferButton.style.display = 'none';
          }
        }
        waHideDebounceTimer = null;
      }, 1400); // 1.4s debounce completely eliminates slide transition blinking
    }
  };

  updateWhatsAppStatusState();
  setInterval(updateWhatsAppStatusState, 600);

  // Instant response on lightbox open / close
  const mo = new MutationObserver(() => {
    updateWhatsAppStatusState();
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

async function downloadCurrentWhatsAppStatus() {
  const media = getActiveWhatsAppMedia() || waStatusMedia;
  const label = snifferButton?.querySelector('.rea-idm-sniffer-label');

  if (!media || !media.url) {
    if (label) {
      label.textContent = 'No media found!';
      setTimeout(() => { label.textContent = 'Download Status Media'; }, 2000);
    }
    return;
  }

  const contact = getWhatsAppStatusContact();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const cleanContact = contact ? contact.replace(/[\\/:*?"<>|]/g, '').trim() : 'Contact';
  const filename = `WhatsApp_Status_${cleanContact}_${dateStr}_${timeStr}.${media.ext}`;

  if (label) {
    label.textContent = 'Saving to NIKA... ⏳';
  }

  let base64Data = null;
  const contentType = media.type === 'video' ? 'video/mp4' : 'image/jpeg';

  // 1. Instant canvas extraction for images
  if (media.type === 'image' && media.element) {
    base64Data = extractImageBase64(media.element);
  }

  // 2. MAIN_WORLD bridge extraction for video and blob URLs
  if (!base64Data && media.url.startsWith('blob:')) {
    try {
      const bridgeResult = await fetchBlobViaBridge(media.url, filename, contentType);
      if (bridgeResult?.base64Data) {
        base64Data = bridgeResult.base64Data;
      }
    } catch (err) {
      console.warn('[NIKA] wa-bridge blob extraction failed, trying direct fetch:', err);
    }
  }

  // 3. Fallback to direct fetch in content script
  if (!base64Data && media.url.startsWith('blob:')) {
    try {
      const res = await fetch(media.url);
      const blob = await res.blob();
      base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result?.split(',')[1] || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('[NIKA] Direct blob fetch failed:', err);
    }
  }

  // 4. Send binary payload directly to NIKA Desktop Engine
  if (base64Data) {
    chrome.runtime.sendMessage({
      type: 'SAVE_BLOB_MEDIA',
      payload: {
        base64Data,
        filename,
        sourceUrl: media.url,
        contentType
      }
    }, (res) => {
      if (res?.success) {
        if (label) label.textContent = 'Saved to NIKA! ✅';
        showNikaToast(`WhatsApp status saved to NIKA Downloads!`);
      } else {
        if (label) label.textContent = 'Downloaded to Browser 📥';
        downloadViaAnchor(media.url, filename);
        showNikaToast(`Saved via browser (NIKA Desktop offline).`, true);
      }

      setTimeout(() => {
        if (label) {
          label.textContent = media.type === 'video' ? 'Download Status Video' : 'Download Status Photo';
        }
      }, 2500);
    });
    return;
  }

  // 5. Ultimate fallback if binary extraction was completely blocked
  downloadViaAnchor(media.url, filename);
  if (label) {
    label.textContent = 'Downloaded to Browser 📥';
    setTimeout(() => {
      label.textContent = media.type === 'video' ? 'Download Status Video' : 'Download Status Photo';
    }, 2500);
  }
}

async function triggerDownload(item) {
  const isWhatsApp = window.location.hostname.includes('whatsapp.com');
  if (isWhatsApp) {
    await downloadCurrentWhatsAppStatus();
    return;
  }

  let cleanTitle = item.title;
  if (!cleanTitle) {
    cleanTitle = document.title.replace(/\s*-\s*YouTube$/i, '').trim();
    cleanTitle = cleanTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'video';
  }

  const ext = item.ext || (item.contentType?.includes('audio') ? 'm4a' : (item.contentType?.includes('webm') ? 'webm' : (item.type === 'image' ? 'jpg' : 'mp4')));
  const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
  const qualityTag = item.quality && !item.quality.includes('Auto') && !item.quality.includes('Status') ? ` [${item.quality.replace(/\s+/g, '')}]` : '';
  const filename = item.filename || `${cleanTitle}${qualityTag}${dotExt}`;

  const isYouTube = window.location.hostname.includes('youtube.com') || (typeof item.url === 'string' && item.url.includes('googlevideo.com'));

  let streamUrl = item.url;
  try {
    if (typeof streamUrl === 'string' && streamUrl.includes('googlevideo.com')) {
      const u = new URL(streamUrl);
      u.searchParams.delete('range');
      u.searchParams.delete('rn');
      streamUrl = u.toString();
    }
  } catch {}

  // Standard HTTP/HTTPS download forwarded to NIKA engine
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_MEDIA',
    payload: {
      url: streamUrl,
      filename,
      referer: window.location.href,
      isYouTube
    }
  }, (res) => {
    const label = snifferButton?.querySelector('.rea-idm-sniffer-label');
    if (res?.success) {
      if (label) label.textContent = 'Sent to NIKA! ✅';
      showNikaToast(`Sent to NIKA: ${filename}`);
    } else {
      if (label) label.textContent = 'Check NIKA App ⚠️';
      showNikaToast(`Failed to connect to NIKA. Please ensure start-desktop.bat is running.`, true);
    }
    setTimeout(() => {
      if (label) label.textContent = 'Download This Video';
    }, 2500);
  });
}

// Start observing once DOM is ready
function initObservers() {
  if (isWhatsAppWeb() && window !== window.top) {
    return; // Never run sniffer in WhatsApp iframes
  }
  observeVideos();
  initWhatsAppStatusObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObservers);
} else {
  initObservers();
}
