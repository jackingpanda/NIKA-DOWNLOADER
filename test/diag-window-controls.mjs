/**
 * Diagnostic: Launch actual REA-IDM app and capture button interaction info.
 * Run from project root: npx electron test/diag-window-controls.mjs
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('=== REA-IDM Window Controls Diagnostic ===');
console.log('Electron:', process.versions.electron);
console.log('Platform:', process.platform, process.arch);
console.log('Project:', projectRoot);

app.whenReady().then(async () => {
  const preloadPath = path.join(projectRoot, 'src', 'desktop', 'preload.js');
  const htmlPath = path.join(projectRoot, 'src', 'desktop', 'renderer', 'index.html');
  
  console.log('Preload:', preloadPath);
  console.log('HTML:', htmlPath);
  
  // Create window with EXACT same config as main.js
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    backgroundColor: '#0a0d14',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  // Register window control IPC
  ipcMain.handle('window:minimize', () => { console.log('>>> IPC RECEIVED: window:minimize'); win?.minimize(); });
  ipcMain.handle('window:maximize', () => { console.log('>>> IPC RECEIVED: window:maximize'); });
  ipcMain.handle('window:close', () => { console.log('>>> IPC RECEIVED: window:close'); app.exit(0); });
  ipcMain.on('window:minimize', () => { console.log('>>> IPC-SEND RECEIVED: window:minimize'); });
  ipcMain.on('window:maximize', () => { console.log('>>> IPC-SEND RECEIVED: window:maximize'); });
  ipcMain.on('window:close', () => { console.log('>>> IPC-SEND RECEIVED: window:close'); app.exit(0); });

  // Stub other IPC
  ipcMain.handle('tasks:get-all', () => []);
  ipcMain.handle('tasks:add', () => ({ id: 'stub' }));
  ipcMain.handle('tasks:resume', () => true);
  ipcMain.handle('tasks:pause', () => true);
  ipcMain.handle('tasks:remove', () => true);
  ipcMain.handle('tasks:pause-all', () => true);
  ipcMain.handle('tasks:resume-all', () => true);
  ipcMain.handle('tasks:set-speed-limit', () => true);
  ipcMain.handle('dialog:select-folder', () => null);
  ipcMain.handle('shell:open-file', () => {});
  ipcMain.handle('shell:open-folder', () => {});

  win.loadFile(htmlPath);
  
  win.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded OK');
    
    // Open devtools
    win.webContents.openDevTools({ mode: 'bottom' });
    
    win.webContents.executeJavaScript(`
      console.log('--- DIAGNOSTIC INJECTION ---');
      console.log('window.reaIdm:', typeof window.reaIdm, window.reaIdm ? Object.keys(window.reaIdm).join(', ') : 'MISSING');
      
      const btnClose = document.getElementById('btn-win-close');
      const btnMin = document.getElementById('btn-win-minimize');
      const btnMax = document.getElementById('btn-win-maximize');
      
      console.log('btn-win-close:', !!btnClose, btnClose ? btnClose.getBoundingClientRect() : null);
      console.log('btn-win-minimize:', !!btnMin, btnMin ? btnMin.getBoundingClientRect() : null);
      console.log('btn-win-maximize:', !!btnMax, btnMax ? btnMax.getBoundingClientRect() : null);
      
      if (btnClose) {
        const cs = getComputedStyle(btnClose);
        console.log('Close btn styles - pointer-events:', cs.pointerEvents, 'cursor:', cs.cursor, 'appRegion:', cs.webkitAppRegion);
      }
      
      const wc = document.querySelector('.window-controls');
      if (wc) {
        const cs = getComputedStyle(wc);
        console.log('window-controls styles - appRegion:', cs.webkitAppRegion, 'pointer-events:', cs.pointerEvents);
      }
      
      const dr = document.querySelector('.titlebar-drag-region');
      if (dr) {
        const cs = getComputedStyle(dr);
        console.log('drag-region styles - appRegion:', cs.webkitAppRegion, 'rect:', dr.getBoundingClientRect());
      }
      
      // Global click listener to see if clicks reach the DOM at all
      document.addEventListener('click', (e) => {
        console.log('GLOBAL CLICK at', e.clientX, e.clientY, '- target:', e.target.tagName + '#' + e.target.id + '.' + e.target.className);
      }, true);
      
      document.addEventListener('mousedown', (e) => {
        console.log('GLOBAL MOUSEDOWN at', e.clientX, e.clientY, '- target:', e.target.tagName + '#' + e.target.id + '.' + e.target.className);
      }, true);
      
      'injection done';
    `).then(r => console.log('Injection:', r)).catch(e => console.error('Injection error:', e));
  });
  
  win.webContents.on('console-message', (_ev, _level, msg) => {
    console.log('[R]', msg);
  });
  
  setTimeout(() => { console.log('Auto-exit timeout'); app.exit(0); }, 60000);
});
