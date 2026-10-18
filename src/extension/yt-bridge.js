/**
 * REA-IDM YouTube In-Page Stream Bridge
 * Injected into MAIN_WORLD to hook player responses and stream metadata directly,
 * exactly like Internet Download Manager (IDM)'s document.js architecture.
 */
(() => {
  if (window.__rea_idm_yt_bridge__) return;
  window.__rea_idm_yt_bridge__ = true;

  const ITAG_METAS = {
    18: { quality: '360p', ext: 'mp4', type: 'video', label: '360p MP4 (Video + Audio)', hasAudio: true },
    22: { quality: '720p HD', ext: 'mp4', type: 'video', label: '720p HD MP4 (Video + Audio)', hasAudio: true },
    137: { quality: '1080p FHD', ext: 'mp4', type: 'video', label: '1080p Full HD (MP4)', hasAudio: false },
    248: { quality: '1080p FHD', ext: 'webm', type: 'video', label: '1080p Full HD (WebM)', hasAudio: false },
    136: { quality: '720p HD', ext: 'mp4', type: 'video', label: '720p HD (MP4)', hasAudio: false },
    247: { quality: '720p HD', ext: 'webm', type: 'video', label: '720p HD (WebM)', hasAudio: false },
    135: { quality: '480p', ext: 'mp4', type: 'video', label: '480p (MP4)', hasAudio: false },
    244: { quality: '480p', ext: 'webm', type: 'video', label: '480p (WebM)', hasAudio: false },
    134: { quality: '360p', ext: 'mp4', type: 'video', label: '360p (MP4)', hasAudio: false },
    243: { quality: '360p', ext: 'webm', type: 'video', label: '360p (WebM)', hasAudio: false },
    133: { quality: '240p', ext: 'mp4', type: 'video', label: '240p (MP4)', hasAudio: false },
    140: { quality: '128k', ext: 'm4a', type: 'audio', label: 'Audio M4A (128 kbps)', hasAudio: true },
    251: { quality: '160k', ext: 'webm', type: 'audio', label: 'Audio Opus (160 kbps)', hasAudio: true },
    250: { quality: '70k', ext: 'webm', type: 'audio', label: 'Audio Opus (70 kbps)', hasAudio: true },
    249: { quality: '50k', ext: 'webm', type: 'audio', label: 'Audio Opus (50 kbps)', hasAudio: true }
  };

  let lastVideoId = '';

  function cleanVideoTitle(raw) {
    if (!raw) return document.title.replace(/- YouTube$/i, '').trim() || 'YouTube Video';
    return raw.replace(/- YouTube$/i, '').trim();
  }

  function parseCipher(cipherStr) {
    if (!cipherStr) return null;
    try {
      const sp = new URLSearchParams(cipherStr);
      const url = sp.get('url');
      const sig = sp.get('s');
      const sigParam = sp.get('sp') || 'signature';
      if (!url) return null;
      if (sig) {
        return url + (url.includes('?') ? '&' : '?') + `${sigParam}=${encodeURIComponent(sig)}`;
      }
      return url;
    } catch {
      return null;
    }
  }

  function processStreamingData(streamingData, videoTitle, videoId) {
    if (!streamingData) return;

    const rawFormats = [
      ...(streamingData.formats || []),
      ...(streamingData.adaptiveFormats || [])
    ];

    if (rawFormats.length === 0) return;

    const extracted = [];
    const title = cleanVideoTitle(videoTitle);

    for (const f of rawFormats) {
      let streamUrl = f.url || parseCipher(f.signatureCipher || f.cipher);
      if (!streamUrl) continue;

      // Disallow blob URLs
      if (streamUrl.startsWith('blob:')) continue;

      const itag = f.itag;
      const meta = ITAG_METAS[itag] || {
        quality: f.qualityLabel || `${f.height || ''}p`,
        ext: f.mimeType?.includes('webm') ? 'webm' : (f.mimeType?.includes('audio') ? 'm4a' : 'mp4'),
        type: f.mimeType?.includes('audio') ? 'audio' : 'video',
        label: `${f.qualityLabel || ''} ${f.mimeType?.includes('audio') ? 'Audio' : 'Video'}`.trim(),
        hasAudio: !!(f.audioChannels || f.mimeType?.includes('mp4a') || f.mimeType?.includes('opus'))
      };

      const clen = parseInt(f.contentLength, 10) || 0;

      extracted.push({
        url: streamUrl,
        itag,
        quality: f.qualityLabel || meta.quality,
        label: meta.label,
        ext: meta.ext,
        type: meta.type,
        hasAudio: meta.hasAudio,
        contentType: f.mimeType || 'video/mp4',
        contentLength: clen,
        title,
        videoId: videoId || lastVideoId,
        isYouTube: true,
        timestamp: Date.now()
      });
    }

    if (extracted.length > 0) {
      window.postMessage({
        type: 'REA_IDM_YT_STREAM_DATA',
        streams: extracted,
        title,
        videoId: videoId || lastVideoId
      }, '*');
    }
  }

  const LEVEL_METAS = {
    'highres': { quality: '4320p 8K', label: '8K Ultra HD (WebM)', ext: 'webm' },
    'hd2880': { quality: '2880p 5K', label: '5K Ultra HD (WebM)', ext: 'webm' },
    'hd2160': { quality: '2160p 4K', label: '4K Ultra HD (WebM)', ext: 'webm' },
    'hd1440': { quality: '1440p 2K', label: '1440p 2K Quad HD (WebM)', ext: 'webm' },
    'hd1080': { quality: '1080p FHD', label: '1080p Full HD (MP4)', ext: 'mp4' },
    'hd720': { quality: '720p HD', label: '720p HD (MP4)', ext: 'mp4' },
    'large': { quality: '480p', label: '480p Standard (MP4)', ext: 'mp4' },
    'medium': { quality: '360p', label: '360p (MP4)', ext: 'mp4' },
    'small': { quality: '240p', label: '240p (MP4)', ext: 'mp4' },
    'tiny': { quality: '144p', label: '144p (MP4)', ext: 'mp4' }
  };

  function extractFromDOM() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const vId = urlParams.get('v') || '';
      if (vId) lastVideoId = vId;

      const player = document.getElementById('movie_player');
      let resp = null;

      if (player && typeof player.getPlayerResponse === 'function') {
        resp = player.getPlayerResponse();
      }

      if (!resp && window.ytInitialPlayerResponse) {
        resp = window.ytInitialPlayerResponse;
      }

      if (resp && resp.streamingData) {
        processStreamingData(resp.streamingData, resp.videoDetails?.title, vId);
      }

      // Query available quality levels and quality data directly from HTML5 movie_player API
      if (player) {
        let availableLevels = [];
        if (typeof player.getAvailableQualityLevels === 'function') {
          availableLevels = (player.getAvailableQualityLevels() || []).filter(l => l && l !== 'auto');
        }

        const title = cleanVideoTitle(player?.getVideoData?.()?.title || resp?.videoDetails?.title);

        if (availableLevels.length > 0) {
          const levelItems = availableLevels.map(lvl => ({
            level: lvl,
            ...(LEVEL_METAS[lvl] || { quality: lvl, label: lvl, ext: 'mp4' })
          }));

          window.postMessage({
            type: 'REA_IDM_YT_AVAILABLE_LEVELS',
            levels: levelItems,
            title,
            videoId: vId || lastVideoId
          }, '*');
        }

        // Also check if getAvailableQualityData() exposes direct URLs
        if (typeof player.getAvailableQualityData === 'function') {
          const qData = player.getAvailableQualityData();
          if (Array.isArray(qData) && qData.length > 0) {
            const qExtracted = [];
            for (const q of qData) {
              if (q && q.url && !q.url.startsWith('blob:')) {
                qExtracted.push({
                  url: q.url,
                  itag: q.formatId || q.itag,
                  quality: q.qualityLabel || q.quality,
                  label: `${q.qualityLabel || q.quality} Video`,
                  ext: 'mp4',
                  type: 'video',
                  hasAudio: false,
                  contentType: 'video/mp4',
                  contentLength: 0,
                  title,
                  videoId: vId || lastVideoId,
                  isYouTube: true,
                  timestamp: Date.now()
                });
              }
            }
            if (qExtracted.length > 0) {
              window.postMessage({
                type: 'REA_IDM_YT_STREAM_DATA',
                streams: qExtracted,
                title,
                videoId: vId || lastVideoId
              }, '*');
            }
          }
        }
      }
    } catch (err) {
      console.warn('[REA-IDM] Error extracting YouTube streams from DOM:', err);
    }
  }

  // Hook window.fetch to capture dynamic player responses (just like IDM's document.js)
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);
    try {
      const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (typeof reqUrl === 'string' && reqUrl.includes('/youtubei/v1/player')) {
        const clone = res.clone();
        clone.json().then(data => {
          if (data && data.streamingData) {
            processStreamingData(data.streamingData, data.videoDetails?.title, data.videoDetails?.videoId);
          }
        }).catch(() => {});
      }
    } catch (e) {}
    return res;
  };

  // Hook XMLHttpRequest as secondary fallback
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._rea_url = url;
    return origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._rea_url && typeof this._rea_url === 'string' && this._rea_url.includes('/youtubei/v1/player')) {
      this.addEventListener('load', () => {
        try {
          const data = JSON.parse(this.responseText);
          if (data && data.streamingData) {
            processStreamingData(data.streamingData, data.videoDetails?.title, data.videoDetails?.videoId);
          }
        } catch {}
      });
    }
    return origSend.apply(this, args);
  };

  // Listen for queries and quality trigger requests from content script
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'REA_IDM_QUERY_YT') {
      extractFromDOM();
    } else if (event.data?.type === 'REA_IDM_TRIGGER_QUALITY') {
      const level = event.data.level;
      const player = document.getElementById('movie_player');
      if (player && level) {
        try {
          if (typeof player.setPlaybackQualityRange === 'function') {
            player.setPlaybackQualityRange(level, level);
          }
          if (typeof player.setPlaybackQuality === 'function') {
            player.setPlaybackQuality(level);
          }
        } catch (e) {}
      }
    }
  });

  // Watch YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(extractFromDOM, 500);
    setTimeout(extractFromDOM, 1500);
    setTimeout(extractFromDOM, 3000);
  });

  // Run on load and after short tick
  extractFromDOM();
  setTimeout(extractFromDOM, 1000);
  setTimeout(extractFromDOM, 2500);
  setTimeout(extractFromDOM, 4500);
})();

