import { EventEmitter } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { ReaDownloader } from './downloader.js';
import { StateStore } from './state-store.js';
import { SpeedLimiter } from './speed-limiter.js';
import { probeUrl } from './probe.js';
import { sanitizeFilename } from './storage.js';

const EXTENSION_CATEGORIES = {
  Videos: ['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.wmv', '.ts', '.m4v', '.m3u8', '.mpd', '.3gp'],
  Music: ['.mp3', '.aac', '.flac', '.wav', '.ogg', '.m4a', '.opus', '.wma', '.alac', '.mid'],
  Compressed: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.tgz', '.cab', '.lzma'],
  Programs: ['.exe', '.msi', '.apk', '.appx', '.dmg', '.pkg', '.deb', '.rpm', '.bat', '.cmd', '.jar'],
  Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.epub', '.csv', '.rtf', '.md']
};

/**
 * Detects download category from filename
 * @param {string} filename
 * @returns {string}
 */
export function detectCategory(filename = '') {
  const ext = path.extname(filename).toLowerCase();
  for (const [category, extensions] of Object.entries(EXTENSION_CATEGORIES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  return 'General';
}

/**
 * QueueManager - Orchestrates multiple downloads, concurrency, state, and rate limits
 */
export class QueueManager extends EventEmitter {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxConcurrent=3]
   * @param {number} [options.globalSpeedLimit=0] - Bytes/sec (0 = unlimited)
   * @param {string} [options.defaultDownloadDir]
   * @param {string} [options.stateStorePath]
   */
  constructor(options = {}) {
    super();
    this.maxConcurrent = options.maxConcurrent || 3;
    this.defaultDownloadDir = options.defaultDownloadDir || path.join(os.homedir(), 'Downloads');
    this.stateStore = new StateStore(options.stateStorePath);
    this.globalLimiter = new SpeedLimiter(options.globalSpeedLimit || 0);

    this.tasks = new Map(); // id -> task data
    this.activeDownloaders = new Map(); // id -> ReaDownloader instance
    this.isInitialized = false;
    this.settings = null;
    this.persistTimeout = null;
    this.lastPersistTime = 0;
  }

  /**
   * Initializes queue manager and restores persisted tasks
   */
  async init() {
    if (this.isInitialized) return;

    const savedTasks = await this.stateStore.load();
    for (const t of savedTasks) {
      let downloadedBytes = Number(t.downloadedBytes) || 0;
      let totalBytes = Number(t.totalBytes) || 0;
      let chunks = Array.isArray(t.chunks) ? t.chunks : [];
      let resumable = t.resumable !== false && t.supportsRange !== false;

      // Inspect .rea-meta on disk to restore exact chunk progress if available
      if (t.savePath) {
        try {
          const metaPath = `${t.savePath}.rea-meta`;
          const metaContent = await fs.readFile(metaPath, 'utf8');
          const meta = JSON.parse(metaContent);
          if (meta && meta.url === t.url) {
            if (meta.totalBytes) totalBytes = meta.totalBytes;
            if (meta.supportsRange !== undefined) resumable = !!meta.supportsRange;
            if (Array.isArray(meta.chunks) && meta.chunks.length > 0) {
              chunks = meta.chunks;
              downloadedBytes = chunks.reduce((acc, c) => acc + (c.downloadedBytes || 0), 0);
            }
          }
        } catch {}
      }

      let percent = 0;
      if (t.status === 'completed') {
        percent = 100;
        if (!downloadedBytes && totalBytes) downloadedBytes = totalBytes;
      } else if (totalBytes > 0) {
        percent = parseFloat(Math.min(100, (downloadedBytes / totalBytes) * 100).toFixed(1));
      } else if (typeof t.percent === 'number' && !isNaN(t.percent)) {
        percent = t.percent;
      }

      const sanitizedFilename = sanitizeFilename(t.filename);
      const destinationDir = t.destinationDir || this.defaultDownloadDir;
      const savePath = path.join(destinationDir, sanitizedFilename);

      this.tasks.set(t.id, {
        ...t,
        filename: sanitizedFilename,
        destinationDir,
        savePath,
        downloadedBytes,
        totalBytes,
        percent,
        resumable,
        speed: 0,
        eta: 0,
        chunks,
        status: (t.status === 'downloading' || t.status === 'probing') ? 'paused' : t.status
      });
    }

    try {
      const savedSettings = await this.stateStore.loadSettings();
      if (savedSettings) {
        if (savedSettings.defaultDownloadDir) this.defaultDownloadDir = savedSettings.defaultDownloadDir;
        if (savedSettings.maxConcurrent) this.maxConcurrent = savedSettings.maxConcurrent;
        this.settings = savedSettings;
      }
    } catch {}

    this.isInitialized = true;
    this.emit('initialized', Array.from(this.tasks.values()));
  }

  /**
   * Gets all tasks
   * @returns {Array<Object>}
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Gets task by ID
   * @param {string} id
   * @returns {Object|null}
   */
  getTask(id) {
    return this.tasks.get(id) || null;
  }

  /**
   * Adds a new download task
   * @param {Object} options
   * @param {string} options.url
   * @param {string} [options.filename]
   * @param {string} [options.destinationDir]
   * @param {number} [options.connections=8]
   * @param {Object} [options.headers]
   * @param {string} [options.cookies]
   * @param {string} [options.referer]
   * @param {boolean} [options.autoStart=true]
   * @returns {Promise<Object>} The created task
   */
  async addTask(options) {
    if (!options.url) {
      throw new Error('URL is required');
    }

    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const destinationDir = options.destinationDir || this.defaultDownloadDir;
    let filename = options.filename;

    // If filename isn't provided, extract fallback from URL path
    if (!filename) {
      try {
        const parsed = new URL(options.url);
        filename = path.basename(parsed.pathname) || 'download.bin';
      } catch {
        filename = 'download.bin';
      }
    }

    filename = sanitizeFilename(filename);
    const category = detectCategory(filename);
    const task = {
      id,
      url: options.url,
      filename,
      destinationDir,
      savePath: path.join(destinationDir, filename),
      connections: Math.min(Math.max(1, options.connections || 8), 32),
      totalBytes: 0,
      downloadedBytes: 0,
      percent: 0,
      speed: 0,
      eta: 0,
      status: 'queued', // queued | probing | downloading | paused | completed | error
      resumable: true,
      category,
      addedAt: new Date().toISOString(),
      completedAt: null,
      headers: options.headers || {},
      cookies: options.cookies || null,
      referer: options.referer || null,
      chunks: [],
      error: null
    };

    this.tasks.set(id, task);
    this.emit('task-added', task);
    await this._persist();

    if (options.autoStart !== false) {
      this._processQueue();
    }

    return task;
  }

  /**
   * Starts or resumes a task
   * @param {string} id
   */
  async resumeTask(id) {
    const task = this.tasks.get(id);
    if (!task) return;

    if (task.status === 'completed' || task.status === 'downloading') {
      return;
    }

    task.status = 'queued';
    task.error = null;
    this.emit('task-updated', task);
    await this._persist();
    this._processQueue();
  }

  /**
   * Pauses an active download
   * @param {string} id
   */
  async pauseTask(id) {
    const task = this.tasks.get(id);
    if (!task) return;

    const downloader = this.activeDownloaders.get(id);
    if (downloader) {
      await downloader.pause();
      this.activeDownloaders.delete(id);
    }

    task.status = 'paused';
    task.speed = 0;
    task.eta = 0;
    this.emit('task-updated', task);
    await this._persist();
    this._processQueue();
  }

  /**
   * Cancels and removes a task
   * @param {string} id
   * @param {boolean} [deleteFile=false]
   */
  async removeTask(id, deleteFile = false) {
    const task = this.tasks.get(id);
    if (!task) {
      // Even if task is not found in memory, emit task-removed and persist to keep all clients in sync
      this.emit('task-removed', { id, deleteFile });
      await this._persist();
      return;
    }

    await this.pauseTask(id);

    // Auto clean temp & cache files for incomplete downloads if setting enabled or deleteFile requested
    const autoClean = this.settings ? this.settings.autoCleanTempOnDelete !== false : true;
    const shouldDeleteDisk = deleteFile || (autoClean && task.status !== 'completed');

    if (shouldDeleteDisk && task.savePath) {
      try {
        await fs.unlink(task.savePath);
      } catch {}
      try {
        await fs.unlink(`${task.savePath}.rea-meta`);
      } catch {}
    }

    this.tasks.delete(id);
    this.emit('task-removed', { id, deleteFile });
    await this._persist();
    this._processQueue();
  }

  /**
   * Pauses all downloading tasks
   */
  async pauseAll() {
    const activeIds = Array.from(this.activeDownloaders.keys());
    for (const id of activeIds) {
      await this.pauseTask(id);
    }
  }

  /**
   * Resumes all paused/queued tasks
   */
  async resumeAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'paused' || task.status === 'error') {
        task.status = 'queued';
        task.error = null;
        this.emit('task-updated', task);
      }
    }
    await this._persist();
    this._processQueue();
  }

  /**
   * Sets global download rate limit in bytes per second
   * @param {number} bytesPerSec (0 = unlimited)
   */
  setSpeedLimit(bytesPerSec) {
    this.globalLimiter.setLimit(bytesPerSec);
    this.emit('speed-limit-changed', bytesPerSec);
  }

  /**
   * Internal queue processor loop
   * @private
   */
  async _processQueue() {
    const activeCount = this.activeDownloaders.size;
    const availableSlots = this.maxConcurrent - activeCount;

    if (availableSlots <= 0) return;

    // Find next queued tasks
    const queuedTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'queued')
      .slice(0, availableSlots);

    for (const task of queuedTasks) {
      this._startTaskDownload(task);
    }
  }

  /**
   * Executes download for a single task
   * @private
   */
  async _startTaskDownload(task) {
    if (this.activeDownloaders.has(task.id)) return;

    task.filename = sanitizeFilename(task.filename);
    task.savePath = path.join(task.destinationDir, task.filename);
    task.status = 'downloading';
    this.emit('task-updated', task);

    const downloader = new ReaDownloader(task.url, {
      destinationDir: task.destinationDir,
      filename: task.filename,
      connections: task.connections,
      headers: task.headers,
      cookies: task.cookies,
      referer: task.referer,
      limiter: this.globalLimiter
    });

    this.activeDownloaders.set(task.id, downloader);

    downloader.on('probe', (probeInfo) => {
      if ((!task.filename || task.filename === 'download.bin' || task.filename.startsWith('download-') || !path.extname(task.filename) || task.filename === 'videoplayback') && probeInfo.filename && path.extname(probeInfo.filename)) {
        task.filename = sanitizeFilename(probeInfo.filename);
      }
      task.savePath = path.join(task.destinationDir, task.filename);
      task.category = detectCategory(task.filename);
      task.totalBytes = probeInfo.contentLength || task.totalBytes;
      task.resumable = !!probeInfo.supportsRange;
      if (task.totalBytes > 0 && task.downloadedBytes > 0) {
        task.percent = parseFloat(Math.min(100, (task.downloadedBytes / task.totalBytes) * 100).toFixed(1));
      }
      this.emit('task-updated', task);
      this._persistThrottled();
    });

    downloader.on('start', (info) => {
      task.totalBytes = info.totalBytes || task.totalBytes;
      task.savePath = info.filepath;
      this.emit('task-updated', task);
    });

    downloader.on('progress', (progress) => {
      task.downloadedBytes = progress.downloadedBytes;
      task.totalBytes = progress.totalBytes;
      task.percent = progress.percent;
      task.speed = progress.speed;
      task.eta = progress.eta;
      task.chunks = progress.chunks;

      this.emit('task-progress', {
        id: task.id,
        percent: task.percent,
        downloadedBytes: task.downloadedBytes,
        totalBytes: task.totalBytes,
        speed: task.speed,
        eta: task.eta,
        chunks: task.chunks
      });

      this._persistThrottled();
    });

    downloader.on('complete', async (stats) => {
      this.activeDownloaders.delete(task.id);
      task.status = 'completed';
      task.percent = 100;
      task.speed = 0;
      task.eta = 0;
      task.completedAt = new Date().toISOString();
      task.downloadedBytes = stats.totalBytes;
      task.totalBytes = stats.totalBytes;

      this.emit('task-completed', task);
      await this._persist();
      this._processQueue();
    });

    downloader.on('error', async (err) => {
      this.activeDownloaders.delete(task.id);
      if (task.status !== 'paused') {
        task.status = 'error';
        task.error = err.message;
        task.speed = 0;
        this.emit('task-error', { id: task.id, error: err.message });
      }
      await this._persist();
      this._processQueue();
    });

    downloader.on('pause', async () => {
      this.activeDownloaders.delete(task.id);
      task.status = 'paused';
      task.speed = 0;
      task.eta = 0;
      this.emit('task-updated', task);
      await this._persist();
      this._processQueue();
    });

    try {
      await downloader.start();
    } catch {}
  }

  /**
   * Persists task list
   * @private
   */
  async _persist() {
    await this.stateStore.save(Array.from(this.tasks.values()));
  }

  /**
   * Throttled task list persistence during active downloads (at most once every 2 seconds)
   * @private
   */
  _persistThrottled() {
    const now = Date.now();
    if (this.persistTimeout) return;
    const timeSinceLast = now - this.lastPersistTime;
    if (timeSinceLast >= 2000) {
      this.lastPersistTime = now;
      this._persist().catch(() => {});
    } else {
      this.persistTimeout = setTimeout(() => {
        this.persistTimeout = null;
        this.lastPersistTime = Date.now();
        this._persist().catch(() => {});
      }, 2000 - timeSinceLast);
    }
  }

  /**
   * Gracefully shuts down the queue manager
   * Pauses all running downloads, saves chunk metadata, and flushes state store
   */
  async shutdown() {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
      this.persistTimeout = null;
    }

    const activeEntries = Array.from(this.activeDownloaders.entries());
    for (const [id, downloader] of activeEntries) {
      try {
        await downloader.pause();
      } catch {}
      this.activeDownloaders.delete(id);

      const task = this.tasks.get(id);
      if (task) {
        task.status = 'paused';
        task.speed = 0;
        task.eta = 0;
      }
    }

    for (const task of this.tasks.values()) {
      if (task.status === 'downloading' || task.status === 'probing') {
        task.status = 'paused';
        task.speed = 0;
        task.eta = 0;
      }
    }

    await this._persist();
  }

  /**
   * Scans disk and queue for incomplete downloads and reclaimable temp/cache files
   * @returns {Promise<Object>} Statistics of incomplete/temp files
   */
  async getIncompleteTempStats() {
    let totalBytes = 0;
    const incompleteTasks = [];
    const activeFilepaths = new Set();

    // 1. Check all non-completed tasks in queue
    for (const task of this.tasks.values()) {
      if (task.savePath) {
        activeFilepaths.add(path.resolve(task.savePath).toLowerCase());
        activeFilepaths.add(path.resolve(`${task.savePath}.rea-meta`).toLowerCase());
      }

      if (task.status !== 'completed' && task.savePath) {
        let fileBytes = 0;
        let hasFile = false;
        let hasMeta = false;

        try {
          const fileStat = await fs.stat(task.savePath);
          fileBytes += fileStat.size;
          hasFile = true;
        } catch {}

        try {
          const metaStat = await fs.stat(`${task.savePath}.rea-meta`);
          fileBytes += metaStat.size;
          hasMeta = true;
        } catch {}

        if (hasFile || hasMeta || task.downloadedBytes > 0) {
          totalBytes += fileBytes;
          incompleteTasks.push({
            id: task.id,
            filename: task.filename,
            category: task.category,
            status: task.status,
            savePath: task.savePath,
            destinationDir: task.destinationDir,
            diskBytes: fileBytes,
            downloadedBytes: task.downloadedBytes,
            totalBytes: task.totalBytes,
            percent: task.percent,
            hasFile,
            hasMeta
          });
        }
      }
    }

    // 2. Scan defaultDownloadDir and known task destination directories for orphaned .rea-meta files
    const orphanedFiles = [];
    const dirsToScan = new Set([this.defaultDownloadDir]);
    for (const task of this.tasks.values()) {
      if (task.destinationDir) {
        dirsToScan.add(task.destinationDir);
      }
    }

    for (const dir of dirsToScan) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.rea-meta') || entry.name.endsWith('.tmp') || entry.name.includes('.tmp.'))) {
            const fullPath = path.join(dir, entry.name);
            const lowerPath = path.resolve(fullPath).toLowerCase();
            if (!activeFilepaths.has(lowerPath)) {
              try {
                const s = await fs.stat(fullPath);
                totalBytes += s.size;
                orphanedFiles.push({
                  filename: entry.name,
                  filepath: fullPath,
                  size: s.size
                });
              } catch {}
            }
          }
        }
      } catch {}
    }

    return {
      totalBytes,
      incompleteTasksCount: incompleteTasks.length,
      orphanedFilesCount: orphanedFiles.length,
      incompleteTasks,
      orphanedFiles
    };
  }

  /**
   * Cleans up temporary, cached, and incomplete download files from disk
   * @param {Object} [options={}]
   * @param {Array<string>} [options.taskIds] - Task IDs to clean (if empty, cleans all incomplete)
   * @param {boolean} [options.removeTasks=false] - Whether to remove tasks from queue (true) or reset to 0% (false)
   * @param {boolean} [options.cleanOrphaned=true] - Clean orphaned .rea-meta files
   * @returns {Promise<Object>} Summary of freed bytes and cleaned items
   */
  async clearIncompleteTemp(options = {}) {
    const { taskIds, removeTasks = false, cleanOrphaned = true } = options;
    let freedBytes = 0;
    let cleanedFilesCount = 0;
    const affectedTaskIds = [];

    const targetTasks = taskIds && taskIds.length > 0
      ? taskIds.map(id => this.tasks.get(id)).filter(t => t && t.status !== 'completed')
      : Array.from(this.tasks.values()).filter(t => t.status !== 'completed');

    for (const task of targetTasks) {
      // Pause if currently downloading
      if (this.activeDownloaders.has(task.id)) {
        await this.pauseTask(task.id);
      }

      if (task.savePath) {
        try {
          const s = await fs.stat(task.savePath);
          freedBytes += s.size;
          await fs.unlink(task.savePath);
          cleanedFilesCount++;
        } catch {}

        try {
          const ms = await fs.stat(`${task.savePath}.rea-meta`);
          freedBytes += ms.size;
          await fs.unlink(`${task.savePath}.rea-meta`);
          cleanedFilesCount++;
        } catch {}
      }

      affectedTaskIds.push(task.id);

      if (removeTasks) {
        this.tasks.delete(task.id);
        this.emit('task-removed', { id: task.id, deleteFile: true });
      } else {
        // Reset task progress so it can be cleanly downloaded from scratch if needed
        task.downloadedBytes = 0;
        task.percent = 0;
        task.chunks = [];
        task.status = 'queued';
        task.speed = 0;
        task.eta = 0;
        task.error = null;
        this.emit('task-updated', task);
      }
    }

    // Clean orphaned metadata files
    if (cleanOrphaned) {
      const stats = await this.getIncompleteTempStats();
      for (const orphaned of stats.orphanedFiles) {
        try {
          await fs.unlink(orphaned.filepath);
          freedBytes += orphaned.size;
          cleanedFilesCount++;
        } catch {}
      }
    }

    await this._persist();
    return {
      freedBytes,
      cleanedFilesCount,
      affectedTasksCount: affectedTaskIds.length
    };
  }

  /**
   * Retrieves active settings
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const saved = await this.stateStore.loadSettings();
    return {
      defaultDownloadDir: this.defaultDownloadDir,
      maxConcurrent: this.maxConcurrent,
      autoCleanTempOnDelete: true,
      autoCleanOnCancel: false,
      ...(saved || {})
    };
  }

  /**
   * Updates application settings
   * @param {Object} newSettings
   * @returns {Promise<Object>}
   */
  async updateSettings(newSettings) {
    const current = await this.getSettings();
    const merged = { ...current, ...newSettings };
    if (merged.defaultDownloadDir) {
      this.defaultDownloadDir = merged.defaultDownloadDir;
    }
    if (merged.maxConcurrent) {
      this.maxConcurrent = Math.max(1, Math.min(10, parseInt(merged.maxConcurrent, 10) || 3));
    }
    this.settings = merged;
    await this.stateStore.saveSettings(merged);
    return merged;
  }
}
