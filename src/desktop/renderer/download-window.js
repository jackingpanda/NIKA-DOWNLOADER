/**
 * NIKA DOWNLOADER - Standalone Individual Download Status Window Controller
 */

const api = window.nikaDownloader || window.nika || window.reaIdm;

const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('id');

let currentTask = null;
let closeTimeout = null;

// DOM Elements
const winStatusPill = document.getElementById('window-status-pill');
const statusTextEl = document.getElementById('indiv-status-text');
const resumableBadge = document.getElementById('indiv-resumable-badge');
const downloadedSizeEl = document.getElementById('indiv-downloaded-size');
const fileSizeEl = document.getElementById('indiv-file-size');
const transferRateEl = document.getElementById('indiv-transfer-rate');
const timeLeftEl = document.getElementById('indiv-time-left');

const fileTitleEl = document.getElementById('indiv-file-title');
const progressPercentLabel = document.getElementById('indiv-progress-percent-label');
const overallFill = document.getElementById('indiv-overall-fill');

const filePathEl = document.getElementById('indiv-file-path');
const sourceUrlEl = document.getElementById('indiv-source-url');
const threadCountEl = document.getElementById('indiv-thread-count');
const segmentsGrid = document.getElementById('indiv-segments-grid');

const checkCloseOnComplete = document.getElementById('indiv-close-on-complete');
const btnOpenFile = document.getElementById('btn-indiv-open-file');
const btnOpenFolder = document.getElementById('btn-indiv-open-folder');
const btnPauseResume = document.getElementById('btn-indiv-pause-resume');
const pauseResumeIcon = document.getElementById('indiv-pause-resume-icon');
const pauseResumeLabel = document.getElementById('indiv-pause-resume-label');
const btnCancel = document.getElementById('btn-indiv-cancel');
const btnClose = document.getElementById('btn-indiv-close');

const btnWinMinimize = document.getElementById('btn-win-minimize');
const btnWinClose = document.getElementById('btn-win-close');
const btnBrowseFolder = document.getElementById('btn-indiv-open-folder-inline');
const btnCopyUrl = document.getElementById('btn-indiv-copy-url');

// Formatting Helpers
function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  const b = Number(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds) {
  if (seconds === undefined || seconds === null || seconds < 0 || !isFinite(seconds)) return '--';
  const sec = Math.round(seconds);
  if (sec === 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function calculatePercent(task) {
  if (!task) return 0;
  if (task.status === 'completed') return 100;
  const total = Number(task.totalBytes) || 0;
  const down = Number(task.downloadedBytes) || 0;
  if (total > 0 && down > 0) {
    return Math.min(100, Math.max(0, parseFloat(((down / total) * 100).toFixed(1))));
  }
  if (typeof task.percent === 'number' && !isNaN(task.percent)) {
    return Math.min(100, Math.max(0, parseFloat(task.percent.toFixed(1))));
  }
  return 0;
}

// Render Window Content
function render(task) {
  if (!task) return;
  currentTask = task;

  const percentVal = calculatePercent(task);
  const percentStr = percentVal.toFixed(1);

  // 1. Title & Header status tag
  const filename = task.filename || 'Download';
  document.title = `${percentStr}% - ${filename} (NIKA DOWNLOADER)`;

  if (fileTitleEl) {
    fileTitleEl.textContent = filename;
    fileTitleEl.title = task.savePath || filename;
  }

  const statusLabels = {
    downloading: 'Downloading',
    probing: 'Connecting...',
    completed: 'Finished',
    paused: 'Paused',
    queued: 'Queued',
    error: 'Error'
  };
  const currentStatus = statusLabels[task.status] || task.status;

  if (winStatusPill) {
    winStatusPill.textContent = `${percentStr}% • ${currentStatus}`;
  }

  // 2. Metrics Tiles
  if (statusTextEl) {
    statusTextEl.textContent = currentStatus;
  }

  if (resumableBadge) {
    const isResumable = task.resumable !== false;
    resumableBadge.className = `indiv-resumable-tag ${isResumable ? '' : 'no-resume'}`;
    resumableBadge.textContent = isResumable ? 'Resume: Yes' : 'Resume: No';
  }

  if (downloadedSizeEl) {
    downloadedSizeEl.textContent = formatBytes(task.downloadedBytes);
  }

  if (fileSizeEl) {
    fileSizeEl.textContent = formatBytes(task.totalBytes || task.downloadedBytes);
  }

  if (transferRateEl) {
    transferRateEl.textContent = task.status === 'downloading' ? formatSpeed(task.speed) : '--';
  }

  if (timeLeftEl) {
    timeLeftEl.textContent = task.status === 'downloading' ? formatEta(task.eta) : '--';
  }

  // 3. Master Progress Bar
  if (progressPercentLabel) {
    progressPercentLabel.textContent = `${percentStr}%`;
  }
  if (overallFill) {
    overallFill.style.width = `${percentVal}%`;
  }

  // 4. Destination & URL
  if (filePathEl) {
    filePathEl.textContent = task.savePath || task.destinationDir || 'Default Downloads Folder';
    filePathEl.title = task.savePath || task.destinationDir || '';
  }

  if (sourceUrlEl) {
    sourceUrlEl.textContent = task.url || '';
    sourceUrlEl.title = task.url || '';
  }

  // 5. Multi-Segment Threads Visualizer
  const chunks = task.chunks || [];
  if (threadCountEl) {
    threadCountEl.textContent = chunks.length || (task.status === 'downloading' ? 1 : 0);
  }

  if (segmentsGrid) {
    if (chunks.length === 0) {
      segmentsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-sub); padding: 14px; font-size: 11.5px;">Waiting for connection allocation...</div>';
    } else {
      segmentsGrid.innerHTML = '';
      for (const c of chunks) {
        const card = document.createElement('div');
        card.className = 'segment-item-card';

        let cPercent = 0;
        if (task.status === 'completed' || c.status === 'completed') {
          cPercent = 100;
        } else if (c.percent !== undefined && !isNaN(c.percent)) {
          cPercent = Math.min(100, Math.max(0, c.percent));
        } else if (c.totalBytes && c.totalBytes > 0) {
          cPercent = Math.min(100, Math.max(0, (c.downloadedBytes / c.totalBytes) * 100));
        }
        const cPercentStr = cPercent.toFixed(1);

        const downloadedBytesVal = (task.status === 'completed' || c.status === 'completed') && c.totalBytes
          ? c.totalBytes
          : (c.downloadedBytes || 0);

        const metaText = c.totalBytes
          ? `${formatBytes(downloadedBytesVal)} / ${formatBytes(c.totalBytes)}`
          : formatBytes(downloadedBytesVal);

        card.innerHTML = `
          <div class="segment-item-header">
            <span class="segment-thread-num">Thread #${c.id + 1}</span>
            <span class="segment-thread-pct">${cPercentStr}%</span>
          </div>
          <div class="segment-item-bar">
            <div class="segment-item-fill" style="width: ${cPercentStr}%;"></div>
          </div>
          <div class="segment-item-meta" title="${metaText}">
            ${metaText}
          </div>
        `;
        segmentsGrid.appendChild(card);
      }
    }
  }

  // 6. Contextual Action Buttons in Footer
  if (task.status === 'completed') {
    if (btnOpenFile) {
      btnOpenFile.style.display = 'inline-flex';
      btnOpenFile.className = 'btn-primary-action';
      btnOpenFile.disabled = false;
    }
    if (btnPauseResume) btnPauseResume.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'none';
  } else if (task.status === 'downloading' || task.status === 'probing') {
    if (btnOpenFile) btnOpenFile.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'inline-flex';
    if (btnPauseResume) {
      btnPauseResume.style.display = 'inline-flex';
      btnPauseResume.className = 'btn-secondary';
      btnPauseResume.disabled = false;
      if (pauseResumeLabel) pauseResumeLabel.textContent = 'Pause';
      if (pauseResumeIcon) {
        pauseResumeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    }
  } else {
    // Paused / Queued / Error
    if (btnOpenFile) btnOpenFile.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'inline-flex';
    if (btnPauseResume) {
      btnPauseResume.style.display = 'inline-flex';
      btnPauseResume.className = 'btn-primary-action';
      btnPauseResume.disabled = false;
      if (pauseResumeLabel) pauseResumeLabel.textContent = task.status === 'error' ? 'Retry' : 'Resume';
      if (pauseResumeIcon) {
        pauseResumeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      }
    }
  }
}

// Handle Download Completed Auto-Close
function handleTaskCompleted() {
  if (checkCloseOnComplete?.checked) {
    if (closeTimeout) clearTimeout(closeTimeout);
    closeTimeout = setTimeout(() => {
      api.closeCurrentWindow();
    }, 850);
  }
}

// Initialize
async function init() {
  if (!taskId) {
    api.closeCurrentWindow();
    return;
  }

  // Restore saved preference for auto-close
  try {
    const savedAutoClose = localStorage.getItem('nika_close_on_complete');
    if (checkCloseOnComplete && savedAutoClose !== null) {
      checkCloseOnComplete.checked = savedAutoClose === 'true';
    }
  } catch {}

  checkCloseOnComplete?.addEventListener('change', () => {
    try {
      localStorage.setItem('nika_close_on_complete', checkCloseOnComplete.checked ? 'true' : 'false');
    } catch {}
  });

  // Window Controls
  btnWinMinimize?.addEventListener('click', () => {
    api.minimizeCurrentWindow();
  });

  btnWinClose?.addEventListener('click', () => {
    api.closeCurrentWindow();
  });

  btnClose?.addEventListener('click', () => {
    api.closeCurrentWindow();
  });

  // Action Buttons
  btnPauseResume?.addEventListener('click', async () => {
    if (!currentTask) return;
    if (currentTask.status === 'downloading' || currentTask.status === 'probing') {
      await api.pauseTask(taskId);
    } else {
      await api.resumeTask(taskId);
    }
  });

  btnCancel?.addEventListener('click', async () => {
    if (confirm('Cancel and remove this download task?')) {
      await api.removeTask(taskId, false);
      api.closeCurrentWindow();
    }
  });

  btnOpenFile?.addEventListener('click', async () => {
    if (currentTask?.savePath) {
      await api.openFile(currentTask.savePath);
    }
  });

  btnOpenFolder?.addEventListener('click', async () => {
    if (currentTask) {
      await api.openFolder(currentTask.savePath || currentTask.destinationDir);
    }
  });

  btnBrowseFolder?.addEventListener('click', async () => {
    if (currentTask) {
      await api.openFolder(currentTask.savePath || currentTask.destinationDir);
    }
  });

  btnCopyUrl?.addEventListener('click', async () => {
    if (currentTask?.url) {
      try {
        await navigator.clipboard.writeText(currentTask.url);
        const orig = btnCopyUrl.textContent;
        btnCopyUrl.textContent = 'Copied!';
        setTimeout(() => { btnCopyUrl.textContent = orig; }, 1500);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    }
  });

  // Load Initial Task
  try {
    const initial = await api.getTask(taskId);
    if (!initial) {
      console.warn(`Task ${taskId} not found in QueueManager`);
      return;
    }
    render(initial);
  } catch (err) {
    console.error(`Error loading task ${taskId}:`, err);
  }

  // Subscribe to Live Queue Events
  api.onTaskProgress((progress) => {
    if (progress && progress.id === taskId) {
      if (currentTask) Object.assign(currentTask, progress);
      render(currentTask || progress);
    }
  });

  api.onTaskUpdated((updated) => {
    if (updated && updated.id === taskId) {
      if (currentTask) Object.assign(currentTask, updated);
      render(currentTask || updated);
    }
  });

  api.onTaskCompleted((completed) => {
    if (completed && completed.id === taskId) {
      if (currentTask) Object.assign(currentTask, completed);
      render(currentTask || completed);
      handleTaskCompleted();
    }
  });

  api.onTaskError((errData) => {
    if (errData && errData.id === taskId) {
      if (currentTask) {
        currentTask.status = 'error';
        currentTask.error = errData.error;
      }
      render(currentTask);
    }
  });

  api.onTaskRemoved((info) => {
    if (info && info.id === taskId) {
      api.closeCurrentWindow();
    }
  });
}

// Start
init();
