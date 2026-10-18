# Changelog

All notable changes to the **NIKA DOWNLOADER** (Next-Generation High-Performance Download Manager) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]
### Changed
- Replace raw screenshots with high-definition, informative production mockups for Desktop Dashboard, Multi-Quality Video Sniffer, and WhatsApp Web Status Saver
- Rebranded entire project identity to NIKA DOWNLOADER with production-grade English documentation, custom brand emblem, and media tutorial walkthroughs
### Fixed
- Fix YouTube download pipeline: add sendToDesktopAsync auto-connect retry in MV3 background, strip cross-origin session cookies for Google Video endpoints, upgrade live stream URLs in sniffer, and extract clen upfront in probeUrl
- Resolved WhatsApp status downloads not appearing in desktop window by implementing MAIN_WORLD wa-bridge for blob extraction and fixing QueueManager.tasks Map insertion in bridge server.
- Eliminated rapid sniffer button flickering on WhatsApp Web by removing competing hover listeners, scoping status detection to active story lightboxes, and adding transition debouncing.
- Fix WhatsApp Web status sniffer obstruction with draggable root stacking context, direct 1-click status downloading, and in-memory blob saving
- Fix titlebar brand version displaying Electron runtime version (v44.9.0) instead of package.json release version
- Fix progress loss and reset to 0 B/Queued on window close [X] by implementing graceful queue shutdown, periodic progress auto-persistence, and disk chunk state recovery
- Fix uncatchable Undici assert(!this.paused) socket-end crash by migrating SegmentWorker to native Node HTTP/HTTPS streaming and adding main process uncaught exception guards
- Fix row checkbox becoming unclickable and losing checked state during active download progress via persistent selection state and targeted cell updates
### Added
- Automated Git and Semantic Version Rollback Manager (scripts/rollback.js, rollback.bat, and GitHub Actions workflow) with safe isolated branch, linear revert, and detached inspection modes
- IDM-style custom right-click context menu for download items (Resume/Pause, Open File, Open Folder, Redownload, Copy URL, Clear Temp, Properties, and Delete) with smart viewport positioning
- Automatic window layout and size persistence (width, height, coordinates, and maximized state) with multi-display bounds validation
- Preferences & Settings modal dialog with default download directory selection, concurrency controls, and auto-clean temp cache toggle upon download deletion
- In-app Clear Temp & Cache dialog to scan, calculate reclaimable disk storage, and purge incomplete downloads (.rea-meta & preallocated chunks) with reset-progress or complete-removal modes
- Add transfer size breakdown (downloaded of total bytes) and real-time server Resume Capability badges (Resume: Yes/No) across table rows and dialogs
- Comprehensive application logging and diagnostics system with real-time UI log viewer, level filters (ERROR/WARN/INFO/DEBUG), file persistence (logs/rea-idm.log), export, and clipboard copy
- Add IDM-style Individual Download Dialog with real-time transfer telemetry, multi-segment threads visualizer, in-dialog Pause/Resume, Open File, Open Folder, and cancel controls
- Created root AGENTS.md documenting mandatory continuous changelog policy, GitHub CI integration readiness, and architectural standards.
---

## [1.1.0] - 2026-10-18

### Changed
- Improved task filename resolution in Queue Manager to protect explicit video titles and handle extensionless/fallback downloads.
### Fixed
- Fixed YouTube 1080p/4K Fetch & DL trigger by implementing automated player Settings Gear switching and auto-download on stream capture.
- Eliminated 0-byte stalled downloads by rejecting browser-memory blob: URLs and properly forwarding YouTube session cookies, Referer, and Origin headers.
- Resolved YouTube video capture failure by implementing an IDM-style MAIN_WORLD bridge (yt-bridge.js) that directly hooks player responses and bypasses YouTube CSP restrictions.
### Added
- Enabled on-demand resolution switching and HTML5 movie_player availableQualityLevels extraction for YouTube HD/4K streams.
- Added Google Video stream clen size extraction, dynamic stream sorting prioritizing combined 720p/360p audio+video formats, and clean video title formatting.
- Directory path display badges in download list rows and Segments modal with one-click folder opening.
- Interactive Delete confirmation modal with option checklist to delete from list only or also remove file from directory/disk.
- Workspace engineering rule for continuous changelog tracking.
- In-App Release Notes modal viewer accessible from titlebar badge and toolbar button.
- Automated changelog management system with CLI and interactive in-app viewer.

---

## [1.0.0] - 2026-10-18

### Added
- **Core Multi-Segment Engine**:
  - High-performance parallel chunk downloader with configurable 1–32 connections.
  - Dynamic chunk splitting algorithm for lagging or stalled connections.
  - Stream-to-disk chunk storage with auto-allocation and instant zero-copy assembly.
  - Crash recovery & instant resume via persistent JSON chunk state store.
  - Token-bucket Speed Limiter for smooth, real-time bandwidth throttling.
- **Queue Manager & CLI**:
  - Centralized priority download queue with concurrent worker slots.
  - Command-line interface with interactive progress bars and commands (`add`, `list`, `pause`, `resume`, `delete`, `clean`).
- **Modern Desktop Application**:
  - Sleek frameless dark-mode UI with custom native-like titlebar and window controls.
  - Interactive download table with multi-segment chunk progress visualization bars.
  - Category filters (*All, Downloading, Completed, Paused, Compressed, Documents, Music, Programs, Videos*).
  - Real-time 60FPS bandwidth telemetry canvas chart and active threads monitor.
  - Full keyboard shortcuts (<kbd>Ctrl+V</kbd> to paste download link, <kbd>Esc</kbd> to dismiss modals).
  - Multi-Segment Allocation inspector modal to view live speeds per HTTP connection.
- **WebSocket IPC Bridge (Port 41719)**:
  - High-speed bi-directional event bus linking Desktop App, CLI, and Browser Extension.
- **Browser WebExtension Integration**:
  - Manifest V3 extension for Chrome, Edge, Brave, and Opera.
  - Full right-click context menu integration (*"Download with REA-IDM"* on links, media, selections, and pages).
  - Injected Floating Video Sniffer widget over video players.
  - YouTube in-page stream extractor supporting multiple quality options (*720p HD, 360p, 1080p Full HD, Audio M4A/Opus*).
  - Automatic download interception with cookie, referer, and user-agent forwarding.

### Fixed
- Fixed Electron preload script CommonJS sandbox compatibility to restore window controls (*Close*, *Minimize*, *Maximize*).
- Fixed false positive detection of `.webmanifest` file matching `.webm` video streams.
- Fixed YouTube `/videoplayback` range queries to ensure full video stream downloads instead of fragments.
- Fixed sidebar category click event listener targeting `.nav-item`.
- Replaced clunky separated telemetry boxes with a cohesive, full-width status footer.
- Added re-entrancy recursion guard on application shutdown.
