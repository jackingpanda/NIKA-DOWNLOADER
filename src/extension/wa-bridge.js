/**
 * NIKA DOWNLOADER WhatsApp Web In-Page Media Bridge
 * Runs in MAIN_WORLD to hook into WhatsApp Web's execution context,
 * fetch in-memory blob streams directly without MV3 isolated-world restrictions,
 * and convert media buffers to Base64 for the NIKA engine.
 */
(() => {
  if (window.__nika_wa_bridge__) return;
  window.__nika_wa_bridge__ = true;

  window.addEventListener('message', async (event) => {
    if (!event.data || event.data.type !== 'NIKA_WA_FETCH_BLOB') return;

    const { id, url, filename, contentType } = event.data;

    try {
      // In MAIN_WORLD, fetch(blob:...) succeeds natively because the blob was created in this same context!
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const reader = new FileReader();

      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const base64Data = result.split(',')[1];
          window.postMessage({
            type: 'NIKA_WA_BLOB_RESULT',
            id,
            success: true,
            base64Data,
            filename,
            contentType: blob.type || contentType || (filename?.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg')
          }, '*');
        } else {
          window.postMessage({
            type: 'NIKA_WA_BLOB_RESULT',
            id,
            success: false,
            error: 'Failed to convert blob to Base64',
            filename
          }, '*');
        }
      };

      reader.onerror = () => {
        window.postMessage({
          type: 'NIKA_WA_BLOB_RESULT',
          id,
          success: false,
          error: reader.error?.message || 'FileReader error',
          filename
        }, '*');
      };

      reader.readAsDataURL(blob);
    } catch (err) {
      window.postMessage({
        type: 'NIKA_WA_BLOB_RESULT',
        id,
        success: false,
        error: err.message || 'Fetch failed',
        filename
      }, '*');
    }
  });
})();
