# AGENTS.md — REA-IDM Project Operating Guidelines & Standards

Welcome to **REA-IDM** (Next-Generation Internet Download Manager). This document sets the mandatory engineering operating procedures, architectural standards, and automated maintenance workflows for all AI coding agents, contributors, and project maintainers.

---

## 1. MANDATORY RULE: Continuous Changelog Maintenance

> [!IMPORTANT]
> **Zero-Tolerance Changelog Policy**  
> Every modification to the codebase—whether it is a bug fix (`fixed`), feature addition (`added`), refactoring or behavior update (`changed`), security hardening (`security`), deprecation (`deprecated`), or removal (`removed`)—**MUST ALWAYS be recorded into `CHANGELOG.md`** under the `## [Unreleased]` section.
>
> This repository is actively prepared for automated GitHub CI/CD integration, automated GitHub Releases, and semantic version tagging. Inconsistent changelog tracking will fail release pipelines.

### Standard Workflow for Every Task

1. **Before/During Implementation**:
   - Inspect files and execute minimal safe changes.
   - Maintain regression-free compatibility with existing modules.

2. **Immediately After Successful Change**:
   - Record each distinct change into `CHANGELOG.md` using the project's built-in CLI:
     ```bash
     node scripts/changelog.js add <type> "<description>"
     ```
   - **Valid Entry Types**:
     - `added`: New features, new UI capabilities, or new integrations.
     - `fixed`: Bug fixes, error resolutions, or edge-case handling.
     - `changed`: Refactoring, architectural improvements, or modified behavior.
     - `security`: Security patches, header hardening, or credential protections.
     - `deprecated`: Features planned for removal in upcoming versions.
     - `removed`: Deprecated features that have been removed.

3. **Releasing a New Version**:
   - When a version milestone is reached and approved:
     ```bash
     node scripts/changelog.js release <version>
     # Example: node scripts/changelog.js release 1.2.0
     ```
   - This command automatically:
     - Moves all `[Unreleased]` entries into a dated release header `## [x.y.z] - YYYY-MM-DD`.
     - Resets a clean, empty `## [Unreleased]` section.
     - Bumps the version in `package.json`.
     - Bumps the version in `src/extension/manifest.json`.
     - Dynamically updates the in-app Desktop Release Notes viewer.

4. **GitHub Release & CI Readiness**:
   - All changelog entries adhere to [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/).
   - CLI command `node scripts/changelog.js json` produces clean JSON for GitHub Actions release automations.

---

## 2. REA-IDM Architecture & System Overview

REA-IDM is constructed from 4 coordinated layers:

```
┌────────────────────────────────────────────────────────┐
│             WebExtension (Chrome MV3)                  │
│  - In-Page MAIN_WORLD Bridge (yt-bridge.js)            │
│  - Isolated Floating Sniffer UI (content.js, content.css)│
│  - Background Service Worker (background.js)           │
└──────────────────────────┬─────────────────────────────┘
                           │ WebSocket (ws://127.0.0.1:41719)
┌──────────────────────────▼─────────────────────────────┐
│                 WebSocket IPC Bridge                   │
│  - src/bridge/server.js (Port 41719)                   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│            Core Download Engine & Queue                │
│  - QueueManager (src/core/queue-manager.js)            │
│  - Multi-Segment ReaDownloader (src/core/downloader.js)│
│  - SegmentWorker (src/core/segment-worker.js)          │
│  - Preallocated Storage (src/core/storage.js)          │
│  - SpeedLimiter (src/core/speed-limiter.js)            │
│  - URL Prober & MIME Resolver (src/core/probe.js)      │
└──────────────────────────┬─────────────────────────────┘
                           │ Electron IPC
┌──────────────────────────▼─────────────────────────────┐
│             Electron Desktop Application               │
│  - src/desktop/main.js & preload.js                    │
│  - Renderer: index.html, app.js, style.css             │
│  - 60FPS Canvas Telemetry, Task Table, Modals          │
└────────────────────────────────────────────────────────┘
```

---

## 3. Core Engineering Rules & Constraints

### A. Media Stream Sniffing & YouTube Rules
1. **Never Capture or Download `blob:` URLs**:
   - `blob:http...` URLs exist solely in the browser's volatile memory. Native Node.js cannot fetch them and will stall at 0 bytes.
   - Any `blob:` URL must be rejected at both extension level and core engine level (`probe.js`).
2. **In-Page YouTube Hooking (`"world": "MAIN"`)**:
   - YouTube's strict CSP (`strict-dynamic`) blocks inline `<script>` tags.
   - Hooking player responses (`/youtubei/v1/player`) must occur in `yt-bridge.js` running in Manifest V3's `"world": "MAIN"`.
3. **Session Cookies & Header Forwarding**:
   - Protected streams (including Google Video, CDN streams, and private media) require valid session cookies, `Referer: https://www.youtube.com/`, and `Origin: https://www.youtube.com`.
   - The extension must extract cookies via `chrome.cookies.getAll` and pass them to the native downloader.

### B. High-Performance Multi-Segment Engine Rules
1. **Zero-Copy Sparse Preallocation**:
   - Files are preallocated upon probing using `fs.promises.open` and sparse writes, allowing parallel chunk workers to write at random offsets without race conditions.
2. **Atomic Metadata Persistence**:
   - Resume metadata (`.rea-meta`) must be persisted on chunk progress to guarantee crash recovery without re-downloading existing chunks.
3. **Task Filename Protection**:
   - When an explicit filename or title is provided (e.g., from extension or user input), `queue-manager.js` and `downloader.js` must NEVER overwrite it with generic fallback names (e.g. `download-<timestamp>.bin`).

### C. UI & Electron Standards
1. **Dynamic Version Display**:
   - The brand version badge (`#brand-version-tag`) must dynamically reflect the active version via `api.getAppVersion()`.
2. **No Fake Verifications**:
   - Never report tests or features as verified unless verified with active evidence (terminal commands, test suites, or live runtime checks).
3. **Safe File Operations**:
   - Deletions must confirm intent (e.g., Delete Confirmation Modal with option to delete from list only or remove from disk).

---

## 4. Key Project Commands Reference

| Command | Description |
| :--- | :--- |
| `npm run desktop` / `start-desktop.bat` | Launches the REA-IDM Electron Desktop Application. |
| `npm run start` / `start-cli.bat` | Launches the interactive CLI interface. |
| `npm run extension` | Installs / checks the unpacked browser extension. |
| `node scripts/changelog.js view` | Displays formatted changelog in terminal. |
| `node scripts/changelog.js json` | Outputs structured JSON of releases for CI/CD. |
| `node scripts/changelog.js add <type> "<msg>"` | Adds a new entry to `[Unreleased]`. |
| `node scripts/changelog.js release <version>` | Cuts a new release and syncs versions across the repository. |
| `npm test` | Runs the core multi-segment download engine tests. |
