import { EventEmitter } from 'node:events';
import path from 'node:path';
import { probeUrl } from './probe.js';
import { calculateChunks, dynamicSplitChunk } from './chunk-calculator.js';
import { ReaStorage } from './storage.js';
import { SegmentWorker } from './segment-worker.js';
import { SpeedLimiter } from './speed-limiter.js';

/**
 * ReaDownloader - High-Performance Multi-Segment Download Orchestrator
 * Emits: 'probe', 'start', 'progress', 'chunk-complete', 'pause', 'resume', 'complete', 'error'
 */
export class ReaDownloader extends EventEmitter {
  /**
   * @param {string} url - Target file URL
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.destinationDir=process.cwd()] - Output folder
   * @param {string} [options.filename] - Custom output filename (overrides server name)
   * @param {number} [options.connections=8] - Max simultaneous connections (1-32)
   * @param {Object} [options.headers] - Custom HTTP headers
   * @param {string} [options.cookies] - Session cookies for authenticated downloads
   * @param {string} [options.referer] - Referer header
   * @param {number} [options.speedLimit=0] - Speed limit in bytes per second (0 = unlimited)
   * @param {SpeedLimiter} [options.limiter] - Shared SpeedLimiter instance
   */
  constructor(url, options = {}) {
    super();
    this.url = url;
    this.options = {
      destinationDir: options.destinationDir || process.cwd(),
      connections: Math.min(Math.max(1, options.connections || 8), 32),
      ...options
    };

    this.limiter = options.limiter || (options.speedLimit ? new SpeedLimiter(options.speedLimit) : null);
    if (this.limiter) {
      this.options.limiter = this.limiter;
    }

    this.probeInfo = null;
    this.storage = null;
    this.chunks = [];
    this.workers = [];
    this.status = 'idle'; // idle | probing | downloading | paused | completed | error
    this.abortController = null;

    // Metrics tracking
    this.totalBytes = 0;
    this.downloadedBytes = 0;
    this.startTime = 0;
    this.lastProgressTime = 0;
    this.lastDownloadedBytes = 0;
    this.currentSpeed = 0; // Bytes per second
    this.metaSaveInterval = null;
  }

  /**
   * Starts or resumes download
   * @returns {Promise<string>} Saved file path
   */
  async start() {
    if (this.status === 'downloading') {
      return this.storage?.filepath;
    }

    this.status = 'probing';
    this.abortController = new AbortController();

    try {
      // Step 1: Probe remote URL
      this.probeInfo = await probeUrl(this.url, this.options);
      this.emit('probe', this.probeInfo);

      const resolvedFilename = this.options.filename || this.probeInfo.filename;
      this.totalBytes = this.probeInfo.contentLength || 0;

      // Step 2: Initialize Storage
      this.storage = new ReaStorage(this.options.destinationDir, resolvedFilename, this.totalBytes);

      // Check for existing resume metadata
      const hasMeta = await this.storage.hasMetadata();
      let isResume = false;

      if (hasMeta) {
        const meta = await this.storage.loadMetadata();
        if (meta && meta.url === this.url && meta.totalBytes === this.totalBytes) {
          this.chunks = meta.chunks || [];
          this.downloadedBytes = this.chunks.reduce((acc, c) => acc + c.downloadedBytes, 0);
          await this.storage.openForResume();
          isResume = true;
        }
      }

      if (!isResume) {
        await this.storage.init();
        if (this.probeInfo.supportsRange && this.totalBytes > 0) {
          this.chunks = calculateChunks(this.totalBytes, this.options.connections);
        } else {
          // Server doesn't support Range requests -> single stream
          this.chunks = [{
            id: 0,
            startByte: 0,
            endByte: null,
            totalBytes: this.totalBytes,
            downloadedBytes: 0,
            currentOffset: 0,
            status: 'pending'
          }];
        }
      }

      this.status = 'downloading';
      this.startTime = Date.now();
      this.lastProgressTime = this.startTime;
      this.lastDownloadedBytes = this.downloadedBytes;

      this.emit(isResume ? 'resume' : 'start', {
        filename: resolvedFilename,
        filepath: this.storage.filepath,
        totalBytes: this.totalBytes,
        supportsRange: this.probeInfo.supportsRange,
        chunks: this.chunks.map(c => ({ ...c }))
      });

      // Periodically persist resume metadata
      this._startMetaPersistence();

      // Step 3: Launch segment workers in parallel
      const workerPromises = this.chunks.map(chunk => {
        if (chunk.status === 'completed') return Promise.resolve();

        const worker = new SegmentWorker(chunk, this.url, this.storage, this.options);
        this.workers.push(worker);

        return worker.start((bytesRead) => {
          this._handleProgress(bytesRead);
        }, this.abortController.signal).then(() => {
          this.emit('chunk-complete', { chunkId: chunk.id });
        });
      });

      await Promise.all(workerPromises);

      if (this.abortController.signal.aborted) {
        this.status = 'paused';
        this._stopMetaPersistence();
        await this._saveCurrentMeta();
        await this.storage.close();
        this.emit('pause');
        return this.storage.filepath;
      }

      // Step 4: Finalize and complete
      this._stopMetaPersistence();
      this._handleProgress(0, true);
      await this.storage.complete();
      this.status = 'completed';

      const totalTimeMs = Date.now() - this.startTime;
      const averageSpeed = totalTimeMs > 0 ? (this.downloadedBytes / (totalTimeMs / 1000)) : 0;

      const completionStats = {
        filename: resolvedFilename,
        filepath: this.storage.filepath,
        totalBytes: this.totalBytes || this.downloadedBytes,
        totalTimeMs,
        averageSpeed,
        chunksCount: this.chunks.length
      };

      this.emit('complete', completionStats);
      return this.storage.filepath;

    } catch (err) {
      this._stopMetaPersistence();
      this.status = 'error';
      if (this.storage) {
        await this._saveCurrentMeta();
        await this.storage.close();
      }
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Pauses active download
   */
  async pause() {
    if (this.status !== 'downloading') return;
    this.status = 'paused';
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Sets or updates download speed limit in bytes per second (0 = unlimited)
   * @param {number} bytesPerSecond
   */
  setSpeedLimit(bytesPerSecond) {
    if (!this.limiter) {
      this.limiter = new SpeedLimiter(bytesPerSecond);
      this.options.limiter = this.limiter;
    } else {
      this.limiter.setLimit(bytesPerSecond);
    }
  }

  /**
   * Internal progress calculator
   * @private
   */
  _handleProgress(bytesRead, force = false) {
    if (bytesRead) {
      this.downloadedBytes += bytesRead;
    }
    const now = Date.now();
    const timeDelta = (now - this.lastProgressTime) / 1000;

    // Recalculate speed every 250ms or on forced final update
    if (force || timeDelta >= 0.25) {
      const bytesDelta = this.downloadedBytes - this.lastDownloadedBytes;
      const instantSpeed = timeDelta > 0 ? (bytesDelta / timeDelta) : 0;

      // Exponential moving average for smooth display
      this.currentSpeed = this.currentSpeed === 0 
        ? instantSpeed 
        : (this.currentSpeed * 0.7) + (instantSpeed * 0.3);

      this.lastProgressTime = now;
      this.lastDownloadedBytes = this.downloadedBytes;

      const percent = this.totalBytes > 0 
        ? Math.min(100, (this.downloadedBytes / this.totalBytes) * 100) 
        : 100;

      const remainingBytes = Math.max(0, this.totalBytes - this.downloadedBytes);
      const etaSeconds = this.currentSpeed > 0 ? Math.ceil(remainingBytes / this.currentSpeed) : 0;

      this.emit('progress', {
        downloadedBytes: this.downloadedBytes,
        totalBytes: this.totalBytes,
        percent: parseFloat(percent.toFixed(2)),
        speed: Math.round(this.currentSpeed),
        eta: etaSeconds,
        chunks: this.chunks.map(c => ({
          id: c.id,
          startByte: c.startByte,
          endByte: c.endByte,
          currentOffset: c.currentOffset,
          downloadedBytes: c.downloadedBytes,
          percent: c.totalBytes ? parseFloat(((c.downloadedBytes / c.totalBytes) * 100).toFixed(1)) : 100,
          status: c.status
        }))
      });
    }
  }

  /**
   * @private
   */
  _startMetaPersistence() {
    this.metaSaveInterval = setInterval(() => {
      this._saveCurrentMeta();
    }, 1500);
  }

  /**
   * @private
   */
  _stopMetaPersistence() {
    if (this.metaSaveInterval) {
      clearInterval(this.metaSaveInterval);
      this.metaSaveInterval = null;
    }
  }

  /**
   * @private
   */
  async _saveCurrentMeta() {
    if (!this.storage || !this.probeInfo) return;
    try {
      await this.storage.saveMetadata({
        url: this.url,
        totalBytes: this.totalBytes,
        filename: this.storage.filename,
        supportsRange: this.probeInfo.supportsRange,
        chunks: this.chunks
      });
    } catch {}
  }
}
