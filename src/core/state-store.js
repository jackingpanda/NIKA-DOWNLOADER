import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * StateStore - Atomic file-based state persistence for REA-IDM
 */
export class StateStore {
  /**
   * @param {string} [customPath] - Path to JSON store file
   */
  constructor(customPath) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const baseDir = process.env.APPDATA 
        ? path.join(process.env.APPDATA, 'rea-idm')
        : path.join(os.homedir(), '.rea-idm');
      this.filePath = path.join(baseDir, 'downloads.json');
    }
    this.dir = path.dirname(this.filePath);
    this.settingsPath = path.join(this.dir, 'settings.json');
    this.windowStatePath = path.join(this.dir, 'window-state.json');
  }

  /**
   * Ensures directory exists
   * @private
   */
  async _ensureDir() {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch {}
  }

  /**
   * Loads saved tasks
   * @returns {Promise<Array<Object>>}
   */
  async load() {
    try {
      await this._ensureDir();
      const content = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : (data.tasks || []);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      console.warn(`[StateStore] Warning loading state: ${err.message}. Starting fresh.`);
      return [];
    }
  }

  /**
   * Atomically saves tasks to disk
   * @param {Array<Object>} tasks - List of task objects
   * @returns {Promise<void>}
   */
  async save(tasks) {
    try {
      await this._ensureDir();
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      const serialized = JSON.stringify({
        version: '1.0',
        updatedAt: new Date().toISOString(),
        tasks: tasks.map(t => {
          const total = Number(t.totalBytes) || 0;
          const downloaded = Number(t.downloadedBytes) || 0;
          let calculatedPercent = 0;
          if (t.status === 'completed') {
            calculatedPercent = 100;
          } else if (total > 0) {
            calculatedPercent = parseFloat(Math.min(100, (downloaded / total) * 100).toFixed(1));
          } else if (typeof t.percent === 'number' && !isNaN(t.percent)) {
            calculatedPercent = t.percent;
          }

          return {
            id: t.id,
            url: t.url,
            filename: t.filename,
            savePath: t.savePath,
            destinationDir: t.destinationDir,
            totalBytes: total,
            downloadedBytes: downloaded,
            percent: calculatedPercent,
            status: (t.status === 'downloading' || t.status === 'probing') ? 'paused' : t.status, // On restart, reset running to paused
            resumable: t.resumable !== false && t.supportsRange !== false,
            connections: t.connections,
            category: t.category,
            chunks: Array.isArray(t.chunks) ? t.chunks.map(c => ({
              id: c.id,
              startByte: c.startByte,
              endByte: c.endByte,
              totalBytes: c.totalBytes,
              downloadedBytes: c.downloadedBytes,
              status: c.status
            })) : [],
            addedAt: t.addedAt,
            completedAt: t.completedAt,
            headers: t.headers,
            cookies: t.cookies,
            referer: t.referer,
            error: t.error
          };
        })
      }, null, 2);

      await fs.writeFile(tempPath, serialized, 'utf8');
      await fs.rename(tempPath, this.filePath);
    } catch (err) {
      console.error(`[StateStore] Failed to save state: ${err.message}`);
    }
  }

  /**
   * Loads application settings
   * @returns {Promise<Object|null>}
   */
  async loadSettings() {
    try {
      await this._ensureDir();
      const content = await fs.readFile(this.settingsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Saves application settings
   * @param {Object} settings
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      await this._ensureDir();
      const tempPath = `${this.settingsPath}.tmp.${Date.now()}`;
      await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf8');
      await fs.rename(tempPath, this.settingsPath);
    } catch (err) {
      console.error(`[StateStore] Failed to save settings: ${err.message}`);
    }
  }

  /**
   * Synchronously loads saved window layout state
   * @returns {Object|null}
   */
  loadWindowStateSync() {
    try {
      if (fsSync.existsSync(this.windowStatePath)) {
        const content = fsSync.readFileSync(this.windowStatePath, 'utf8');
        return JSON.parse(content);
      }
    } catch {}
    return null;
  }

  /**
   * Synchronously saves window layout state
   * @param {Object} state
   */
  saveWindowStateSync(state) {
    try {
      if (!fsSync.existsSync(this.dir)) {
        fsSync.mkdirSync(this.dir, { recursive: true });
      }
      const tempPath = `${this.windowStatePath}.tmp.${Date.now()}`;
      fsSync.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
      fsSync.renameSync(tempPath, this.windowStatePath);
    } catch (err) {
      console.error(`[StateStore] Failed to save window state: ${err.message}`);
    }
  }

  /**
   * Loads saved window layout state asynchronously
   * @returns {Promise<Object|null>}
   */
  async loadWindowState() {
    try {
      await this._ensureDir();
      const content = await fs.readFile(this.windowStatePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Saves window layout state asynchronously
   * @param {Object} state
   * @returns {Promise<void>}
   */
  async saveWindowState(state) {
    try {
      await this._ensureDir();
      const tempPath = `${this.windowStatePath}.tmp.${Date.now()}`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
      await fs.rename(tempPath, this.windowStatePath);
    } catch (err) {
      console.error(`[StateStore] Failed to save window state: ${err.message}`);
    }
  }
}

