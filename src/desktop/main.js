import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, clipboard, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QueueManager } from '../core/queue-manager.js';
import { ReaBridgeServer } from '../bridge/server.js';
import { parseChangelog } from '../../scripts/changelog.js';
import { logger } from '../core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
const downloadWindows = new Map(); // taskId -> BrowserWindow
let tray = null;
let queueManager = null;
let bridgeServer = null;
let clipboardInterval = null;
let lastClipboardText = '';
let windowStateSaveTimeout = null;

// Process-level error resilience: Prevent transient network/library assertions from crashing UI
process.on('uncaughtException', (err) => {
  if (err && (err.message?.includes('assert(!this.paused)') || (err.name === 'AssertionError' && err.stack?.includes('undici')))) {
    logger.warn('ENGINE', `Handled transient socket assertion during connection termination: ${err.message}`);
    return;
  }
  logger.error('MAIN', `Uncaught Exception in Main Process: ${err.message}`, err);
});

process.on('unhandledRejection', (reason) => {
  if (reason && (typeof reason === 'object' && reason.message?.includes('assert(!this.paused)'))) {
    return;
  }
  logger.error('MAIN', `Unhandled Rejection in Main Process: ${reason?.message || reason}`, reason);
});

// Downloadable file extensions for clipboard sniffer
const SNIFFER_EXTENSIONS = [
  '.zip', '.rar', '.7z', '.tar', '.gz', '.iso',
  '.exe', '.msi', '.apk', '.appx', '.dmg',
  '.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m3u8', '.mpd',
  '.mp3', '.aac', '.flac', '.wav',
  '.pdf', '.epub', '.docx', '.xlsx'
];

function getAppVersion() {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || app.getVersion();
  } catch {
    return app.getVersion();
  }
}

async function initializeApp() {
  logger.info('MAIN', `Starting NIKA DOWNLOADER Desktop v${getAppVersion()}...`);

  // Initialize Core Queue Manager & Bridge Server
  queueManager = new QueueManager();
  await queueManager.init();

  bridgeServer = new ReaBridgeServer(queueManager, { port: 41719 });
  bridgeServer.start();
  logger.info('BRIDGE', 'WebSocket IPC Bridge listening on ws://127.0.0.1:41719');

  createMainWindow();
  createTray();
  startClipboardMonitor();
  setupIpcHandlers();
  forwardQueueEvents();
}

let isExiting = false;

async function exitApp() {
  if (isExiting) return;
  isExiting = true;
  app.isQuitting = true;
  logger.info('MAIN', 'Initiating graceful application shutdown...');

  // Save latest window layout state before closing
  if (windowStateSaveTimeout) {
    clearTimeout(windowStateSaveTimeout);
    windowStateSaveTimeout = null;
  }
  saveCurrentWindowState();

  if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
  }
  if (bridgeServer) {
    try { bridgeServer.stop(); } catch {}
    bridgeServer = null;
  }
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }

  // Gracefully pause downloads, write .rea-meta chunk state, and flush state store
  if (queueManager) {
    try {
      await queueManager.shutdown();
      logger.info('MAIN', 'Queue Manager state and segment metadata successfully saved');
    } catch (err) {
      logger.error('MAIN', `Error shutting down queue manager: ${err.message}`);
    }
  }

  // Close any open standalone download status windows
  for (const win of downloadWindows.values()) {
    if (win && !win.isDestroyed()) {
      try { win.destroy(); } catch {}
    }
  }
  downloadWindows.clear();

  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.destroy(); } catch {}
    mainWindow = null;
  }
  app.exit(0);
}

function isValidWindowPosition(x, y, width, height) {
  try {
    const displays = screen.getAllDisplays();
    if (!displays || displays.length === 0) return true;

    // A window is considered visible if at least 100x50 pixels of its top-left area lies within an active display
    return displays.some(display => {
      const b = display.bounds;
      const testWidth = Math.min(width, 100);
      const testHeight = Math.min(height, 50);
      return (
        x + testWidth > b.x &&
        x < b.x + b.width &&
        y + testHeight > b.y &&
        y < b.y + b.height
      );
    });
  } catch {
    return true;
  }
}

function saveCurrentWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    const isMaximized = mainWindow.isMaximized();
    let bounds;
    if (isMaximized || mainWindow.isMinimized()) {
      bounds = typeof mainWindow.getNormalBounds === 'function' 
        ? mainWindow.getNormalBounds() 
        : mainWindow.getBounds();
    } else {
      bounds = mainWindow.getBounds();
    }

    if (!bounds || !bounds.width || !bounds.height) return;

    const state = {
      width: Math.max(860, bounds.width),
      height: Math.max(560, bounds.height),
      x: bounds.x,
      y: bounds.y,
      isMaximized
    };

    queueManager?.stateStore?.saveWindowStateSync?.(state);
  } catch (err) {
    logger.warn('MAIN', `Failed to save window state: ${err.message}`);
  }
}

function debouncedSaveWindowState() {
  if (windowStateSaveTimeout) {
    clearTimeout(windowStateSaveTimeout);
  }
  windowStateSaveTimeout = setTimeout(() => {
    saveCurrentWindowState();
  }, 350);
}

function createMainWindow() {
  // Load saved window layout state
  const savedState = queueManager?.stateStore?.loadWindowStateSync?.();

  const minWidth = 860;
  const minHeight = 560;
  let width = 1140;
  let height = 720;
  let x = undefined;
  let y = undefined;

  if (savedState) {
    if (typeof savedState.width === 'number' && savedState.width >= minWidth) {
      width = savedState.width;
    }
    if (typeof savedState.height === 'number' && savedState.height >= minHeight) {
      height = savedState.height;
    }
    if (typeof savedState.x === 'number' && typeof savedState.y === 'number') {
      if (isValidWindowPosition(savedState.x, savedState.y, width, height)) {
        x = savedState.x;
        y = savedState.y;
      }
    }
  }

  const windowOptions = {
    width,
    height,
    minWidth,
    minHeight,
    backgroundColor: '#0a0d14',
    frame: false, // Clean modern frameless design with custom titlebar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (x !== undefined && y !== undefined) {
    windowOptions.x = x;
    windowOptions.y = y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (savedState?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Broadcast window maximized state changes to renderer for titlebar icon sync
  mainWindow.on('maximize', () => {
    saveCurrentWindowState();
    mainWindow?.webContents.send('event:window-maximized-state', true);
  });

  mainWindow.on('unmaximize', () => {
    saveCurrentWindowState();
    mainWindow?.webContents.send('event:window-maximized-state', false);
  });

  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);

  mainWindow.on('close', async (e) => {
    saveCurrentWindowState();
    if (!app.isQuitting) {
      e.preventDefault();
      await exitApp();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!isExiting) {
      exitApp();
    }
  });
}

function openDownloadWindow(taskId) {
  if (!taskId) return;

  if (downloadWindows.has(taskId)) {
    const existing = downloadWindows.get(taskId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return;
    }
    downloadWindows.delete(taskId);
  }

  const downloadWin = new BrowserWindow({
    width: 740,
    height: 540,
    minWidth: 620,
    minHeight: 460,
    backgroundColor: '#0a0d14',
    frame: false,
    title: 'Download Status - NIKA DOWNLOADER',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  downloadWin.loadFile(path.join(__dirname, 'renderer', 'download-window.html'), {
    query: { id: taskId }
  });

  downloadWin.on('closed', () => {
    downloadWindows.delete(taskId);
  });

  downloadWindows.set(taskId, downloadWin);
}

function createTray() {
  // Create a 16x16 icon programmatically if file not found
  const iconCanvas = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAYgz4//8/AxZ1hMRwGfD7928GvIrwGXDw4EEGRsY3DNDw5efPM9zZswckRhQGjEbEqEEYiMbBqAMGLgPevXuHrw8ZGRnxGfD//38GvIrwGXDw4EEDAwAQzCU2jW46egAAAABJRU5ErkJggg==',
    'base64'
  );
  const trayIcon = nativeImage.createFromBuffer(iconCanvas);
  tray = new Tray(trayIcon);
  tray.setToolTip('NIKA DOWNLOADER (High-Performance Download Manager)');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NIKA DOWNLOADER', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Pause All', click: () => queueManager?.pauseAll() },
    { label: 'Resume All', click: () => queueManager?.resumeAll() },
    { type: 'separator' },
    { label: 'Exit', click: () => exitApp() }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function startClipboardMonitor() {
  // IDM URL Sniffer: Monitor clipboard for downloadable links
  lastClipboardText = clipboard.readText();

  clipboardInterval = setInterval(() => {
    try {
      const text = clipboard.readText().trim();
      if (!text || text === lastClipboardText) return;
      lastClipboardText = text;

      if (text.startsWith('http://') || text.startsWith('https://')) {
        const urlLower = text.toLowerCase();
        const hasMatchingExt = SNIFFER_EXTENSIONS.some(ext => urlLower.includes(ext));

        if (hasMatchingExt && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard:url-detected', { url: text });
        }
      }
    } catch {}
  }, 1000);

  if (clipboardInterval.unref) {
    clipboardInterval.unref();
  }
}

function setupIpcHandlers() {
  ipcMain.handle('tasks:get-all', () => queueManager.getAllTasks());

  ipcMain.handle('tasks:add', async (_event, options) => {
    return await queueManager.addTask(options);
  });

  ipcMain.handle('tasks:resume', async (_event, id) => {
    await queueManager.resumeTask(id);
    return true;
  });

  ipcMain.handle('tasks:pause', async (_event, id) => {
    await queueManager.pauseTask(id);
    return true;
  });

  ipcMain.handle('tasks:remove', async (_event, { id, deleteFile }) => {
    await queueManager.removeTask(id, deleteFile);
    return true;
  });

  ipcMain.handle('tasks:pause-all', async () => {
    await queueManager.pauseAll();
    return true;
  });

  ipcMain.handle('tasks:resume-all', async () => {
    await queueManager.resumeAll();
    return true;
  });

  ipcMain.handle('tasks:set-speed-limit', async (_event, bytesPerSec) => {
    queueManager.setSpeedLimit(bytesPerSec);
    return true;
  });

  ipcMain.handle('app:get-default-dir', () => queueManager.defaultDownloadDir);
  ipcMain.handle('app:get-version', () => getAppVersion());

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('shell:open-file', async (_event, filepath) => {
    if (filepath) {
      await shell.openPath(filepath);
    }
  });

  ipcMain.handle('shell:open-folder', async (_event, filepath) => {
    if (filepath) {
      try {
        if (fs.existsSync(filepath)) {
          shell.showItemInFolder(filepath);
        } else {
          shell.openPath(path.dirname(filepath));
        }
      } catch {
        shell.openPath(path.dirname(filepath));
      }
    }
  });

  // Window Controls
  const handleMinimize = (event) => {
    const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
    win?.minimize();
  };
  const handleMaximize = (event) => {
    const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  };
  const handleClose = async (event) => {
    const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
    if (win && win !== mainWindow) {
      win.close();
      return;
    }
    await exitApp();
  };

  ipcMain.handle('window:minimize', handleMinimize);
  ipcMain.on('window:minimize', handleMinimize);

  ipcMain.handle('window:maximize', handleMaximize);
  ipcMain.on('window:maximize', handleMaximize);

  ipcMain.handle('window:close', handleClose);
  ipcMain.on('window:close', handleClose);

  ipcMain.handle('window:is-maximized', (event) => {
    const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
    return win?.isMaximized() || false;
  });

  // Standalone Download Window Handlers
  ipcMain.handle('tasks:get-task', (_event, id) => {
    return queueManager?.getTask(id) || null;
  });

  ipcMain.handle('window:open-download', (_event, taskId) => {
    openDownloadWindow(taskId);
    return true;
  });

  ipcMain.handle('window:close-download', (_event, taskId) => {
    const w = downloadWindows.get(taskId);
    if (w && !w.isDestroyed()) {
      w.close();
    }
    return true;
  });

  ipcMain.handle('window:minimize-current', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
    return true;
  });

  ipcMain.handle('window:close-current', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
    return true;
  });

  // Changelog & Release Notes
  ipcMain.handle('changelog:get', () => {
    try {
      return parseChangelog();
    } catch (err) {
      logger.error('MAIN', `Failed to parse changelog: ${err.message}`);
      return [];
    }
  });

  // Diagnostics & Logging Handlers
  ipcMain.handle('logs:get', (_event, { limit, minLevel } = {}) => {
    return logger.getRecentLogs(limit || 200, minLevel);
  });

  ipcMain.handle('logs:clear', () => {
    return logger.clearMemoryLogs();
  });

  ipcMain.handle('logs:get-path', () => {
    return logger.getLogFilePath();
  });

  ipcMain.handle('logs:open-dir', async () => {
    shell.openPath(logger.logDir);
    return true;
  });

  ipcMain.handle('logs:export', async () => {
    const defaultExportPath = path.join(app.getPath('downloads'), `nika-logs-${Date.now()}.txt`);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export NIKA Diagnostic Logs',
      defaultPath: defaultExportPath,
      filters: [{ name: 'Log Files (*.txt, *.log)', extensions: ['txt', 'log'] }]
    });

    if (!canceled && filePath) {
      await logger.exportLogs(filePath);
      return filePath;
    }
    return null;
  });

  // Temp & Cache Cleaning Handlers
  ipcMain.handle('temp:get-stats', async () => {
    return await queueManager.getIncompleteTempStats();
  });

  ipcMain.handle('temp:clean', async (_event, options) => {
    return await queueManager.clearIncompleteTemp(options);
  });

  // Settings Handlers
  ipcMain.handle('settings:get', async () => {
    return await queueManager.getSettings();
  });

  ipcMain.handle('settings:update', async (_event, newSettings) => {
    return await queueManager.updateSettings(newSettings);
  });
}

function forwardQueueEvents() {
  const broadcast = (channel, ...args) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
    for (const win of downloadWindows.values()) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    }
  };

  queueManager.on('task-added', (task) => {
    broadcast('event:task-added', task);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
    }
    if (task && (task.status === 'downloading' || task.status === 'probing')) {
      openDownloadWindow(task.id);
    }
  });

  queueManager.on('task-updated', (task) => {
    broadcast('event:task-updated', task);
  });

  queueManager.on('task-progress', (progress) => {
    broadcast('event:task-progress', progress);
  });

  queueManager.on('task-completed', (task) => {
    broadcast('event:task-completed', task);
  });

  queueManager.on('task-error', (errData) => {
    broadcast('event:task-error', errData);
  });

  queueManager.on('task-removed', (info) => {
    broadcast('event:task-removed', info);
  });

  // Forward live log entries to renderer
  logger.on('entry', (entry) => {
    mainWindow?.webContents.send('event:new-log', entry);
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

  app.whenReady().then(initializeApp);

  app.on('window-all-closed', () => {
    exitApp();
  });

  app.on('before-quit', () => {
    exitApp();
  });
}
