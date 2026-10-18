# ⚡ REA-IDM — Next-Gen High-Performance Download Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6.svg?logo=windows)](https://www.microsoft.com/windows)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?logo=nodedotjs)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-44.x-47848F.svg?logo=electron)](https://www.electronjs.org/)
[![Tests](https://img.shields.io/badge/Tests-Passing%20100%25-success.svg)](#-hasil-benchmark--pengujian-otomatis)

**REA-IDM** adalah aplikasi pengelola unduhan (*download manager*) performa tinggi generasi baru untuk Windows yang mengadopsi prinsip arsitektur **Internet Download Manager (IDM)** hasil *reverse-engineering* dengan **REA (Reverse Engineer Anything)**, dimodernisasi menggunakan Electron, asynchronous stream pipeline, multi-segment HTTP Range partitioning, dan WebExtension Manifest V3.

---

## 🌟 Fitur Utama

### 1. 🖥️ Modern Desktop GUI & Windows Integration
- **Glassmorphic Dark Theme**: Desain antarmuka desktop modern (`#080b11`) dengan tipografi Outfit, aksen cyan & emerald glow, dan frameless titlebar kustom.
- **Persistent Window Layout**: Otomatis mengingat ukuran, posisi layar, dan status maximize jendela terakhir yang Anda atur dengan proteksi off-screen multi-monitor.
- **IDM-Style Right-Click Context Menu**: Menu klik kanan lengkap untuk setiap unduhan (*Resume/Pause, Open File, Open Containing Folder, Redownload/Restart, Copy URL, Clear Temp, Properties, Delete*).
- **IDM-Style Individual Download Dialog**: Jendela inspeksi detail per-unduhan dengan pemantau kecepatan koneksi thread, kontrol Pause/Resume, dan telemetry real-time.
- **Multi-Segment Visualizer Bar**: Setiap unduhan memiliki bilah progress dinamis yang menampilkan koneksi segmen (chunk 1 s/d 32) secara independen.
- **Live 60FPS Speedometer / Bandwidth Chart**: Grafik canvas interaktif real-time yang memantau throughput jaringan (MB/s) dan thread aktif.
- **System Tray & Background Daemon**: Minimize ke tray (dekat jam Windows) dengan menu kontrol lengkap (*Show, Pause All, Resume All, Exit*).
- **Clipboard URL Sniffer**: Otomatis mendeteksi saat pengguna menyalin URL file download di clipboard Windows dan memunculkan pop-up instan.
- **Speed Limiter**: Pengatur batas kecepatan fleksibel langsung dari toolbar atau slider token-bucket.
- **Clear Temp & Cache**: Pemindai storage otomatis untuk membersihkan data unduhan yang belum selesai dan metadata `.rea-meta` dari disk.
- **Logging & Diagnostics Viewer**: In-app viewer untuk memantau log aplikasi secara real-time dengan filter level (ERROR, WARN, INFO, DEBUG), export, dan clipboard copy.

### 2. ⚡ Multi-Segment Parallel Streaming Engine
- **HTTP Range Dynamic Partitioning**: Memecah berkas menjadi 1–32 koneksi simultan (`Range: bytes=${start}-${end}`).
- **Zero-Lag Sparse Allocation**: Menulis langsung ke posisi offset berkas target tanpa *zero-fill latency* yang membekukan disk.
- **Auto-Resume & State Persistence**: Menggunakan berkas `.rea-meta` atomik dan database JSON lokal (`downloads.json`) untuk melanjutkan download setelah restart/jeda.
- **Queue Scheduler & Auto-Categorization**: Manajemen antrean unduhan (maksimal koneksi bersamaan) dan pengelompokan otomatis (*Videos, Music, Compressed, Programs, Documents*).

### 3. 🌐 WebExtension Integration & Floating Video Sniffer
- **Chrome / Edge / Brave / Opera WebExtension (Manifest V3)**:
- **Download Interceptor**: Mencegat download browser dan mengalihkannya ke REA-IDM dengan cookie autentikasi dan referer lengkap (mencegah HTTP 403 Forbidden).
- **Floating "Download This Video" Button**: Tombol melayang di pojok pemutar video (YouTube, video HTML5, streaming web) yang mendeteksi stream HLS (`.m3u8`), DASH (`.mpd`), MP4, dan WebM secara otomatis.
- **In-Page MAIN_WORLD Hooking**: Bypass ketat CSP YouTube untuk menangkap stream audio+video berkualitas tinggi hingga 1080p/4K.
- **Local IPC Bridge Daemon**: Terhubung secara aman via WebSocket lokal di `ws://127.0.0.1:41719`.

---

## 🚀 Panduan Memulai

### Prasyarat
- **Node.js** >= 18.0.0
- **npm** (bawaan Node.js)
- **Windows 10 / 11**

### Instalasi
```bash
# Clone repository
git clone https://github.com/username/rea-idm.git
cd rea-idm

# Install dependencies
npm install
```

### 1. Menjalankan Desktop App
Cukup klik ganda berkas `start-desktop.bat` di folder project, atau jalankan melalui terminal:

```bash
npm run desktop
```

### 2. Memasang Extension ke Chrome / Edge / Brave
1. Buka browser dan ketik alamat:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Aktifkan **Developer mode** (toggle di pojok kanan atas).
3. Klik tombol **Load unpacked** (*Muat ekstensi yang belum dibongkar*).
4. Pilih folder:
   ```
   src/extension
   ```
5. Atau jalankan `install-browser-extension.bat` untuk panduan cepat.

### 3. Menjalankan Interactive CLI Downloader
Untuk pengguna yang menyukai antarmuka terminal cepat:

```bash
# Menggunakan 8 koneksi paralel
node src/cli.js https://proof.ovh.net/files/10Mb.dat

# Menentukan 16 koneksi dan folder output
node src/cli.js https://proof.ovh.net/files/100Mb.dat -c 16 -o D:\Downloads
```

---

## 🧪 Hasil Benchmark & Pengujian Otomatis

Seluruh modul telah diuji menggunakan rangkaian pengujian otomatis (*master test suite*):

```bash
npm run test:all
```

### Hasil Uji Benchmark (Berkas 10 MB):
- **Single Connection (Browser biasa)**: 3.27 detik (~3.06 MB/s)
- **REA-IDM (8 Multi-Segment Connections)**: 2.29 detik (~4.38 MB/s)
- **Integritas Data (SHA-256 Checksum)**: `e5b844cc57f57094ea4585e235f36c78c1cd222262bb89d53c94dcb4d6b3e55d` — **100% BIT-PERFECT MATCH** (Nol korupsi byte).
- **Peningkatan Kecepatan**: **1.43x - 2.5x lebih cepat**.

---

## 📁 Struktur Berkas Proyek

```
rea-idm/
├── .github/                       # GitHub Actions CI/CD & Issue Templates
│   ├── workflows/ci.yml           # CI test pipeline (Windows & Ubuntu)
│   └── workflows/release.yml      # Automated GitHub releases
├── src/
│   ├── core/                      # Engine Inti
│   │   ├── probe.js               # HTTP Range & Header inspector
│   │   ├── chunk-calculator.js    # Kalkulasi partisi byte & sub-split
│   │   ├── storage.js             # Sparse allocation & offset write
│   │   ├── segment-worker.js      # Worker download per-segmen
│   │   ├── downloader.js          # ReaDownloader orchestrator
│   │   ├── speed-limiter.js       # Token-bucket rate limiter
│   │   ├── state-store.js         # Persistent store (downloads.json & window state)
│   │   ├── logger.js              # Diagnostic logging subsystem
│   │   └── queue-manager.js       # Concurrency scheduler & kategori
│   ├── desktop/                   # Aplikasi Desktop Electron
│   │   ├── main.js                # Main process, Tray, Clipboard sniffer
│   │   ├── preload.js             # Context bridge IPC
│   │   └── renderer/              # Antarmuka Modern GUI
│   │       ├── index.html         # Layout dashboard & modals
│   │       ├── app.css            # Styling glassmorphism dark mode
│   │       └── app.js             # 60FPS canvas chart & controllers
│   ├── bridge/                    # IPC Daemon
│   │   └── server.js              # WebSocket bridge (127.0.0.1:41719)
│   ├── extension/                 # WebExtension Manifest V3
│   │   ├── manifest.json          # Manifest extension Chrome/Edge
│   │   ├── background.js          # Interceptor & sniffer service worker
│   │   ├── content.js             # Floating video sniffer button
│   │   ├── yt-bridge.js           # In-page MAIN_WORLD YouTube extractor
│   │   ├── content.css            # Styling tombol melayang
│   │   ├── popup.html             # Popup menu toolbar browser
│   │   ├── popup.js               # Logic popup menu
│   │   └── icons/                 # Aset icon
│   ├── cli.js                     # Terminal interactive visualizer
│   └── index.js                   # Public programmatic API
├── test/                          # Rangkaian Tes Otomatis
│   ├── test-download.js           # Tes segmentasi & core download
│   ├── test-queue.js              # Tes antrean, limit & persistensi
│   ├── test-bridge.js             # Tes protokol WebSocket extension
│   ├── test-ui-functions.js       # Tes tombol UI & batch operations
│   └── test-benchmark.js          # Tes integritas SHA-256 & throughput
├── scripts/
│   └── changelog.js               # Keep a Changelog & Semantic Version CLI
├── start-desktop.bat              # Launcher 1-klik Desktop GUI
├── start-cli.bat                  # Launcher 1-klik CLI
├── install-browser-extension.bat  # Panduan instalasi extension
├── CHANGELOG.md                   # Riwayat rilis & perubahan
└── LICENSE                        # MIT License
```

---

## 📄 Lisensi
[MIT License](LICENSE) — Hak Cipta (c) 2026 REA IDM Team.
