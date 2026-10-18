import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LogLevelNames = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR'
};

class ReaLogger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.minLevel = options.minLevel !== undefined ? options.minLevel : LogLevel.DEBUG;
    this.maxMemoryLogs = options.maxMemoryLogs || 600;
    this.memoryLogs = [];
    
    // Setup log directory and file path
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.mainLogFile = path.join(this.logDir, 'rea-idm.log');
    this.errorLogFile = path.join(this.logDir, 'error.log');
    this.isInitialized = false;

    this._initLogDir();
  }

  _initLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.isInitialized = true;
    } catch (err) {
      console.error('[Logger] Failed to create log directory:', err.message);
    }
  }

  /**
   * Internal formatting and dispatch
   */
  log(level, category, message, details = null) {
    if (level < this.minLevel) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevelNames[level] || 'INFO';
    const cat = category ? `[${category.toUpperCase()}]` : '[GENERAL]';
    
    let detailsStr = '';
    if (details) {
      if (details instanceof Error) {
        detailsStr = ` | Stack: ${details.stack || details.message}`;
      } else if (typeof details === 'object') {
        try {
          detailsStr = ` | ${JSON.stringify(details)}`;
        } catch {
          detailsStr = ` | [Object]`;
        }
      } else {
        detailsStr = ` | ${details}`;
      }
    }

    const logLine = `${timestamp} [${levelName.padEnd(5)}] ${cat} ${message}${detailsStr}`;

    // 1. Console Output with appropriate console method
    if (level === LogLevel.ERROR) {
      console.error(logLine);
    } else if (level === LogLevel.WARN) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }

    const logEntry = {
      id: Date.now() + Math.random().toString(36).slice(2, 7),
      timestamp,
      level,
      levelName,
      category: category ? category.toUpperCase() : 'GENERAL',
      message,
      details: details ? (details instanceof Error ? (details.stack || details.message) : details) : null,
      raw: logLine
    };

    // 2. Memory Ring Buffer
    this.memoryLogs.push(logEntry);
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift();
    }

    // 3. File Persistence (async append)
    this._appendToFile(this.mainLogFile, logLine);
    if (level === LogLevel.ERROR) {
      this._appendToFile(this.errorLogFile, logLine);
    }

    // 4. Emit event for live UI listeners
    this.emit('entry', logEntry);
  }

  _appendToFile(filepath, line) {
    if (!this.isInitialized) return;
    fs.appendFile(filepath, line + '\n', 'utf8', (err) => {
      if (err) {
        // Fallback without recursing
      }
    });
  }

  debug(category, message, details) {
    this.log(LogLevel.DEBUG, category, message, details);
  }

  info(category, message, details) {
    this.log(LogLevel.INFO, category, message, details);
  }

  warn(category, message, details) {
    this.log(LogLevel.WARN, category, message, details);
  }

  error(category, message, details) {
    this.log(LogLevel.ERROR, category, message, details);
  }

  /**
   * Retrieves recent logs stored in memory buffer
   */
  getRecentLogs(limit = 100, minLevel = LogLevel.DEBUG) {
    let filtered = this.memoryLogs.filter(l => l.level >= minLevel);
    if (limit && limit > 0) {
      filtered = filtered.slice(-limit);
    }
    return filtered;
  }

  /**
   * Clears in-memory logs
   */
  clearMemoryLogs() {
    this.memoryLogs = [];
    return true;
  }

  /**
   * Gets absolute path of current main log file
   */
  getLogFilePath() {
    return this.mainLogFile;
  }

  /**
   * Exports full logs to target path or returns raw log content
   */
  async exportLogs(targetPath) {
    if (targetPath) {
      await fs.promises.copyFile(this.mainLogFile, targetPath);
      return targetPath;
    }
    try {
      return await fs.promises.readFile(this.mainLogFile, 'utf8');
    } catch {
      return this.memoryLogs.map(l => l.raw).join('\n');
    }
  }
}

export const logger = new ReaLogger();
