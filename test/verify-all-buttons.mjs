/**
 * Automated Verification: Verify responsiveness of all UI buttons, modals, and filters.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let actionLogs = [];

app.whenReady().then(async () => {
  const preloadPath = path.join(projectRoot, 'src', 'desktop', 'preload.js');
  const htmlPath = path.join(projectRoot, 'src', 'desktop', 'renderer', 'index.html');

  const win = new BrowserWindow({
    width: 1140,
    height: 720,
    frame: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Window Controls
  ipcMain.handle('window:minimize', () => { actionLogs.push('minimize'); return true; });
  ipcMain.handle('window:maximize', () => { actionLogs.push('maximize'); return true; });
  ipcMain.handle('window:close', () => { actionLogs.push('close'); return true; });

  // Core IDM tasks
  let mockTasks = [
    {
      id: 'task-1',
      filename: 'sample-video.mp4',
      url: 'https://example.com/sample-video.mp4',
      category: 'Videos',
      status: 'downloading',
      totalBytes: 104857600,
      downloadedBytes: 52428800,
      percent: 50.0,
      speed: 1048576,
      eta: 50,
      savePath: 'D:\\Downloads\\sample-video.mp4',
      chunks: [
        { id: 0, percent: 50, status: 'downloading', totalBytes: 25000000 },
        { id: 1, percent: 50, status: 'downloading', totalBytes: 25000000 },
        { id: 2, percent: 50, status: 'downloading', totalBytes: 25000000 },
        { id: 3, percent: 50, status: 'downloading', totalBytes: 25000000 }
      ]
    },
    {
      id: 'task-2',
      filename: 'document.pdf',
      url: 'https://example.com/document.pdf',
      category: 'Documents',
      status: 'completed',
      totalBytes: 5242880,
      downloadedBytes: 5242880,
      percent: 100.0,
      speed: 0,
      eta: 0,
      savePath: 'D:\\Downloads\\document.pdf'
    }
  ];

  ipcMain.handle('tasks:get-all', () => mockTasks);
  ipcMain.handle('tasks:add', (_ev, opts) => {
    actionLogs.push(`add-task:${opts.url}`);
    const newTask = {
      id: `task-${Date.now()}`,
      filename: opts.filename || 'new-file.zip',
      url: opts.url,
      category: 'Compressed',
      status: opts.startNow ? 'downloading' : 'queued',
      totalBytes: 20000000,
      downloadedBytes: 0,
      percent: 0,
      speed: 0,
      eta: 0,
      savePath: opts.savePath || 'D:\\Downloads\\new-file.zip'
    };
    mockTasks.push(newTask);
    return newTask;
  });
  ipcMain.handle('tasks:resume', (_ev, id) => { actionLogs.push(`resume:${id}`); return true; });
  ipcMain.handle('tasks:pause', (_ev, id) => { actionLogs.push(`pause:${id}`); return true; });
  ipcMain.handle('tasks:remove', (_ev, { id }) => { actionLogs.push(`remove:${id}`); return true; });
  ipcMain.handle('tasks:pause-all', () => { actionLogs.push('pause-all'); return true; });
  ipcMain.handle('tasks:resume-all', () => { actionLogs.push('resume-all'); return true; });
  ipcMain.handle('tasks:set-speed-limit', (_ev, limit) => { actionLogs.push(`speed-limit:${limit}`); return true; });
  ipcMain.handle('dialog:select-folder', () => 'D:\\CustomDownloads');
  ipcMain.handle('shell:open-file', () => { actionLogs.push('open-file'); });
  ipcMain.handle('shell:open-folder', () => { actionLogs.push('open-folder'); });

  win.loadFile(htmlPath);

  win.webContents.on('did-finish-load', async () => {
    try {
      console.log('[TEST] Checking all interactive elements and responsiveness...');

      const testResults = await win.webContents.executeJavaScript(`
        (async () => {
          const results = [];

          // 1. Check Add Download Modal
          const btnAdd = document.getElementById('btn-open-add-modal');
          const modalAdd = document.getElementById('modal-add-download');
          const btnCloseModal = document.getElementById('btn-modal-close');
          
          btnAdd.click();
          results.push({ test: 'Open Add Modal', pass: modalAdd.style.display !== 'none' });

          btnCloseModal.click();
          results.push({ test: 'Close Add Modal', pass: modalAdd.style.display === 'none' });

          // 2. Open Add Modal, fill inputs, and Start Download
          btnAdd.click();
          document.getElementById('input-download-url').value = 'https://example.com/test-file.zip';
          document.getElementById('input-download-filename').value = 'test-file.zip';
          document.getElementById('btn-download-now').click();
          await new Promise(r => setTimeout(r, 200));
          results.push({ test: 'Submit Add Download', pass: modalAdd.style.display === 'none' });

          // 3. Test Sidebar Category Filtering
          const navItems = document.querySelectorAll('.nav-item');
          let videoNav = Array.from(navItems).find(n => n.dataset.category === 'Videos');
          if (videoNav) {
            videoNav.click();
            const rows = document.querySelectorAll('.downloads-table tbody tr');
            results.push({ test: 'Sidebar Videos Filter', pass: rows.length > 0 });
          }

          let docNav = Array.from(navItems).find(n => n.dataset.category === 'Documents');
          if (docNav) {
            docNav.click();
            const rows = document.querySelectorAll('.downloads-table tbody tr');
            results.push({ test: 'Sidebar Documents Filter', pass: rows.length > 0 });
          }

          // Return back to All
          let allNav = Array.from(navItems).find(n => n.dataset.category === 'all');
          if (allNav) allNav.click();

          // 4. Test Pause All and Resume All
          document.getElementById('btn-toolbar-pause-all').click();
          await new Promise(r => setTimeout(r, 100));
          document.getElementById('btn-toolbar-resume-all').click();
          await new Promise(r => setTimeout(r, 100));

          // 5. Test Speed Limiter Toggle
          const speedToggle = document.getElementById('toggle-speed-limit');
          speedToggle.checked = true;
          speedToggle.dispatchEvent(new Event('change'));
          results.push({ test: 'Speed Limiter Enable', pass: !document.getElementById('speed-limit-slider').disabled });

          // 6. Test Search Box Filter
          const searchInput = document.getElementById('input-search');
          searchInput.value = 'sample-video';
          searchInput.dispatchEvent(new Event('input'));
          const searchRows = document.querySelectorAll('.downloads-table tbody tr');
          results.push({ test: 'Search Filter', pass: searchRows.length === 1 });

          // Reset search
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));

          // 7. Test Segments Modal
          openSegmentsModal('task-1');
          const modalSeg = document.getElementById('modal-segments');
          results.push({ test: 'Segments Modal Open', pass: modalSeg.style.display !== 'none' });
          document.getElementById('btn-segments-close').click();
          results.push({ test: 'Segments Modal Close', pass: modalSeg.style.display === 'none' });

          return results;
        })()
      `);

      console.log('[TEST] Interaction Test Results:');
      let allPassed = true;
      for (const res of testResults) {
        console.log(`  - [${res.pass ? 'PASS' : 'FAIL'}] ${res.test}`);
        if (!res.pass) allPassed = false;
      }

      console.log('[TEST] IPC Action Logs:', actionLogs);

      if (allPassed && actionLogs.includes('pause-all') && actionLogs.includes('resume-all')) {
        console.log('=== ALL BUTTON RESPONSIVENESS CHECKS PASSED ===');
        app.exit(0);
      } else {
        console.error('=== SOME CHECKS FAILED ===');
        app.exit(1);
      }
    } catch (err) {
      console.error('[TEST ERROR]', err);
      app.exit(1);
    }
  });

  setTimeout(() => {
    console.error('[TEST TIMEOUT]');
    app.exit(1);
  }, 12000);
});
