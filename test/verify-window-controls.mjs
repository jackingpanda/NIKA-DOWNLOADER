/**
 * Automated Verification: Verify that the Close, Maximize, and Minimize buttons
 * trigger the IPC handlers cleanly in the renderer.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let ipcTriggered = {
  minimize: false,
  maximize: false,
  close: false
};

app.whenReady().then(async () => {
  const preloadPath = path.join(projectRoot, 'src', 'desktop', 'preload.js');
  const htmlPath = path.join(projectRoot, 'src', 'desktop', 'renderer', 'index.html');

  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    frame: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Track IPC invocations
  ipcMain.handle('window:minimize', () => {
    ipcTriggered.minimize = true;
    console.log('[TEST-PASS] window:minimize IPC received successfully!');
    return true;
  });

  ipcMain.handle('window:maximize', () => {
    ipcTriggered.maximize = true;
    console.log('[TEST-PASS] window:maximize IPC received successfully!');
    return true;
  });

  ipcMain.handle('window:close', () => {
    ipcTriggered.close = true;
    console.log('[TEST-PASS] window:close IPC received successfully!');
    return true;
  });

  // Task & system stubs
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

  win.webContents.on('did-finish-load', async () => {
    try {
      console.log('[TEST] Page loaded. Simulating button clicks on window controls...');

      const result = await win.webContents.executeJavaScript(`
        (() => {
          const btnMin = document.getElementById('btn-win-minimize');
          const btnMax = document.getElementById('btn-win-maximize');
          const btnClose = document.getElementById('btn-win-close');

          if (!btnMin || !btnMax || !btnClose) {
            return { success: false, error: 'Buttons not found in DOM' };
          }

          // Trigger clicks
          btnMin.click();
          btnMax.click();
          btnClose.click();

          return {
            success: true,
            hasReaIdm: typeof window.reaIdm === 'object' && window.reaIdm !== null,
            closeFnType: typeof window.reaIdm?.closeWindow
          };
        })()
      `);

      console.log('[TEST] DOM Click Result:', JSON.stringify(result));

      // Wait a tick for async IPC roundtrip
      setTimeout(() => {
        console.log('[TEST] Final IPC Verification:', JSON.stringify(ipcTriggered));
        if (ipcTriggered.minimize && ipcTriggered.maximize && ipcTriggered.close) {
          console.log('=== ALL WINDOW CONTROL TESTS PASSED PERFECTLY ===');
          app.exit(0);
        } else {
          console.error('=== TEST FAILED: NOT ALL IPCs RECEIVED ===');
          app.exit(1);
        }
      }, 500);
    } catch (err) {
      console.error('[TEST ERROR]', err);
      app.exit(1);
    }
  });

  setTimeout(() => {
    console.error('[TEST TIMEOUT] Test exceeded 10s');
    app.exit(1);
  }, 10000);
});
