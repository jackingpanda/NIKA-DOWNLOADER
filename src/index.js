export { ReaDownloader } from './core/downloader.js';
export { probeUrl } from './core/probe.js';
export { calculateChunks, dynamicSplitChunk } from './core/chunk-calculator.js';
export { ReaStorage } from './core/storage.js';
export { SegmentWorker } from './core/segment-worker.js';
export { QueueManager, detectCategory } from './core/queue-manager.js';
export { SpeedLimiter } from './core/speed-limiter.js';
export { StateStore } from './core/state-store.js';
export { ReaBridgeServer } from './bridge/server.js';

import { ReaDownloader } from './core/downloader.js';

/**
 * Convenience helper to download a file with one line of code
 * @param {string} url - Target URL
 * @param {Object} [options={}] - Options (destinationDir, filename, connections)
 * @returns {Promise<string>} Saved file path
 */
export async function download(url, options = {}) {
  const downloader = new ReaDownloader(url, options);
  return await downloader.start();
}
