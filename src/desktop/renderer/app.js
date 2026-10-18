/**
 * REA-IDM Desktop Renderer Controller (Modernized & Polished)
 */

// Fallback mock if opened in browser for preview
const api = window.reaIdm || {
  getAllTasks: async () => [],
  addTask: async () => ({ id: 'mock' }),
  resumeTask: async () => {},
  pauseTask: async () => {},
  removeTask: async () => {},
  pauseAll: async () => {},
  resumeAll: async () => {},
  setSpeedLimit: async () => {},
  selectFolder: async () => 'D:\\Downloads',
  openFile: async () => {},
  openFolder: async () => {},
  getDefaultDownloadDir: async () => 'D:\\Downloads',
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
  isWindowMaximized: async () => false,
  getChangelog: async () => [],
  getLogs: async () => [],
  clearLogs: async () => true,
  getLogFilePath: async () => 'logs/rea-idm.log',
  openLogDir: async () => {},
  exportLogs: async () => {},
  getTempStats: async () => ({ totalBytes: 0, incompleteTasksCount: 0, orphanedFilesCount: 0, incompleteTasks: [], orphanedFiles: [] }),
  clearIncompleteTemp: async () => ({ freedBytes: 0, cleanedFilesCount: 0, affectedTasksCount: 0 }),
  getSettings: async () => ({ defaultDownloadDir: 'D:\\Downloads', maxConcurrent: 3, defaultConnections: 8, autoCleanTempOnDelete: true }),
  updateSettings: async (s) => s,
  onNewLog: () => () => {},
  onTaskAdded: () => () => {},
  onTaskUpdated: () => () => {},
  onTaskProgress: () => () => {},
  onTaskCompleted: () => () => {},
  onTaskError: () => () => {},
  onTaskRemoved: () => () => {},
  onClipboardUrl: () => () => {},
  onWindowMaximizeState: () => () => {}
};

// State
let tasks = new Map();
let currentCategory = 'all';
let searchQuery = '';
let selectedTaskId = null;
let speedHistory = new Array(60).fill(0);
let activeModalTaskId = null;

// Modern SVG Vector Icons for Table Rows
const CAT_SVGS = {
  Compressed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>`,
  Documents: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
  Music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  Programs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line></svg>`,
  Videos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2.18"></rect><line x1="7" y1="4" x2="7" y2="20"></line><line x1="17" y1="4" x2="17" y2="20"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`,
  General: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};

// Format utilities
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec === 0) return '0.0 KB/s';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}

function formatEta(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// DOM Elements
const tbody = document.getElementById('downloads-tbody');
const emptyState = document.getElementById('empty-state');
const totalSpeedDisplay = document.getElementById('total-speed-display');
const activeTasksCount = document.getElementById('active-tasks-count');
const activeThreadsCount = document.getElementById('active-threads-count');
const speedCanvas = document.getElementById('speed-canvas');
const speedSlider = document.getElementById('speed-limit-slider');
const speedToggle = document.getElementById('toggle-speed-limit');
const speedDisplay = document.getElementById('speed-limit-display');
const searchInput = document.getElementById('input-search');

// Modal Elements
const modalAdd = document.getElementById('modal-add-download');
const modalIndividual = document.getElementById('modal-individual-download') || document.getElementById('modal-segments');
const modalSegments = modalIndividual; // Backward compatibility alias
const modalChangelog = document.getElementById('modal-changelog');
const changelogBody = document.getElementById('changelog-body');
const modalDeleteConfirm = document.getElementById('modal-delete-confirm');
const checkDeleteFromDisk = document.getElementById('check-delete-file-from-disk');
const toastClipboard = document.getElementById('toast-clipboard');
const modalLogs = document.getElementById('modal-logs');
const logsContainer = document.getElementById('logs-container');
const logsCountDisplay = document.getElementById('logs-count-display');
const logsFilePathDisplay = document.getElementById('logs-file-path');
const modalCleanTemp = document.getElementById('modal-clean-temp');
const modalSettings = document.getElementById('modal-settings');
const contextMenuEl = document.getElementById('task-context-menu');

let activeContextTaskId = null;
let pendingDeleteTaskIds = [];
const checkedTaskIds = new Set();
let activeIndividualTaskId = null;
let systemLogs = [];
let logFilterLevel = 'ALL';
let logFilterText = '';
let isLogsModalOpen = false;
let shouldLogAutoScroll = true;

// Initialize Application
async function init() {
  setupWindowControls();
  setupToolbarEvents();
  setupTableEvents();
  setupContextMenuEvents();
  setupSidebarEvents();
  setupModalEvents();
  setupGlobalShortcuts();
  setupSpeedChart();
  setupIpcListeners();

  // Update version tag from Electron app version
  try {
    const version = await api.getAppVersion?.();
    if (version) {
      const tag = document.getElementById('brand-version-tag');
      if (tag) tag.textContent = `v${version}`;
    }
  } catch {}

  // Load existing tasks
  try {
    const initialTasks = await api.getAllTasks();
    for (const t of initialTasks) {
      tasks.set(t.id, t);
    }
    renderTable();
    updateBadges();
  } catch (err) {
    console.error('Failed to load initial tasks:', err);
  }
}

// Window Controls (Explicit stopPropagation & IPC Invoke)
function setupWindowControls() {
  const btnMin = document.getElementById('btn-win-minimize');
  const btnMax = document.getElementById('btn-win-maximize');
  const btnClose = document.getElementById('btn-win-close');

  const onMin = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (window.reaIdm?.minimizeWindow) {
      window.reaIdm.minimizeWindow();
    } else {
      api.minimizeWindow();
    }
  };
  btnMin?.addEventListener('click', onMin);

  const onMax = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (window.reaIdm?.maximizeWindow) {
      window.reaIdm.maximizeWindow();
    } else {
      api.maximizeWindow();
    }
  };
  btnMax?.addEventListener('click', onMax);

  const onClose = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (window.reaIdm?.closeWindow) {
      window.reaIdm.closeWindow();
    } else {
      api.closeWindow();
    }
  };
  btnClose?.addEventListener('click', onClose);

  const updateMaximizeBtn = (isMaximized) => {
    if (!btnMax) return;
    if (isMaximized) {
      btnMax.title = 'Restore';
      btnMax.innerHTML = '<svg viewBox="0 0 12 12"><rect x="1.5" y="3.5" width="7" height="7" stroke="currentColor" stroke-width="1.1" fill="none"/><polyline points="3.5,3.5 3.5,1.5 10.5,1.5 10.5,8.5 8.5,8.5" stroke="currentColor" stroke-width="1.1" fill="none"/></svg>';
    } else {
      btnMax.title = 'Maximize';
      btnMax.innerHTML = '<svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
    }
  };

  try {
    api.isWindowMaximized?.().then(updateMaximizeBtn).catch(() => {});
  } catch {}

  api.onWindowMaximizeState?.((isMax) => {
    updateMaximizeBtn(isMax);
  });
}

// Global Shortcuts (Ctrl+V Paste Link anywhere)
function setupGlobalShortcuts() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return; // Normal paste inside input box
      }
      navigator.clipboard?.readText?.().then(text => {
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          openAddModal(text.trim());
        } else {
          openAddModal();
        }
      }).catch(() => {
        openAddModal();
      });
    }
  });

}

// Table Events & Checkbox Management
function setupTableEvents() {
  // Delegate individual checkbox toggling on tbody
  tbody?.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const id = cb.dataset.id;
    if (!id) return;

    if (cb.checked) {
      checkedTaskIds.add(id);
    } else {
      checkedTaskIds.delete(id);
    }
    updateSelectAllCheckbox();
  });

  // Select all checkbox handler
  const selectAll = document.getElementById('select-all-checkbox');
  selectAll?.addEventListener('change', () => {
    const checked = selectAll.checked;
    const filtered = getFilteredTasks();
    for (const task of filtered) {
      if (checked) {
        checkedTaskIds.add(task.id);
      } else {
        checkedTaskIds.delete(task.id);
      }
    }
    document.querySelectorAll('.downloads-table tbody input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
    });
  });
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('select-all-checkbox');
  if (!selectAll) return;
  const filtered = getFilteredTasks();
  if (filtered.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  const checkedCount = filtered.filter(t => checkedTaskIds.has(t.id)).length;
  if (checkedCount === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else if (checkedCount === filtered.length) {
    selectAll.checked = true;
    selectAll.indeterminate = false;
  } else {
    selectAll.checked = false;
    selectAll.indeterminate = true;
  }
}

// ==========================================================================
// IDM Desktop Context Menu
// ==========================================================================
function setupContextMenuEvents() {
  // Global dismiss listeners
  window.addEventListener('click', (e) => {
    if (!e.target.closest('#task-context-menu')) {
      hideContextMenu();
    }
  });

  window.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.downloads-table tbody tr')) {
      hideContextMenu();
    }
  });

  window.addEventListener('scroll', hideContextMenu, true);
  tbody?.addEventListener('scroll', hideContextMenu);

  // Menu action items
  document.getElementById('ctx-action-primary')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const task = tasks.get(activeContextTaskId);
    hideContextMenu();
    if (!task) return;
    if (task.status === 'downloading' || task.status === 'probing') {
      await api.pauseTask(task.id);
    } else if (task.status === 'completed') {
      await api.clearIncompleteTemp({ taskIds: [task.id], removeTasks: false, cleanOrphaned: false });
      await api.resumeTask(task.id);
    } else {
      await api.resumeTask(task.id);
    }
  });

  document.getElementById('ctx-action-open-file')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const task = tasks.get(activeContextTaskId);
    hideContextMenu();
    if (task && task.status === 'completed' && task.savePath) {
      api.openFile(task.savePath);
    }
  });

  document.getElementById('ctx-action-open-folder')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const task = tasks.get(activeContextTaskId);
    hideContextMenu();
    if (task) {
      api.openFolder(task.savePath || task.destinationDir);
    }
  });

  document.getElementById('ctx-action-redownload')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const task = tasks.get(activeContextTaskId);
    hideContextMenu();
    if (task) {
      await api.clearIncompleteTemp({ taskIds: [task.id], removeTasks: false, cleanOrphaned: false });
      await api.resumeTask(task.id);
    }
  });

  document.getElementById('ctx-action-copy-url')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const task = tasks.get(activeContextTaskId);
    hideContextMenu();
    if (task?.url) {
      navigator.clipboard?.writeText?.(task.url);
      const toastUrl = document.getElementById('toast-url-text');
      const toastTitle = document.querySelector('.toast-title');
      if (toastClipboard && toastUrl && toastTitle) {
        toastTitle.textContent = 'URL Copied to Clipboard';
        toastUrl.textContent = task.url;
        toastClipboard.style.display = 'flex';
        setTimeout(() => {
          if (toastTitle.textContent === 'URL Copied to Clipboard') {
            toastClipboard.style.display = 'none';
          }
        }, 2200);
      }
    }
  });

  document.getElementById('ctx-action-clean-temp')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const task = tasks.get(activeContextTaskId);
    hideContextMenu();
    if (task && task.status !== 'completed') {
      const res = await api.clearIncompleteTemp({ taskIds: [task.id], removeTasks: false, cleanOrphaned: false });
      const all = await api.getAllTasks();
      tasks.clear();
      for (const t of all) tasks.set(t.id, t);
      renderTable();
      updateBadges();
      alert(`Cleaned temporary cache for "${task.filename}".\nFreed space: ${formatBytes(res.freedBytes || 0)}`);
    }
  });

  document.getElementById('ctx-action-properties')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const id = activeContextTaskId;
    hideContextMenu();
    openIndividualDownloadModal(id);
  });

  document.getElementById('ctx-action-delete')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeContextTaskId) return;
    const id = activeContextTaskId;
    hideContextMenu();
    openDeleteModal([id]);
  });
}

function showContextMenu(e, task) {
  e.preventDefault();
  e.stopPropagation();

  // If this item is not already checked, set it as single selected item
  if (!checkedTaskIds.has(task.id)) {
    document.querySelectorAll('.downloads-table tbody tr').forEach(r => r.classList.remove('selected'));
    const tr = document.getElementById(`row-${task.id}`);
    tr?.classList.add('selected');
    selectedTaskId = task.id;
  }

  activeContextTaskId = task.id;
  updateContextMenuContent(task);

  if (!contextMenuEl) return;
  contextMenuEl.style.display = 'block';
  contextMenuEl.style.visibility = 'hidden';

  const menuWidth = contextMenuEl.offsetWidth || 230;
  const menuHeight = contextMenuEl.offsetHeight || 300;

  // Viewport bounds calculation
  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth - 8) {
    x = Math.max(8, window.innerWidth - menuWidth - 8);
  }
  if (y + menuHeight > window.innerHeight - 8) {
    y = Math.max(8, window.innerHeight - menuHeight - 8);
  }

  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;
  contextMenuEl.style.visibility = 'visible';
}

function hideContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.style.display = 'none';
  }
  activeContextTaskId = null;
}

function updateContextMenuContent(task) {
  if (!task) return;
  const titleEl = document.getElementById('ctx-header-title');
  const actionPrimary = document.getElementById('ctx-action-primary');
  const iconPrimary = document.getElementById('ctx-icon-primary');
  const labelPrimary = document.getElementById('ctx-label-primary');
  const actionOpenFile = document.getElementById('ctx-action-open-file');
  const actionCleanTemp = document.getElementById('ctx-action-clean-temp');

  if (titleEl) {
    titleEl.textContent = task.filename || 'Download';
    titleEl.title = task.savePath || task.url || '';
  }

  // Primary action: Pause vs Resume vs Redownload
  if (task.status === 'downloading' || task.status === 'probing') {
    if (labelPrimary) labelPrimary.textContent = 'Pause Download';
    if (iconPrimary) {
      iconPrimary.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    }
  } else if (task.status === 'completed') {
    if (labelPrimary) labelPrimary.textContent = 'Redownload (Start Over)';
    if (iconPrimary) {
      iconPrimary.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
    }
  } else {
    if (labelPrimary) labelPrimary.textContent = 'Resume / Start Download';
    if (iconPrimary) {
      iconPrimary.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    }
  }

  // Open file is only active for completed downloads
  if (actionOpenFile) {
    if (task.status === 'completed') {
      actionOpenFile.classList.remove('disabled');
      actionOpenFile.title = 'Open downloaded file';
    } else {
      actionOpenFile.classList.add('disabled');
      actionOpenFile.title = 'File download not completed yet';
    }
  }

  // Clean Temp is only relevant for incomplete downloads
  if (actionCleanTemp) {
    if (task.status === 'completed') {
      actionCleanTemp.classList.add('disabled');
      actionCleanTemp.title = 'Download is already completed';
    } else {
      actionCleanTemp.classList.remove('disabled');
      actionCleanTemp.title = 'Delete partial data & .rea-meta cache for this file';
    }
  }
}

// Helper to get target task IDs (checked checkboxes or single selected row)
function getTargetTaskIds() {
  if (checkedTaskIds.size > 0) {
    return Array.from(checkedTaskIds);
  }
  if (selectedTaskId) {
    return [selectedTaskId];
  }
  return [];
}

// Toolbar & Speed Slider with Toggle
function setupToolbarEvents() {
  document.getElementById('btn-open-add-modal')?.addEventListener('click', () => openAddModal());
  document.getElementById('btn-empty-add')?.addEventListener('click', () => openAddModal());

  document.getElementById('btn-toolbar-resume')?.addEventListener('click', async () => {
    const ids = getTargetTaskIds();
    if (ids.length === 0) {
      alert('Please select or check a download to resume.');
      return;
    }
    for (const id of ids) {
      await api.resumeTask(id);
    }
  });

  document.getElementById('btn-toolbar-pause')?.addEventListener('click', async () => {
    const ids = getTargetTaskIds();
    if (ids.length === 0) {
      alert('Please select or check a download to pause.');
      return;
    }
    for (const id of ids) {
      await api.pauseTask(id);
    }
  });

  document.getElementById('btn-toolbar-delete')?.addEventListener('click', () => {
    const ids = getTargetTaskIds();
    if (ids.length === 0) {
      alert('Please select or check a download to delete.');
      return;
    }
    openDeleteModal(ids);
  });

  document.getElementById('btn-toolbar-pause-all')?.addEventListener('click', () => api.pauseAll());
  document.getElementById('btn-toolbar-resume-all')?.addEventListener('click', () => api.resumeAll());

  // Speed Limit Toggle
  speedToggle?.addEventListener('change', () => {
    if (speedToggle.checked) {
      speedSlider.disabled = false;
      const val = parseInt(speedSlider.value, 10) || 10;
      speedSlider.value = val;
      const bytesPerSec = val * 500 * 1024;
      speedDisplay.textContent = formatSpeed(bytesPerSec);
      api.setSpeedLimit(bytesPerSec);
    } else {
      speedSlider.disabled = true;
      speedDisplay.textContent = 'OFF';
      api.setSpeedLimit(0);
    }
  });

  speedSlider?.addEventListener('input', (e) => {
    if (!speedToggle?.checked) return;
    const val = parseInt(e.target.value, 10);
    if (val === 0) {
      speedDisplay.textContent = 'Unlimited';
      api.setSpeedLimit(0);
    } else {
      const bytesPerSec = val * 500 * 1024;
      speedDisplay.textContent = formatSpeed(bytesPerSec);
      api.setSpeedLimit(bytesPerSec);
    }
  });

  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });
}

// Sidebar Category Filtering
function setupSidebarEvents() {
  const items = document.querySelectorAll('.nav-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentCategory = item.dataset.category;
      renderTable();
    });
  });
}

// Modals Setup (Full Keyboard & Backdrop Support)
function setupModalEvents() {
  document.getElementById('btn-modal-close')?.addEventListener('click', () => closeAddModal());
  document.getElementById('btn-modal-cancel')?.addEventListener('click', () => closeAddModal());

  // Backdrop click to dismiss
  modalAdd?.addEventListener('click', (e) => {
    if (e.target === modalAdd) closeAddModal();
  });
  modalIndividual?.addEventListener('click', (e) => {
    if (e.target === modalIndividual) closeIndividualDownloadModal();
  });
  modalChangelog?.addEventListener('click', (e) => {
    if (e.target === modalChangelog) closeChangelogModal();
  });
  modalDeleteConfirm?.addEventListener('click', (e) => {
    if (e.target === modalDeleteConfirm) closeDeleteModal();
  });
  modalLogs?.addEventListener('click', (e) => {
    if (e.target === modalLogs) closeLogsModal();
  });
  modalCleanTemp?.addEventListener('click', (e) => {
    if (e.target === modalCleanTemp) closeCleanTempModal();
  });
  modalSettings?.addEventListener('click', (e) => {
    if (e.target === modalSettings) closeSettingsModal();
  });

  // Escape key to dismiss any open modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
      closeAddModal();
      closeIndividualDownloadModal();
      closeChangelogModal();
      closeDeleteModal();
      closeLogsModal();
      closeCleanTempModal();
      closeSettingsModal();
    }
  });

  // Enter key inside URL input to immediately download
  document.getElementById('input-download-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddDownloadSubmit(true);
    }
  });
  document.getElementById('input-download-filename')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddDownloadSubmit(true);
    }
  });

  document.getElementById('btn-browse-folder')?.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (folder) {
      document.getElementById('input-save-path').value = folder;
    }
  });

  document.getElementById('btn-download-now')?.addEventListener('click', () => handleAddDownloadSubmit(true));
  document.getElementById('btn-download-later')?.addEventListener('click', () => handleAddDownloadSubmit(false));

  // Individual Download Dialog (IDM Status) Controls
  document.getElementById('btn-indiv-modal-close')?.addEventListener('click', () => closeIndividualDownloadModal());
  document.getElementById('btn-indiv-close')?.addEventListener('click', () => closeIndividualDownloadModal());
  document.getElementById('btn-segments-modal-close')?.addEventListener('click', () => closeIndividualDownloadModal());
  document.getElementById('btn-segments-close')?.addEventListener('click', () => closeIndividualDownloadModal());

  document.getElementById('btn-indiv-pause-resume')?.addEventListener('click', async () => {
    if (!activeIndividualTaskId) return;
    const task = tasks.get(activeIndividualTaskId);
    if (!task) return;
    if (task.status === 'downloading' || task.status === 'probing') {
      await api.pauseTask(task.id);
    } else {
      await api.resumeTask(task.id);
    }
  });

  document.getElementById('btn-indiv-open-file')?.addEventListener('click', () => {
    if (!activeIndividualTaskId) return;
    const task = tasks.get(activeIndividualTaskId);
    if (task && (task.savePath || task.destinationDir)) {
      api.openFile(task.savePath);
    }
  });

  document.getElementById('btn-indiv-open-folder')?.addEventListener('click', () => {
    if (!activeIndividualTaskId) return;
    const task = tasks.get(activeIndividualTaskId);
    if (task) {
      api.openFolder(task.savePath || task.destinationDir);
    }
  });

  document.getElementById('btn-indiv-open-folder-inline')?.addEventListener('click', () => {
    if (!activeIndividualTaskId) return;
    const task = tasks.get(activeIndividualTaskId);
    if (task) {
      api.openFolder(task.savePath || task.destinationDir);
    }
  });

  document.getElementById('btn-indiv-cancel')?.addEventListener('click', () => {
    if (!activeIndividualTaskId) return;
    const id = activeIndividualTaskId;
    closeIndividualDownloadModal();
    openDeleteModal([id]);
  });

  document.getElementById('btn-indiv-copy-url')?.addEventListener('click', () => {
    if (!activeIndividualTaskId) return;
    const task = tasks.get(activeIndividualTaskId);
    if (task?.url) {
      navigator.clipboard?.writeText?.(task.url);
      const btn = document.getElementById('btn-indiv-copy-url');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      }
    }
  });

  document.getElementById('btn-toast-dismiss')?.addEventListener('click', () => {
    toastClipboard.style.display = 'none';
  });

  document.getElementById('btn-toast-download')?.addEventListener('click', () => {
    const url = document.getElementById('toast-url-text').textContent;
    toastClipboard.style.display = 'none';
    openAddModal(url);
  });

  // Changelog Modal Triggers & Close
  document.getElementById('brand-version-tag')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openChangelogModal();
  });
  document.getElementById('btn-toolbar-changelog')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openChangelogModal();
  });
  document.getElementById('btn-changelog-modal-close')?.addEventListener('click', () => closeChangelogModal());
  document.getElementById('btn-changelog-close')?.addEventListener('click', () => closeChangelogModal());

  // Logs Modal Triggers & Actions
  document.getElementById('btn-toolbar-logs')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLogsModal();
  });
  document.getElementById('btn-logs-modal-close')?.addEventListener('click', () => closeLogsModal());
  document.getElementById('btn-logs-close')?.addEventListener('click', () => closeLogsModal());

  document.querySelectorAll('.logs-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.logs-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logFilterLevel = btn.dataset.level || 'ALL';
      renderLogsList();
    });
  });

  document.getElementById('input-logs-search')?.addEventListener('input', (e) => {
    logFilterText = e.target.value.toLowerCase().trim();
    renderLogsList();
  });

  document.getElementById('btn-logs-copy')?.addEventListener('click', () => {
    const visibleEntries = getFilteredLogs();
    const text = visibleEntries.map(l => l.raw || `${l.timestamp} [${l.levelName}] [${l.category}] ${l.message}`).join('\n');
    navigator.clipboard?.writeText?.(text);
    const btn = document.getElementById('btn-logs-copy');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  });

  document.getElementById('btn-logs-export')?.addEventListener('click', async () => {
    try {
      await api.exportLogs();
    } catch (err) {
      console.error('Failed to export logs:', err);
    }
  });

  document.getElementById('btn-logs-folder')?.addEventListener('click', async () => {
    try {
      await api.openLogDir();
    } catch (err) {
      console.error('Failed to open log folder:', err);
    }
  });

  document.getElementById('btn-logs-clear')?.addEventListener('click', async () => {
    try {
      await api.clearLogs();
      systemLogs = [];
      renderLogsList();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  });

  logsContainer?.addEventListener('scroll', () => {
    const threshold = 30;
    const isAtBottom = logsContainer.scrollHeight - logsContainer.scrollTop - logsContainer.clientHeight <= threshold;
    shouldLogAutoScroll = isAtBottom;
  });

  // Delete Confirmation Modal Triggers & Close
  document.getElementById('btn-delete-modal-close')?.addEventListener('click', () => closeDeleteModal());
  document.getElementById('btn-delete-cancel')?.addEventListener('click', () => closeDeleteModal());
  document.getElementById('btn-delete-confirm')?.addEventListener('click', async () => {
    const deleteFiles = !!checkDeleteFromDisk?.checked;
    const idsToDelete = [...pendingDeleteTaskIds];
    closeDeleteModal();

    for (const id of idsToDelete) {
      checkedTaskIds.delete(id);
      await api.removeTask(id, deleteFiles);
    }
    selectedTaskId = null;
    updateSelectAllCheckbox();
  });

  // Clean Temp Modal Triggers & Actions
  document.getElementById('btn-toolbar-clean-temp')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCleanTempModal();
  });
  document.getElementById('btn-clean-temp-close-x')?.addEventListener('click', () => closeCleanTempModal());
  document.getElementById('btn-clean-cancel')?.addEventListener('click', () => closeCleanTempModal());
  document.getElementById('btn-clean-refresh-stats')?.addEventListener('click', () => refreshCleanTempStats());
  document.getElementById('btn-clean-execute')?.addEventListener('click', () => executeCleanTemp());
  document.getElementById('check-clean-select-all')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.check-clean-task-item').forEach(cb => {
      cb.checked = checked;
    });
  });

  // Settings Modal Triggers & Actions
  document.getElementById('btn-toolbar-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettingsModal();
  });
  document.getElementById('btn-settings-close-x')?.addEventListener('click', () => closeSettingsModal());
  document.getElementById('btn-settings-cancel')?.addEventListener('click', () => closeSettingsModal());
  document.getElementById('btn-settings-save')?.addEventListener('click', () => saveSettingsFromModal());
  document.getElementById('btn-setting-browse-dir')?.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (folder) {
      const input = document.getElementById('setting-download-dir');
      if (input) input.value = folder;
    }
  });
  document.getElementById('btn-setting-open-cleaner')?.addEventListener('click', () => {
    closeSettingsModal();
    openCleanTempModal();
  });
}

async function openAddModal(prefillUrl = '') {
  const inputUrl = document.getElementById('input-download-url');
  const inputFilename = document.getElementById('input-download-filename');
  const inputSavePath = document.getElementById('input-save-path');

  inputUrl.value = prefillUrl;
  inputFilename.value = '';
  if (!inputSavePath.value || inputSavePath.value === 'Default Downloads Folder') {
    try {
      const defaultDir = await api.getDefaultDownloadDir();
      inputSavePath.value = defaultDir || 'Default Downloads Folder';
    } catch {
      inputSavePath.value = 'Default Downloads Folder';
    }
  }

  modalAdd.style.display = 'flex';
  inputUrl.focus();
}

function closeAddModal() {
  modalAdd.style.display = 'none';
}

async function handleAddDownloadSubmit(autoStart) {
  const url = document.getElementById('input-download-url').value.trim();
  if (!url) {
    alert('Please enter a valid URL');
    return;
  }

  const filename = document.getElementById('input-download-filename').value.trim() || undefined;
  const saveFolderVal = document.getElementById('input-save-path').value;
  const destinationDir = saveFolderVal !== 'Default Downloads Folder' ? saveFolderVal : undefined;
  const connections = parseInt(document.getElementById('select-connections').value, 10);

  try {
    const newTask = await api.addTask({
      url,
      filename,
      destinationDir,
      connections,
      autoStart
    });
    closeAddModal();
    if (autoStart && newTask?.id) {
      tasks.set(newTask.id, newTask);
      openIndividualDownloadModal(newTask.id);
    }
  } catch (err) {
    alert(`Error adding download: ${err.message}`);
  }
}

function openIndividualDownloadModal(taskId) {
  const task = tasks.get(taskId);
  if (!task) return;
  activeIndividualTaskId = taskId;

  renderIndividualModalContent(task);
  if (modalIndividual) {
    modalIndividual.style.display = 'flex';
  }
}

function closeIndividualDownloadModal() {
  activeIndividualTaskId = null;
  if (modalIndividual) {
    modalIndividual.style.display = 'none';
  }
}

// Aliases for backward compatibility
function openSegmentsModal(taskId) {
  openIndividualDownloadModal(taskId);
}

function closeSegmentsModal() {
  closeIndividualDownloadModal();
}

function closeChangelogModal() {
  if (modalChangelog) {
    modalChangelog.style.display = 'none';
  }
}

function openDeleteModal(taskIds) {
  if (!taskIds || taskIds.length === 0) return;
  pendingDeleteTaskIds = taskIds;

  const msgEl = document.getElementById('delete-prompt-msg');
  const nameEl = document.getElementById('delete-file-name');
  const pathEl = document.getElementById('delete-file-path');

  if (checkDeleteFromDisk) checkDeleteFromDisk.checked = false;

  if (taskIds.length === 1) {
    const task = tasks.get(taskIds[0]);
    if (msgEl) msgEl.textContent = 'Remove selected download from list?';
    if (nameEl) nameEl.textContent = task ? task.filename : 'Selected file';
    if (pathEl) pathEl.textContent = '📁 ' + ((task && (task.savePath || task.destinationDir)) || 'Default Downloads Folder');
  } else {
    if (msgEl) msgEl.textContent = `Remove ${taskIds.length} selected downloads from list?`;
    if (nameEl) nameEl.textContent = `${taskIds.length} items selected`;
    if (pathEl) pathEl.textContent = '📁 Multiple directories / files';
  }

  if (modalDeleteConfirm) {
    modalDeleteConfirm.style.display = 'flex';
  }
}

function closeDeleteModal() {
  if (modalDeleteConfirm) {
    modalDeleteConfirm.style.display = 'none';
  }
  pendingDeleteTaskIds = [];
}

function formatPathDisplay(fullPath) {
  if (!fullPath) return 'Downloads';
  const norm = fullPath.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length === 0) return fullPath;
  return parts[parts.length - 1];
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMarkdownInline(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  return escaped;
}

async function openChangelogModal() {
  if (!modalChangelog) return;
  modalChangelog.style.display = 'flex';

  if (!changelogBody) return;
  changelogBody.innerHTML = '<div class="changelog-loading">Loading release notes...</div>';

  try {
    const releases = await api.getChangelog();
    renderChangelogContent(releases);
  } catch (err) {
    console.error('Failed to load changelog:', err);
    changelogBody.innerHTML = `<div style="color: var(--accent-rose); padding: 12px;">Failed to load release notes: ${escapeHtml(err.message)}</div>`;
  }
}

function renderChangelogContent(releases) {
  if (!changelogBody) return;
  if (!releases || releases.length === 0) {
    changelogBody.innerHTML = '<div style="color: var(--text-sub); padding: 12px;">No changelog entries found.</div>';
    return;
  }

  const sectionBadges = {
    added: { label: 'Added', class: 'badge-added' },
    fixed: { label: 'Fixed', class: 'badge-fixed' },
    changed: { label: 'Changed', class: 'badge-changed' },
    security: { label: 'Security', class: 'badge-security' },
    deprecated: { label: 'Deprecated', class: 'badge-changed' },
    removed: { label: 'Removed', class: 'badge-security' }
  };

  changelogBody.innerHTML = '';

  for (const rel of releases) {
    const card = document.createElement('div');
    card.className = 'changelog-release-card';

    const header = document.createElement('div');
    header.className = 'changelog-release-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'changelog-version-title';
    titleEl.innerHTML = `
      <span>Version ${escapeHtml(rel.version)}</span>
      ${rel.isUnreleased ? '<span class="changelog-version-tag">In Development</span>' : '<span class="changelog-version-tag">Stable</span>'}
    `;

    const dateEl = document.createElement('div');
    dateEl.className = 'changelog-release-date';
    dateEl.textContent = rel.date || (rel.isUnreleased ? 'Upcoming' : '');

    header.appendChild(titleEl);
    header.appendChild(dateEl);
    card.appendChild(header);

    let hasSections = false;
    const sectionsOrder = ['added', 'fixed', 'changed', 'security', 'deprecated', 'removed'];

    for (const secKey of sectionsOrder) {
      const items = rel.sections?.[secKey] || [];
      if (items.length === 0) continue;
      hasSections = true;

      const secMeta = sectionBadges[secKey] || { label: secKey, class: 'badge-changed' };
      const secContainer = document.createElement('div');
      secContainer.className = 'changelog-section';

      const secHeader = document.createElement('div');
      secHeader.className = `changelog-section-header ${secMeta.class}`;
      secHeader.textContent = secMeta.label;

      const ul = document.createElement('ul');
      ul.className = 'changelog-item-list';

      for (const item of items) {
        const li = document.createElement('li');
        li.className = 'changelog-item';
        li.innerHTML = formatMarkdownInline(item);
        ul.appendChild(li);
      }

      secContainer.appendChild(secHeader);
      secContainer.appendChild(ul);
      card.appendChild(secContainer);
    }

    if (!hasSections) {
      const noContent = document.createElement('div');
      noContent.style.color = 'var(--text-sub)';
      noContent.style.fontSize = '12px';
      noContent.style.padding = '4px 0';
      noContent.textContent = 'No detailed bullet points for this release.';
      card.appendChild(noContent);
    }

    changelogBody.appendChild(card);
  }
}

async function openLogsModal() {
  if (!modalLogs) return;
  modalLogs.style.display = 'flex';
  isLogsModalOpen = true;

  try {
    const filePath = await api.getLogFilePath?.();
    if (filePath && logsFilePathDisplay) {
      logsFilePathDisplay.textContent = formatPathDisplay(filePath);
      logsFilePathDisplay.title = filePath;
    }
  } catch {}

  try {
    const logs = await api.getLogs({ limit: 400 });
    if (Array.isArray(logs)) {
      systemLogs = logs;
    }
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  }

  renderLogsList();
}

function closeLogsModal() {
  if (modalLogs) {
    modalLogs.style.display = 'none';
  }
  isLogsModalOpen = false;
}

function getFilteredLogs() {
  return systemLogs.filter(matchesLogFilter);
}

function matchesLogFilter(entry) {
  if (!entry) return false;
  if (logFilterLevel !== 'ALL' && entry.levelName !== logFilterLevel) {
    return false;
  }
  if (logFilterText) {
    const raw = (entry.raw || `${entry.message} ${entry.category} ${entry.details || ''}`).toLowerCase();
    if (!raw.includes(logFilterText)) return false;
  }
  return true;
}

function updateLogStats() {
  const visible = getFilteredLogs();
  if (logsCountDisplay) {
    logsCountDisplay.textContent = `${visible.length} / ${systemLogs.length} entries`;
  }
}

function renderLogsList() {
  if (!logsContainer) return;
  const filtered = getFilteredLogs();
  updateLogStats();

  if (filtered.length === 0) {
    logsContainer.innerHTML = '<div class="logs-empty-placeholder">No log events match current filter.</div>';
    return;
  }

  logsContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const entry of filtered) {
    fragment.appendChild(createLogEntryElement(entry));
  }
  logsContainer.appendChild(fragment);

  if (shouldLogAutoScroll) {
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
}

function createLogEntryElement(entry) {
  const row = document.createElement('div');
  const levelLower = (entry.levelName || 'info').toLowerCase();
  row.className = `log-entry-row log-entry-${levelLower}`;

  // Time format: HH:mm:ss.SSS
  let timeStr = '';
  try {
    const d = new Date(entry.timestamp);
    timeStr = d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    timeStr = entry.timestamp || '';
  }

  const badgeClass = `log-badge log-badge-${levelLower}`;
  
  let detailsHtml = '';
  if (entry.details) {
    const detStr = typeof entry.details === 'object' ? JSON.stringify(entry.details, null, 2) : String(entry.details);
    detailsHtml = `<div class="log-details-block">${escapeHtml(detStr)}</div>`;
  }

  row.innerHTML = `
    <span class="log-time">${escapeHtml(timeStr)}</span>
    <span class="${badgeClass}">${escapeHtml(entry.levelName || 'INFO')}</span>
    <span class="log-category">[${escapeHtml(entry.category || 'GENERAL')}]</span>
    <div class="log-msg">
      <span>${escapeHtml(entry.message || '')}</span>
      ${detailsHtml}
    </div>
  `;
  return row;
}

function appendLogEntryRow(entry) {
  if (!logsContainer) return;
  const empty = logsContainer.querySelector('.logs-empty-placeholder');
  if (empty) empty.remove();

  const row = createLogEntryElement(entry);
  logsContainer.appendChild(row);

  if (shouldLogAutoScroll) {
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
}

// ==========================================================================
// Clean Incomplete Temp & Cache Functions
// ==========================================================================
let currentTempStats = null;

async function openCleanTempModal() {
  if (!modalCleanTemp) return;
  modalCleanTemp.style.display = 'flex';
  await refreshCleanTempStats();
}

function closeCleanTempModal() {
  if (modalCleanTemp) {
    modalCleanTemp.style.display = 'none';
  }
}

async function refreshCleanTempStats() {
  const heroBytes = document.getElementById('clean-hero-bytes');
  const heroDesc = document.getElementById('clean-hero-desc');
  const container = document.getElementById('clean-files-container');
  const btnExecute = document.getElementById('btn-clean-execute');
  const selectAll = document.getElementById('check-clean-select-all');

  if (heroBytes) heroBytes.textContent = 'Scanning disk...';
  if (heroDesc) heroDesc.textContent = 'Analyzing incomplete downloads and cache files...';
  if (container) container.innerHTML = '<div class="clean-empty-msg">Scanning disk storage...</div>';

  try {
    currentTempStats = await api.getTempStats();
  } catch (err) {
    console.error('Failed to get temp stats:', err);
    currentTempStats = { totalBytes: 0, incompleteTasksCount: 0, orphanedFilesCount: 0, incompleteTasks: [], orphanedFiles: [] };
  }

  const { totalBytes = 0, incompleteTasksCount = 0, orphanedFilesCount = 0, incompleteTasks = [], orphanedFiles = [] } = currentTempStats;

  if (heroBytes) heroBytes.textContent = `${formatBytes(totalBytes)} Reclaimable Space`;
  if (heroDesc) {
    heroDesc.textContent = `Found ${incompleteTasksCount} incomplete download(s) and ${orphanedFilesCount} abandoned cache/metadata file(s).`;
  }

  if (!container) return;
  container.innerHTML = '';

  if (incompleteTasks.length === 0 && orphanedFiles.length === 0) {
    container.innerHTML = '<div class="clean-empty-msg">No incomplete downloads or abandoned cache files found on disk.</div>';
    if (selectAll) {
      selectAll.checked = false;
      selectAll.disabled = true;
    }
    if (btnExecute) {
      btnExecute.disabled = true;
      btnExecute.style.opacity = '0.5';
    }
    return;
  }

  if (selectAll) {
    selectAll.checked = true;
    selectAll.disabled = false;
  }
  if (btnExecute) {
    btnExecute.disabled = false;
    btnExecute.style.opacity = '1';
  }

  // Render incomplete downloads
  for (const task of incompleteTasks) {
    const item = document.createElement('div');
    item.className = 'clean-file-item';
    const percentVal = calculateTaskPercent(task);
    item.innerHTML = `
      <label class="clean-file-left" style="cursor: pointer;">
        <input type="checkbox" class="check-clean-task-item" data-id="${escapeHtml(task.id)}" checked>
        <span class="clean-file-name" title="${escapeHtml(task.savePath || task.filename)}">${escapeHtml(task.filename || 'Download')}</span>
        <span class="clean-file-badge">${escapeHtml(task.status)} (${percentVal.toFixed(1)}%)</span>
      </label>
      <span class="clean-file-right">${formatBytes(task.diskBytes || task.downloadedBytes)}</span>
    `;
    container.appendChild(item);
  }

  // Render orphaned metadata files if any
  for (const orphaned of orphanedFiles) {
    const item = document.createElement('div');
    item.className = 'clean-file-item';
    item.innerHTML = `
      <div class="clean-file-left">
        <span class="clean-file-name" style="color: #94a3b8;" title="${escapeHtml(orphaned.filepath)}">${escapeHtml(orphaned.filename)}</span>
        <span class="clean-file-badge" style="background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border-color: rgba(148, 163, 184, 0.3);">Orphaned Cache</span>
      </div>
      <span class="clean-file-right">${formatBytes(orphaned.size)}</span>
    `;
    container.appendChild(item);
  }

  // Individual checkbox listeners to update select-all checkbox state
  const checkboxes = container.querySelectorAll('.check-clean-task-item');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const allChecked = Array.from(checkboxes).every(c => c.checked);
      const someChecked = Array.from(checkboxes).some(c => c.checked);
      if (selectAll) {
        selectAll.checked = allChecked;
        selectAll.indeterminate = !allChecked && someChecked;
      }
    });
  });
}

async function executeCleanTemp() {
  const btnExecute = document.getElementById('btn-clean-execute');
  const btnLabel = document.getElementById('btn-clean-label');
  const modeRadio = document.querySelector('input[name="clean-action-mode"]:checked');
  const mode = modeRadio ? modeRadio.value : 'reset';
  const cleanOrphaned = !!document.getElementById('check-clean-orphaned')?.checked;

  const checkedBoxes = document.querySelectorAll('.check-clean-task-item:checked');
  const taskIds = Array.from(checkedBoxes).map(cb => cb.dataset.id).filter(Boolean);

  if (taskIds.length === 0 && !cleanOrphaned) {
    alert('Please select at least one incomplete download or enable orphaned cache cleaning.');
    return;
  }

  if (btnExecute) {
    btnExecute.disabled = true;
    btnExecute.style.opacity = '0.7';
  }
  if (btnLabel) btnLabel.textContent = 'Cleaning...';

  try {
    const res = await api.clearIncompleteTemp({
      taskIds,
      removeTasks: mode === 'remove',
      cleanOrphaned
    });

    // Refresh UI tasks list
    const all = await api.getAllTasks();
    tasks.clear();
    for (const t of all) {
      tasks.set(t.id, t);
    }
    renderTable();
    updateBadges();

    const freedStr = formatBytes(res.freedBytes || 0);
    const countStr = res.cleanedFilesCount || 0;
    alert(`Cleanup Complete!\nSuccessfully freed ${freedStr} across ${countStr} temporary/cache files.`);
    closeCleanTempModal();
  } catch (err) {
    console.error('Failed to clean temp files:', err);
    alert('Failed to clean temp files: ' + (err.message || err));
  } finally {
    if (btnExecute) {
      btnExecute.disabled = false;
      btnExecute.style.opacity = '1';
    }
    if (btnLabel) btnLabel.textContent = 'Clean Incomplete Temp';
  }
}

// ==========================================================================
// Settings Functions
// ==========================================================================
async function openSettingsModal() {
  if (!modalSettings) return;
  modalSettings.style.display = 'flex';
  await loadSettingsIntoModal();
}

function closeSettingsModal() {
  if (modalSettings) {
    modalSettings.style.display = 'none';
  }
}

async function loadSettingsIntoModal() {
  try {
    const settings = await api.getSettings();
    if (settings) {
      const dirInput = document.getElementById('setting-download-dir');
      if (dirInput) dirInput.value = settings.defaultDownloadDir || '';

      const maxConc = document.getElementById('setting-max-concurrent');
      if (maxConc && settings.maxConcurrent) {
        maxConc.value = String(settings.maxConcurrent);
      }

      const defConns = document.getElementById('setting-default-conns');
      if (defConns && settings.defaultConnections) {
        defConns.value = String(settings.defaultConnections);
      }

      const autoClean = document.getElementById('setting-auto-clean-temp');
      if (autoClean) {
        autoClean.checked = settings.autoCleanTempOnDelete !== false;
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettingsFromModal() {
  const dirInput = document.getElementById('setting-download-dir');
  const maxConc = document.getElementById('setting-max-concurrent');
  const defConns = document.getElementById('setting-default-conns');
  const autoClean = document.getElementById('setting-auto-clean-temp');

  const newSettings = {
    defaultDownloadDir: dirInput?.value?.trim() || undefined,
    maxConcurrent: parseInt(maxConc?.value, 10) || 3,
    defaultConnections: parseInt(defConns?.value, 10) || 8,
    autoCleanTempOnDelete: !!autoClean?.checked
  };

  try {
    await api.updateSettings(newSettings);
    closeSettingsModal();
  } catch (err) {
    console.error('Failed to save settings:', err);
    alert('Failed to save settings: ' + (err.message || err));
  }
}

function calculateTaskPercent(task) {
  if (task.status === 'completed') return 100;
  const total = Number(task.totalBytes) || 0;
  const downloaded = Number(task.downloadedBytes) || 0;
  if (total > 0 && downloaded > 0) {
    return parseFloat(Math.min(100, (downloaded / total) * 100).toFixed(1));
  }
  if (typeof task.percent === 'number' && !isNaN(task.percent)) {
    return task.percent;
  }
  return 0;
}

function formatSizeCell(task) {
  const downloaded = Number(task.downloadedBytes) || 0;
  const total = Number(task.totalBytes) || 0;
  if (task.status === 'completed') {
    return `<span class="size-downloaded">${formatBytes(total || downloaded)}</span>`;
  }
  if (total > 0 && downloaded > 0) {
    return `<div class="size-split-view">
      <span class="size-downloaded">${formatBytes(downloaded)}</span>
      <span class="size-total">of ${formatBytes(total)}</span>
    </div>`;
  }
  if (total > 0) {
    return `<span class="size-total">${formatBytes(total)}</span>`;
  }
  if (downloaded > 0) {
    return `<span class="size-downloaded">${formatBytes(downloaded)}</span>`;
  }
  return `<span class="size-total">0 B</span>`;
}

function formatResumeBadge(task) {
  if (task.resumable === true) {
    return `
      <span class="file-resume-badge resumable-yes" title="Resume capability: Supported by remote server">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        <span>Resume: Yes</span>
      </span>
    `;
  }
  if (task.resumable === false) {
    return `
      <span class="file-resume-badge resumable-no" title="Resume capability: Not supported by server (cannot pause/resume)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        <span>Resume: No</span>
      </span>
    `;
  }
  return `
    <span class="file-resume-badge resumable-unknown" title="Resume capability: Checking...">
      <span>Resume: ?</span>
    </span>
  `;
}

function renderIndividualModalContent(task) {
  if (!task) return;

  const percentVal = calculateTaskPercent(task);
  const percent = percentVal.toFixed(1);

  // 1. Header percentage & filename
  const titleEl = document.getElementById('indiv-file-title') || document.getElementById('seg-file-title');
  if (titleEl) {
    titleEl.textContent = task.filename || 'Download';
    titleEl.title = task.savePath || task.filename || '';
  }
  const badgeEl = document.getElementById('indiv-percent-badge');
  if (badgeEl) badgeEl.textContent = `${percent}%`;

  // 2. Status Badge & Text
  const statusClasses = {
    downloading: 'status-downloading',
    probing: 'status-downloading',
    completed: 'status-completed',
    paused: 'status-paused',
    queued: 'status-paused',
    error: 'status-error'
  };
  const statusLabels = {
    downloading: 'Downloading',
    probing: 'Connecting...',
    completed: 'Finished',
    paused: 'Paused',
    queued: 'Queued',
    error: 'Error'
  };
  const sClass = statusClasses[task.status] || 'status-paused';
  const sLabel = statusLabels[task.status] || task.status;

  const statusTextEl = document.getElementById('indiv-status-text');
  if (statusTextEl) statusTextEl.textContent = sLabel;

  const statusPillEl = document.getElementById('indiv-status-pill');
  if (statusPillEl) {
    statusPillEl.className = `status-pill ${sClass}`;
    statusPillEl.textContent = sLabel;
  }

  // 3. Resume capability tag
  const resumableTag = document.getElementById('indiv-resumable-badge');
  if (resumableTag) {
    const isResumable = task.resumable !== false;
    resumableTag.className = `indiv-resumable-tag ${isResumable ? '' : 'no-resume'}`;
    resumableTag.textContent = isResumable ? 'Resume: Yes' : 'Resume: No';
  }

  // 4. File Size & Transferred
  const sizeEl = document.getElementById('indiv-file-size');
  if (sizeEl) sizeEl.textContent = formatBytes(task.totalBytes || task.downloadedBytes);

  const downEl = document.getElementById('indiv-downloaded-size') || document.getElementById('seg-downloaded-size');
  if (downEl) downEl.textContent = `${formatBytes(task.downloadedBytes)} (${percent}%)`;

  // 5. Speed & ETA
  const speedEl = document.getElementById('indiv-transfer-rate') || document.getElementById('seg-speed');
  if (speedEl) speedEl.textContent = task.status === 'downloading' ? formatSpeed(task.speed) : '--';

  const etaEl = document.getElementById('indiv-time-left') || document.getElementById('seg-eta');
  if (etaEl) etaEl.textContent = task.status === 'downloading' ? formatEta(task.eta) : '--';

  // 6. Path & URL
  const pathEl = document.getElementById('indiv-file-path') || document.getElementById('seg-file-path');
  if (pathEl) {
    pathEl.textContent = task.savePath || task.destinationDir || 'Default Downloads Folder';
    pathEl.title = task.savePath || task.destinationDir || '';
  }

  const urlEl = document.getElementById('indiv-source-url');
  if (urlEl) {
    urlEl.textContent = task.url || '';
    urlEl.title = task.url || '';
  }

  // 7. Master Fill Bar
  const fill = document.getElementById('indiv-overall-fill') || document.getElementById('seg-overall-fill');
  if (fill) fill.style.width = `${percent}%`;

  // 8. Dynamic Pause / Resume Button in footer
  const btnPauseResume = document.getElementById('btn-indiv-pause-resume');
  const pauseResumeLabel = document.getElementById('indiv-pause-resume-label');
  const pauseResumeIcon = document.getElementById('indiv-pause-resume-icon');
  if (btnPauseResume && pauseResumeLabel && pauseResumeIcon) {
    if (task.status === 'downloading' || task.status === 'probing') {
      pauseResumeLabel.textContent = 'Pause';
      pauseResumeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      btnPauseResume.className = 'btn-secondary';
      btnPauseResume.disabled = false;
    } else if (task.status === 'completed') {
      pauseResumeLabel.textContent = 'Completed';
      pauseResumeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      btnPauseResume.className = 'btn-secondary';
      btnPauseResume.disabled = true;
    } else {
      pauseResumeLabel.textContent = 'Resume';
      pauseResumeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      btnPauseResume.className = 'btn-primary-action';
      btnPauseResume.disabled = false;
    }
  }

  // 9. Open File Button (active only if completed)
  const btnOpenFile = document.getElementById('btn-indiv-open-file');
  if (btnOpenFile) {
    btnOpenFile.disabled = task.status !== 'completed';
    if (task.status === 'completed') {
      btnOpenFile.className = 'btn-primary-action';
    } else {
      btnOpenFile.className = 'btn-secondary';
    }
  }

  // 10. Chunks / Threads Grid
  const chunks = task.chunks || [];
  const threadCountEl = document.getElementById('indiv-thread-count');
  if (threadCountEl) threadCountEl.textContent = chunks.length || (task.status === 'downloading' ? 1 : 0);

  const grid = document.getElementById('indiv-segments-grid') || document.getElementById('segments-grid');
  if (grid) {
    if (chunks.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-sub); padding: 8px;">Waiting for connection allocation...</div>';
    } else {
      grid.innerHTML = '';
      for (const c of chunks) {
        const card = document.createElement('div');
        card.className = 'segment-item-card';
        const cPercent = c.percent || (c.status === 'completed' ? 100 : 0);
        card.innerHTML = `
          <div class="segment-item-header">
            <span style="font-weight: 500; color: #fff;">Thread #${c.id + 1}</span>
            <span style="font-family: var(--font-mono); color: var(--accent-cyan);">${cPercent}%</span>
          </div>
          <div class="segment-item-bar">
            <div class="segment-item-fill" style="width: ${cPercent}%;"></div>
          </div>
          <div style="font-size: 10px; color: var(--text-sub); font-family: var(--font-mono);">
            Offset: ${formatBytes(c.downloadedBytes)}
          </div>
        `;
        grid.appendChild(card);
      }
    }
  }
}

// Backward compatibility alias
function renderSegmentsModalContent(task) {
  renderIndividualModalContent(task);
}

// IPC Event Listeners
function setupIpcListeners() {
  api.onTaskAdded((task) => {
    tasks.set(task.id, task);
    renderTable();
    updateBadges();
  });

  api.onTaskUpdated((task) => {
    tasks.set(task.id, { ...tasks.get(task.id), ...task });
    updateRow(task.id);
    updateBadges();

    if (activeIndividualTaskId === task.id) {
      renderIndividualModalContent(tasks.get(task.id));
    }
  });

  api.onTaskProgress((progress) => {
    const task = tasks.get(progress.id);
    if (task) {
      task.percent = progress.percent;
      task.downloadedBytes = progress.downloadedBytes;
      task.totalBytes = progress.totalBytes;
      task.speed = progress.speed;
      task.eta = progress.eta;
      task.chunks = progress.chunks;
      updateRow(progress.id);

      if (activeIndividualTaskId === progress.id) {
        renderIndividualModalContent(task);
      }
    }
  });

  api.onTaskCompleted((task) => {
    tasks.set(task.id, task);
    updateRow(task.id);
    updateBadges();

    if (activeIndividualTaskId === task.id) {
      renderIndividualModalContent(task);
      const closeOnFinish = document.getElementById('indiv-close-on-complete')?.checked;
      if (closeOnFinish) {
        setTimeout(() => {
          if (activeIndividualTaskId === task.id) {
            closeIndividualDownloadModal();
          }
        }, 1000);
      }
    }
  });

  api.onTaskError((errData) => {
    const task = tasks.get(errData.id);
    if (task) {
      task.status = 'error';
      task.error = errData.error;
      updateRow(errData.id);
      updateBadges();

      if (activeIndividualTaskId === errData.id) {
        renderIndividualModalContent(task);
      }
    }
  });

  api.onTaskRemoved((info) => {
    tasks.delete(info.id);
    checkedTaskIds.delete(info.id);
    if (selectedTaskId === info.id) selectedTaskId = null;
    if (activeIndividualTaskId === info.id) closeIndividualDownloadModal();
    renderTable();
    updateBadges();
    updateSelectAllCheckbox();
  });

  api.onClipboardUrl((data) => {
    document.getElementById('toast-url-text').textContent = data.url;
    toastClipboard.style.display = 'flex';
  });

  api.onNewLog?.((logEntry) => {
    systemLogs.push(logEntry);
    if (systemLogs.length > 800) {
      systemLogs.shift();
    }
    if (isLogsModalOpen) {
      if (matchesLogFilter(logEntry)) {
        appendLogEntryRow(logEntry);
      }
      updateLogStats();
    }
  });
}

// Table Rendering & Updates
function getFilteredTasks() {
  const all = Array.from(tasks.values());

  return all.filter(t => {
    // Search query
    if (searchQuery && !t.filename.toLowerCase().includes(searchQuery) && !t.url.toLowerCase().includes(searchQuery)) {
      return false;
    }

    // Category filter
    if (currentCategory === 'all') return true;
    if (currentCategory === 'downloading') return t.status === 'downloading' || t.status === 'probing';
    if (currentCategory === 'completed') return t.status === 'completed';
    if (currentCategory === 'paused') return t.status === 'paused' || t.status === 'queued';
    if (currentCategory === 'queue-main') return true;
    return t.category === currentCategory;
  });
}

function renderTable() {
  const filtered = getFilteredTasks();

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    updateSelectAllCheckbox();
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = '';

  for (const task of filtered) {
    const tr = createRowElement(task);
    tbody.appendChild(tr);
  }
  updateSelectAllCheckbox();
}

function createRowElement(task) {
  const tr = document.createElement('tr');
  tr.id = `row-${task.id}`;
  tr.className = selectedTaskId === task.id ? 'selected' : '';

  tr.addEventListener('click', (e) => {
    if (e.target.closest('.row-action-btn') || e.target.type === 'checkbox' || e.target.closest('.custom-checkbox')) return;
    document.querySelectorAll('.downloads-table tbody tr').forEach(r => r.classList.remove('selected'));
    tr.classList.add('selected');
    selectedTaskId = task.id;

    // Open individual download dialog when clicking the file title or progress bar
    if (e.target.closest('.file-details') || e.target.closest('.file-name') || e.target.closest('.file-cat-icon') || e.target.closest('.segment-bar-wrapper')) {
      openIndividualDownloadModal(task.id);
    }
  });

  tr.addEventListener('dblclick', () => {
    openIndividualDownloadModal(task.id);
  });

  tr.addEventListener('contextmenu', (e) => {
    showContextMenu(e, task);
  });

  tr.innerHTML = getRowHtml(task);
  attachRowActionListeners(tr, task);
  return tr;
}

function updateRow(taskId) {
  const task = tasks.get(taskId);
  if (!task) return;

  const row = document.getElementById(`row-${taskId}`);
  if (row) {
    // 1. Update Size (Shows Downloaded / Total)
    const sizeCell = row.querySelector('.col-size');
    if (sizeCell) sizeCell.innerHTML = formatSizeCell(task);

    // 2. Update Segment Bar
    const segBar = row.querySelector('.segment-bar');
    const percentVal = calculateTaskPercent(task);
    if (segBar) {
      const chunks = task.chunks || [];
      if (chunks.length > 0) {
        segBar.innerHTML = chunks.map(c => {
          const p = c.percent || (c.status === 'completed' ? 100 : 0);
          const cls = c.status === 'completed' ? 'completed' : (c.status === 'error' ? 'error' : '');
          return `<div class="segment-chunk ${cls}" style="flex: ${c.totalBytes || 1}; width: ${p}%;"></div>`;
        }).join('');
      } else {
        segBar.innerHTML = `<div class="segment-chunk" style="width: ${percentVal}%;"></div>`;
      }
    }

    // 3. Update Percent
    const percentCell = row.querySelector('.col-percent');
    if (percentCell) percentCell.textContent = `${percentVal.toFixed(1)}%`;

    // 3b. Update Resume Capability Badge
    const resumeBadge = row.querySelector('.file-resume-badge');
    if (resumeBadge) {
      resumeBadge.outerHTML = formatResumeBadge(task);
    }

    // 4. Update Speed
    const speedCell = row.querySelector('.col-speed');
    if (speedCell) speedCell.textContent = task.status === 'downloading' ? formatSpeed(task.speed) : '--';

    // 5. Update ETA
    const etaCell = row.querySelector('.col-eta');
    if (etaCell) etaCell.textContent = task.status === 'downloading' ? formatEta(task.eta) : '--';

    // 6. Update Status
    const statusCell = row.querySelector('.col-status');
    if (statusCell) {
      const statusClasses = {
        downloading: 'status-downloading',
        probing: 'status-downloading',
        completed: 'status-completed',
        paused: 'status-paused',
        queued: 'status-paused',
        error: 'status-error'
      };
      const statusLabels = {
        downloading: 'Downloading',
        probing: 'Connecting...',
        completed: 'Finished',
        paused: 'Paused',
        queued: 'Queued',
        error: 'Error'
      };
      const statusClass = statusClasses[task.status] || 'status-paused';
      const statusLabel = statusLabels[task.status] || task.status;
      statusCell.innerHTML = `<span class="status-pill ${statusClass}">${statusLabel}</span>`;
    }

    // 7. Update Action Pause/Resume button if state changed
    const btnPause = row.querySelector('.btn-action-pause');
    const btnResume = row.querySelector('.btn-action-resume');
    if (task.status === 'downloading' && btnResume) {
      btnResume.outerHTML = `
        <button class="row-action-btn btn-action-pause" data-id="${task.id}" title="Pause">
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
      `;
      row.querySelector('.btn-action-pause')?.addEventListener('click', (e) => {
        e.stopPropagation();
        api.pauseTask(task.id);
      });
    } else if (task.status !== 'downloading' && btnPause) {
      btnPause.outerHTML = `
        <button class="row-action-btn btn-action-resume" data-id="${task.id}" title="Resume / Start">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      `;
      row.querySelector('.btn-action-resume')?.addEventListener('click', (e) => {
        e.stopPropagation();
        api.resumeTask(task.id);
      });
    }

    // 8. Ensure Checkbox remains consistent without interrupting click events
    const cb = row.querySelector('.task-checkbox');
    if (cb && cb.checked !== checkedTaskIds.has(task.id)) {
      cb.checked = checkedTaskIds.has(task.id);
    }
  } else {
    const filtered = getFilteredTasks();
    if (filtered.some(t => t.id === taskId)) {
      renderTable();
    }
  }
}

function getRowHtml(task) {
  const catSvg = CAT_SVGS[task.category] || CAT_SVGS.General;
  let domain = '';
  try {
    domain = new URL(task.url).hostname;
  } catch {
    domain = task.url;
  }

  // Chunks segment visualization bar
  let segmentHtml = '';
  const chunks = task.chunks || [];
  if (chunks.length > 0) {
    segmentHtml = chunks.map(c => {
      const p = c.percent || (c.status === 'completed' ? 100 : 0);
      const cls = c.status === 'completed' ? 'completed' : (c.status === 'error' ? 'error' : '');
      return `<div class="segment-chunk ${cls}" style="flex: ${c.totalBytes || 1}; width: ${p}%;"></div>`;
    }).join('');
  } else {
    segmentHtml = `<div class="segment-chunk" style="width: ${task.percent || 0}%;"></div>`;
  }

  // Status Badge
  const statusClasses = {
    downloading: 'status-downloading',
    probing: 'status-downloading',
    completed: 'status-completed',
    paused: 'status-paused',
    queued: 'status-paused',
    error: 'status-error'
  };
  const statusLabels = {
    downloading: 'Downloading',
    probing: 'Connecting...',
    completed: 'Finished',
    paused: 'Paused',
    queued: 'Queued',
    error: 'Error'
  };

  const statusClass = statusClasses[task.status] || 'status-paused';
  const statusLabel = statusLabels[task.status] || task.status;
  const isChecked = checkedTaskIds.has(task.id);

  return `
    <td class="col-checkbox">
      <label class="custom-checkbox">
        <input type="checkbox" class="task-checkbox" data-id="${task.id}" ${isChecked ? 'checked' : ''}>
        <span class="checkbox-box"></span>
      </label>
    </td>
    <td class="col-file-info">
      <div class="file-info-cell" title="Click or double click to open Individual Download Window">
        <span class="file-cat-icon">${catSvg}</span>
        <div class="file-details">
          <span class="file-name" title="${escapeHtml(task.savePath || task.filename)}">${escapeHtml(task.filename)}</span>
          <div class="file-meta-row">
            <span class="file-domain" title="${escapeHtml(task.url)}">${escapeHtml(domain)}</span>
            <span class="file-meta-sep">•</span>
            <span class="file-dir-badge" title="Saved to: ${escapeHtml(task.savePath || task.destinationDir || '')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span>${escapeHtml(formatPathDisplay(task.destinationDir || task.savePath))}</span>
            </span>
            <span class="file-meta-sep">•</span>
            ${formatResumeBadge(task)}
          </div>
        </div>
      </div>
    </td>
    <td class="mono-cell col-size">${formatSizeCell(task)}</td>
    <td class="col-segment-bar">
      <div class="segment-bar-wrapper" title="Click to inspect active connection threads">
        <div class="segment-bar">${segmentHtml}</div>
      </div>
    </td>
    <td class="mono-cell col-percent" style="font-weight: 600; color: #fff;">${calculateTaskPercent(task).toFixed(1)}%</td>
    <td class="mono-cell col-speed" style="color: var(--accent-cyan);">${task.status === 'downloading' ? formatSpeed(task.speed) : '--'}</td>
    <td class="mono-cell col-eta">${task.status === 'downloading' ? formatEta(task.eta) : '--'}</td>
    <td class="col-status">
      <span class="status-pill ${statusClass}">${statusLabel}</span>
    </td>
    <td class="col-actions">
      <div class="row-actions">
        <button class="row-action-btn btn-action-inspect" data-id="${task.id}" title="Open Individual Download Window">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        </button>
        ${task.status === 'downloading' 
          ? `<button class="row-action-btn btn-action-pause" data-id="${task.id}" title="Pause">
               <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
             </button>`
          : `<button class="row-action-btn btn-action-resume" data-id="${task.id}" title="Resume / Start">
               <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
             </button>`
        }
        <button class="row-action-btn btn-action-folder" data-path="${task.savePath}" title="Open Folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button class="row-action-btn btn-action-delete" data-id="${task.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </td>
  `;
}

function attachRowActionListeners(tr, task) {
  tr.querySelector('.btn-action-inspect')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openIndividualDownloadModal(task.id);
  });

  tr.querySelector('.btn-action-pause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    api.pauseTask(task.id);
  });

  tr.querySelector('.btn-action-resume')?.addEventListener('click', (e) => {
    e.stopPropagation();
    api.resumeTask(task.id);
  });

  tr.querySelector('.btn-action-folder')?.addEventListener('click', (e) => {
    e.stopPropagation();
    api.openFolder(task.savePath);
  });

  tr.querySelector('.file-dir-badge')?.addEventListener('click', (e) => {
    e.stopPropagation();
    api.openFolder(task.savePath || task.destinationDir);
  });

  tr.querySelector('.btn-action-delete')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteModal([task.id]);
  });
}

function updateBadges() {
  const all = Array.from(tasks.values());

  const counts = {
    all: all.length,
    downloading: all.filter(t => t.status === 'downloading' || t.status === 'probing').length,
    completed: all.filter(t => t.status === 'completed').length,
    paused: all.filter(t => t.status === 'paused' || t.status === 'queued').length,
    compressed: all.filter(t => t.category === 'Compressed').length,
    documents: all.filter(t => t.category === 'Documents').length,
    music: all.filter(t => t.category === 'Music').length,
    programs: all.filter(t => t.category === 'Programs').length,
    videos: all.filter(t => t.category === 'Videos').length
  };

  document.getElementById('badge-all').textContent = counts.all;
  document.getElementById('badge-downloading').textContent = counts.downloading;
  document.getElementById('badge-completed').textContent = counts.completed;
  document.getElementById('badge-paused').textContent = counts.paused;

  document.getElementById('badge-compressed').textContent = counts.compressed;
  document.getElementById('badge-documents').textContent = counts.documents;
  document.getElementById('badge-music').textContent = counts.music;
  document.getElementById('badge-programs').textContent = counts.programs;
  document.getElementById('badge-videos').textContent = counts.videos;

  activeTasksCount.textContent = counts.downloading;

  let totalThreads = 0;
  for (const t of all) {
    if (t.status === 'downloading') {
      totalThreads += (t.chunks?.length || t.connections || 1);
    }
  }
  activeThreadsCount.textContent = totalThreads;
}

// 60FPS Authentic IDM Bandwidth Graph with Grid Lines & Scale Markers
function setupSpeedChart() {
  const ctx = speedCanvas.getContext('2d');

  function resizeCanvas() {
    speedCanvas.width = speedCanvas.parentElement.clientWidth - 24;
    speedCanvas.height = 64;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Tick every 500ms for metrics
  setInterval(() => {
    let currentTotalSpeed = 0;
    for (const t of tasks.values()) {
      if (t.status === 'downloading') {
        currentTotalSpeed += (t.speed || 0);
      }
    }

    totalSpeedDisplay.textContent = formatSpeed(currentTotalSpeed);

    speedHistory.shift();
    speedHistory.push(currentTotalSpeed);

    const maxSpeed = Math.max(1024 * 1024, ...speedHistory); // Min 1 MB/s scale
    document.getElementById('chart-max-scale').textContent = `Peak: ${formatSpeed(maxSpeed)}`;
  }, 500);

  // Render loop with grid lines & ticks
  function drawChart() {
    const w = speedCanvas.width;
    const h = speedCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(1024 * 500, ...speedHistory);
    const step = w / (speedHistory.length - 1);

    // 1. Draw Subtle IDM Grid Lines (25%, 50%, 75%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let pct = 0.25; pct <= 0.75; pct += 0.25) {
      const y = Math.round(h * pct);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash

    // 2. Draw Y-Axis Scale Indicator Lines
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.textAlign = 'right';
    ctx.fillText(formatSpeed(maxVal), w - 4, 10);
    ctx.fillText(formatSpeed(maxVal / 2), w - 4, Math.round(h / 2) + 3);
    ctx.fillText('0 KB/s', w - 4, h - 3);

    // 3. Gradient background under curve
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.12)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < speedHistory.length; i++) {
      const x = i * step;
      const y = h - ((speedHistory[i] / maxVal) * (h - 8));
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 4. Glowing Stroke Line
    ctx.beginPath();
    for (let i = 0; i < speedHistory.length; i++) {
      const x = i * step;
      const y = h - ((speedHistory[i] / maxVal) * (h - 8));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(6, 182, 212, 0.5)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset blur

    requestAnimationFrame(drawChart);
  }

  requestAnimationFrame(drawChart);
}

// Start
window.addEventListener('DOMContentLoaded', init);
