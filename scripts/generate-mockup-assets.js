import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

app.disableHardwareAcceleration();

// Start a lightweight local HTTP server for mockup rendering
const snifferHtmlPath = path.join(projectRoot, 'scripts', 'mockup-sniffer.html');
const waHtmlPath = path.join(projectRoot, 'scripts', 'mockup-whatsapp.html');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/sniffer') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(snifferHtmlPath, 'utf8'));
  } else if (req.url === '/whatsapp') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(waHtmlPath, 'utf8'));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 49223;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[HTTP] Mockup server listening on http://127.0.0.1:${PORT}`);
});

app.whenReady().then(async () => {
  console.log('🚀 Generating NIKA DOWNLOADER High-End Production Showcase Mockups...');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#070a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      offscreen: true
    }
  });

  try {
    // =========================================================================
    // 1. Desktop Dashboard Showcase (assets/dashboard.png)
    // =========================================================================
    const dashboardHtmlPath = path.join(projectRoot, 'src', 'desktop', 'renderer', 'index.html');
    await win.loadFile(dashboardHtmlPath);

    await win.webContents.executeJavaScript(`
      (() => {
        const mockTasks = [
          {
            id: 'task-1',
            filename: 'ubuntu-24.04.1-desktop-amd64.iso',
            destinationDir: 'D:\\\\Downloads\\\\Linux',
            category: 'Programs',
            url: 'https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso',
            totalBytes: 6144000000,
            downloadedBytes: 4816896000,
            percent: 78.4,
            speed: 52428800, // 50.0 MB/s
            eta: 25,
            status: 'downloading',
            resumable: true,
            supportsRange: true,
            connections: 16,
            chunks: [
              { id: 0, status: 'completed', percent: 100, totalBytes: 384000000 },
              { id: 1, status: 'completed', percent: 100, totalBytes: 384000000 },
              { id: 2, status: 'completed', percent: 100, totalBytes: 384000000 },
              { id: 3, status: 'downloading', percent: 84, totalBytes: 384000000 },
              { id: 4, status: 'downloading', percent: 76, totalBytes: 384000000 },
              { id: 5, status: 'downloading', percent: 65, totalBytes: 384000000 },
              { id: 6, status: 'downloading', percent: 58, totalBytes: 384000000 },
              { id: 7, status: 'downloading', percent: 45, totalBytes: 384000000 }
            ]
          },
          {
            id: 'task-2',
            filename: 'Cinematic_4K_Alps_Drone_Master_60fps.mp4',
            destinationDir: 'D:\\\\Downloads\\\\Videos',
            category: 'Videos',
            url: 'https://cdn.nature-master.org/streams/4k-alps-60fps.mp4',
            totalBytes: 4005560320,
            downloadedBytes: 2171013693,
            percent: 54.2,
            speed: 33554432, // 32.0 MB/s
            eta: 54,
            status: 'downloading',
            resumable: true,
            supportsRange: true,
            connections: 16,
            chunks: [
              { id: 0, status: 'completed', percent: 100, totalBytes: 250000000 },
              { id: 1, status: 'completed', percent: 100, totalBytes: 250000000 },
              { id: 2, status: 'downloading', percent: 70, totalBytes: 250000000 },
              { id: 3, status: 'downloading', percent: 42, totalBytes: 250000000 }
            ]
          },
          {
            id: 'task-3',
            filename: 'Blender-4.2.3-windows-x64.msi',
            destinationDir: 'D:\\\\Downloads\\\\Software',
            category: 'Programs',
            url: 'https://download.blender.org/release/Blender4.2/blender-4.2.3-windows-x64.msi',
            totalBytes: 358744064,
            downloadedBytes: 358744064,
            percent: 100,
            speed: 0,
            eta: 0,
            status: 'completed',
            resumable: true,
            supportsRange: true,
            connections: 1,
            chunks: [{ id: 0, status: 'completed', percent: 100, totalBytes: 358744064 }]
          },
          {
            id: 'task-4',
            filename: 'Cyberpunk_2077_Original_Soundtrack_Lossless.zip',
            destinationDir: 'D:\\\\Downloads\\\\Audio',
            category: 'Music',
            url: 'https://soundtracks.game-vault.com/flac/cyberpunk-2077-ost.zip',
            totalBytes: 1556925644,
            downloadedBytes: 1556925644,
            percent: 100,
            speed: 0,
            eta: 0,
            status: 'completed',
            resumable: true,
            supportsRange: true,
            connections: 1,
            chunks: [{ id: 0, status: 'completed', percent: 100, totalBytes: 1556925644 }]
          },
          {
            id: 'task-5',
            filename: 'Node-v22.11.0-x64.msi',
            destinationDir: 'D:\\\\Downloads\\\\Software',
            category: 'Programs',
            url: 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi',
            totalBytes: 33344512,
            downloadedBytes: 33344512,
            percent: 100,
            speed: 0,
            eta: 0,
            status: 'completed',
            resumable: true,
            supportsRange: true,
            connections: 1,
            chunks: [{ id: 0, status: 'completed', percent: 100, totalBytes: 33344512 }]
          },
          {
            id: 'task-6',
            filename: 'UnrealEngine-5.4.4-Setup.exe',
            destinationDir: 'D:\\\\Downloads\\\\GameDev',
            category: 'Programs',
            url: 'https://epicgames.com/launcher/UE5.4.4-Setup.exe',
            totalBytes: 14892000000,
            downloadedBytes: 0,
            percent: 0,
            speed: 0,
            eta: 0,
            status: 'queued',
            resumable: true,
            supportsRange: true,
            connections: 8,
            chunks: []
          }
        ];

        tasks.clear();
        for (const t of mockTasks) {
          tasks.set(t.id, t);
        }

        const countAll = document.getElementById('count-all');
        if (countAll) countAll.textContent = '6';
        const countDl = document.getElementById('count-downloading');
        if (countDl) countDl.textContent = '2';
        const countComp = document.getElementById('count-completed');
        if (countComp) countComp.textContent = '3';
        const countPause = document.getElementById('count-paused');
        if (countPause) countPause.textContent = '1';

        const countProg = document.getElementById('count-programs');
        if (countProg) countProg.textContent = '4';
        const countVid = document.getElementById('count-videos');
        if (countVid) countVid.textContent = '1';
        const countMus = document.getElementById('count-music');
        if (countMus) countMus.textContent = '1';

        const speedEl = document.getElementById('total-speed-display');
        if (speedEl) speedEl.textContent = '82.00 MB/s';
        const activeEl = document.getElementById('active-tasks-count');
        if (activeEl) activeEl.textContent = '2';
        const threadsEl = document.getElementById('active-threads-count');
        if (threadsEl) threadsEl.textContent = '32';

        const canvas = document.getElementById('speed-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const gradient = ctx.createLinearGradient(0, 0, 0, h);
          gradient.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

          ctx.beginPath();
          ctx.moveTo(0, h);

          const points = [];
          for (let x = 0; x <= w; x += 4) {
            const progress = x / w;
            const y = h * 0.42 + Math.sin(progress * 12) * 14 + Math.cos(progress * 22) * 8;
            points.push({ x, y });
            ctx.lineTo(x, y);
          }

          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.beginPath();
          for (let i = 0; i < points.length; i++) {
            if (i === 0) ctx.moveTo(points[i].x, points[i].y);
            else ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 10;
          ctx.stroke();
        }

        if (typeof renderTable === 'function') renderTable();
        if (typeof updateBadges === 'function') updateBadges();
      })();
    `);

    await new Promise(r => setTimeout(r, 1200));
    const dashImage = await win.webContents.capturePage();
    const dashPath = path.join(projectRoot, 'assets', 'dashboard.png');
    fs.writeFileSync(dashPath, dashImage.toPNG());
    console.log(`[OK] Saved Pristine Desktop Dashboard Mockup: ${dashPath}`);

    // =========================================================================
    // 2. Video Sniffer Showcase (assets/extension-sniffer.png)
    // =========================================================================
    await win.loadURL(`http://127.0.0.1:${PORT}/sniffer`);
    await new Promise(r => setTimeout(r, 1500));

    const snifferImage = await win.webContents.capturePage();
    const snifferPath = path.join(projectRoot, 'assets', 'extension-sniffer.png');
    fs.writeFileSync(snifferPath, snifferImage.toPNG());
    console.log(`[OK] Saved Professional Video Sniffer Showcase: ${snifferPath}`);

    // =========================================================================
    // 3. WhatsApp Status Saver Showcase (assets/whatsapp-status-saver.png)
    // =========================================================================
    await win.loadURL(`http://127.0.0.1:${PORT}/whatsapp`);
    await new Promise(r => setTimeout(r, 1500));

    const waImage = await win.webContents.capturePage();
    const waPath = path.join(projectRoot, 'assets', 'whatsapp-status-saver.png');
    fs.writeFileSync(waPath, waImage.toPNG());
    console.log(`[OK] Saved WhatsApp Status Saver Showcase: ${waPath}`);

    console.log('🎉 ALL SHOWCASE ASSETS GENERATED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error generating assets:', err);
  } finally {
    win.destroy();
    server.close();
    app.quit();
  }
});
