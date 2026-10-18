/**
 * REA-IDM Extension Popup Controller
 */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const disconnectWarning = document.getElementById('disconnect-warning');
  const btnRetryConnect = document.getElementById('btn-retry-connect');
  const quickUrlInput = document.getElementById('quick-url-input');
  const btnQuickDownload = document.getElementById('btn-quick-download');
  const toggleIntercept = document.getElementById('toggle-intercept');
  const toggleSniffer = document.getElementById('toggle-sniffer');
  const mediaCount = document.getElementById('media-count');
  const mediaList = document.getElementById('media-list');
  const mediaEmpty = document.getElementById('media-empty');

  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res) {
        if (res.isConnected) {
          statusDot.className = 'dot online';
          statusText.textContent = 'Connected';
          disconnectWarning.style.display = 'none';
        } else {
          statusDot.className = 'dot';
          statusText.textContent = 'Disconnected';
          disconnectWarning.style.display = 'flex';
        }

        toggleIntercept.checked = res.settings?.interceptDownloads ?? true;
        toggleSniffer.checked = res.settings?.videoSnifferEnabled ?? true;
      }
    });
  }

  checkStatus();

  btnRetryConnect?.addEventListener('click', () => {
    statusText.textContent = 'Reconnecting...';
    chrome.runtime.sendMessage({ type: 'RECONNECT' }, () => {
      setTimeout(checkStatus, 1000);
    });
  });

  // Quick download
  btnQuickDownload?.addEventListener('click', () => {
    const url = quickUrlInput?.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      alert('Please enter a valid URL starting with http:// or https://');
      return;
    }

    btnQuickDownload.textContent = 'Sending...';
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_MEDIA',
      payload: { url }
    }, (res) => {
      if (res?.success) {
        btnQuickDownload.textContent = 'Sent! ✅';
        setTimeout(() => {
          quickUrlInput.value = '';
          btnQuickDownload.textContent = 'Download';
        }, 1500);
      } else {
        alert('Could not send to desktop app. Make sure REA-IDM is running (start-desktop.bat)!');
        btnQuickDownload.textContent = 'Download';
      }
    });
  });

  quickUrlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnQuickDownload?.click();
  });

  // Query captured media for current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const tabId = tabs[0].id;

    chrome.runtime.sendMessage({ type: 'GET_TAB_MEDIA', payload: { tabId } }, (res) => {
      const media = res?.media || [];
      mediaCount.textContent = media.length;

      if (media.length > 0) {
        mediaEmpty.style.display = 'none';
        mediaList.innerHTML = '';

        for (const item of media) {
          const label = item.label || (item.url.includes('.m3u8') ? 'HLS Stream (.m3u8)' : (item.contentType?.includes('audio') ? 'Audio Track' : 'Video Stream'));
          const qualityBadge = item.quality ? `[${item.quality}] ` : '';

          const card = document.createElement('div');
          card.className = 'media-card';
          card.innerHTML = `
            <div class="media-details">
              <span class="media-name" title="${item.url}">${qualityBadge}${label}</span>
              <span class="media-meta">${formatBytes(item.contentLength) || 'Full Stream'}</span>
            </div>
            <button class="btn-download-media">Download</button>
          `;

          card.querySelector('.btn-download-media').addEventListener('click', () => {
            const cleanTitle = tabs[0].title.replace(/\s*-\s*YouTube$/i, '').replace(/[\\/:*?"<>|]/g, '').trim() || 'video';
            const ext = item.ext || (item.contentType?.includes('audio') ? 'm4a' : (item.contentType?.includes('webm') ? 'webm' : 'mp4'));
            const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
            const qualityTag = item.quality && !item.quality.includes('Auto') ? ` [${item.quality.replace(/\s+/g, '')}]` : '';
            const filename = `${cleanTitle}${qualityTag}${dotExt}`;

            chrome.runtime.sendMessage({
              type: 'DOWNLOAD_MEDIA',
              payload: {
                url: item.url,
                filename,
                referer: tabs[0].url
              }
            }, () => {
              window.close();
            });
          });

          mediaList.appendChild(card);
        }
      }
    });
  });

  // Toggle listeners
  toggleIntercept.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'TOGGLE_SETTING',
      payload: { key: 'interceptDownloads', value: toggleIntercept.checked }
    });
  });

  toggleSniffer.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'TOGGLE_SETTING',
      payload: { key: 'videoSnifferEnabled', value: toggleSniffer.checked }
    });
  });
});
