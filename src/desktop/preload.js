const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reaIdm', {
  getAllTasks: () => ipcRenderer.invoke('tasks:get-all'),
  addTask: (options) => ipcRenderer.invoke('tasks:add', options),
  resumeTask: (id) => ipcRenderer.invoke('tasks:resume', id),
  pauseTask: (id) => ipcRenderer.invoke('tasks:pause', id),
  removeTask: (id, deleteFile) => ipcRenderer.invoke('tasks:remove', { id, deleteFile }),
  pauseAll: () => ipcRenderer.invoke('tasks:pause-all'),
  resumeAll: () => ipcRenderer.invoke('tasks:resume-all'),
  setSpeedLimit: (bytesPerSec) => ipcRenderer.invoke('tasks:set-speed-limit', bytesPerSec),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  openFile: (filepath) => ipcRenderer.invoke('shell:open-file', filepath),
  openFolder: (filepath) => ipcRenderer.invoke('shell:open-folder', filepath),
  getDefaultDownloadDir: () => ipcRenderer.invoke('app:get-default-dir'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Changelog & Release Notes
  getChangelog: () => ipcRenderer.invoke('changelog:get'),

  // Diagnostics & Logging
  getLogs: (options) => ipcRenderer.invoke('logs:get', options),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  getLogFilePath: () => ipcRenderer.invoke('logs:get-path'),
  openLogDir: () => ipcRenderer.invoke('logs:open-dir'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),

  // Temp & Cache Cleaning & Settings
  getTempStats: () => ipcRenderer.invoke('temp:get-stats'),
  clearIncompleteTemp: (options) => ipcRenderer.invoke('temp:clean', options),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (newSettings) => ipcRenderer.invoke('settings:update', newSettings),

  // Listeners
  onNewLog: (callback) => {
    const handler = (_event, logEntry) => callback(logEntry);
    ipcRenderer.on('event:new-log', handler);
    return () => ipcRenderer.removeListener('event:new-log', handler);
  },
  onTaskAdded: (callback) => {
    const handler = (_event, task) => callback(task);
    ipcRenderer.on('event:task-added', handler);
    return () => ipcRenderer.removeListener('event:task-added', handler);
  },
  onTaskUpdated: (callback) => {
    const handler = (_event, task) => callback(task);
    ipcRenderer.on('event:task-updated', handler);
    return () => ipcRenderer.removeListener('event:task-updated', handler);
  },
  onTaskProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('event:task-progress', handler);
    return () => ipcRenderer.removeListener('event:task-progress', handler);
  },
  onTaskCompleted: (callback) => {
    const handler = (_event, task) => callback(task);
    ipcRenderer.on('event:task-completed', handler);
    return () => ipcRenderer.removeListener('event:task-completed', handler);
  },
  onTaskError: (callback) => {
    const handler = (_event, err) => callback(err);
    ipcRenderer.on('event:task-error', handler);
    return () => ipcRenderer.removeListener('event:task-error', handler);
  },
  onTaskRemoved: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('event:task-removed', handler);
    return () => ipcRenderer.removeListener('event:task-removed', handler);
  },
  onClipboardUrl: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('clipboard:url-detected', handler);
    return () => ipcRenderer.removeListener('clipboard:url-detected', handler);
  },
  onWindowMaximizeState: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('event:window-maximized-state', handler);
    return () => ipcRenderer.removeListener('event:window-maximized-state', handler);
  }
});
