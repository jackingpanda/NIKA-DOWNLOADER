import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { QueueManager, detectCategory } from '../src/core/queue-manager.js';
import { SpeedLimiter } from '../src/core/speed-limiter.js';
import { StateStore } from '../src/core/state-store.js';

async function runQueueTests() {
  console.log('🧪 Starting NIKA DOWNLOADER Queue & Persistence Tests...\n');

  // 1. Category Detection Tests
  console.log('Test 1: Category auto-detection...');
  assert.strictEqual(detectCategory('movie.mp4'), 'Videos');
  assert.strictEqual(detectCategory('song.flac'), 'Music');
  assert.strictEqual(detectCategory('archive.7z'), 'Compressed');
  assert.strictEqual(detectCategory('installer.exe'), 'Programs');
  assert.strictEqual(detectCategory('manual.pdf'), 'Documents');
  assert.strictEqual(detectCategory('data.bin'), 'General');
  console.log('  ✅ Category detection passed.');

  // 2. Speed Limiter Tests
  console.log('Test 2: Speed limiter token bucket...');
  const limiter = new SpeedLimiter(1024 * 1024); // 1 MB/s
  assert.strictEqual(limiter.bytesPerSecond, 1024 * 1024);
  limiter.setLimit(500 * 1024);
  assert.strictEqual(limiter.bytesPerSecond, 500 * 1024);
  console.log('  ✅ Speed limiter tests passed.');

  // 3. StateStore atomic persistence
  console.log('Test 3: State store atomic read/write...');
  const testStorePath = path.join(os.tmpdir(), `rea-test-${Date.now()}`, 'downloads.json');
  const store = new StateStore(testStorePath);

  const mockTasks = [
    {
      id: 'task_1',
      url: 'https://example.com/test.zip',
      filename: 'test.zip',
      destinationDir: os.tmpdir(),
      savePath: path.join(os.tmpdir(), 'test.zip'),
      totalBytes: 1048576,
      downloadedBytes: 524288,
      status: 'downloading',
      connections: 8,
      category: 'Compressed',
      addedAt: new Date().toISOString(),
      completedAt: null
    }
  ];

  await store.save(mockTasks);
  const loaded = await store.load();
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].id, 'task_1');
  assert.strictEqual(loaded[0].status, 'paused'); // Active should be loaded as paused
  console.log('  ✅ State store atomic persistence passed.');

  // 4. QueueManager Lifecycle
  console.log('Test 4: QueueManager task creation and status tracking...');
  const qm = new QueueManager({
    maxConcurrent: 2,
    stateStorePath: testStorePath
  });
  await qm.init();

  const task = await qm.addTask({
    url: 'https://proof.ovh.net/files/1Mb.dat',
    filename: 'custom_1mb.dat',
    autoStart: false
  });

  assert.strictEqual(task.filename, 'custom_1mb.dat');
  assert.strictEqual(task.status, 'queued');
  assert.strictEqual(task.connections, 8);
  assert.strictEqual(qm.getAllTasks().length, 2); // 1 restored + 1 new

  await qm.removeTask(task.id, false);
  assert.strictEqual(qm.getAllTasks().length, 1);
  console.log('  ✅ QueueManager lifecycle tests passed.');

  // 5. Incomplete Temp Stats & Cleaning Tests
  console.log('Test 5: Temp Cleaner stats, disk purging, and settings persistence...');
  const tempTestDir = path.join(os.tmpdir(), `rea-clean-test-${Date.now()}`);
  await fs.mkdir(tempTestDir, { recursive: true });

  const tempFilePath = path.join(tempTestDir, 'partial-download.bin');
  const tempMetaPath = path.join(tempTestDir, 'partial-download.bin.rea-meta');
  const orphanedMetaPath = path.join(tempTestDir, 'abandoned.bin.rea-meta');

  // Create mock partial files
  await fs.writeFile(tempFilePath, Buffer.alloc(1024 * 1024, 0xAA)); // 1 MB
  await fs.writeFile(tempMetaPath, JSON.stringify({ url: 'https://example.com/partial', totalBytes: 2097152 }));
  await fs.writeFile(orphanedMetaPath, JSON.stringify({ url: 'https://example.com/orphaned' }));

  const cleanQm = new QueueManager({
    defaultDownloadDir: tempTestDir,
    stateStorePath: path.join(tempTestDir, 'state.json')
  });
  await cleanQm.init();

  const dummyTask = {
    id: 'clean_task_1',
    url: 'https://example.com/partial',
    filename: 'partial-download.bin',
    savePath: tempFilePath,
    destinationDir: tempTestDir,
    totalBytes: 2097152,
    downloadedBytes: 1048576,
    status: 'paused',
    percent: 50
  };
  cleanQm.tasks.set(dummyTask.id, dummyTask);

  // Scan stats
  const stats = await cleanQm.getIncompleteTempStats();
  assert.ok(stats.totalBytes >= 1024 * 1024, 'Total reclaimable bytes should be at least 1MB');
  assert.strictEqual(stats.incompleteTasksCount, 1);
  assert.strictEqual(stats.orphanedFilesCount, 1);
  assert.strictEqual(stats.orphanedFiles[0].filename, 'abandoned.bin.rea-meta');

  // Perform clean with reset mode
  const cleanResult = await cleanQm.clearIncompleteTemp({
    taskIds: ['clean_task_1'],
    removeTasks: false,
    cleanOrphaned: true
  });
  assert.ok(cleanResult.freedBytes >= 1024 * 1024);
  assert.strictEqual(cleanResult.affectedTasksCount, 1);

  // Verify disk files were removed
  let fileStillExists = true;
  try {
    await fs.stat(tempFilePath);
  } catch {
    fileStillExists = false;
  }
  assert.strictEqual(fileStillExists, false, 'Temporary payload file should be deleted from disk');

  let metaStillExists = true;
  try {
    await fs.stat(orphanedMetaPath);
  } catch {
    metaStillExists = false;
  }
  assert.strictEqual(metaStillExists, false, 'Orphaned meta file should be deleted from disk');

  // Verify task was reset in queue
  const resetTask = cleanQm.tasks.get('clean_task_1');
  assert.strictEqual(resetTask.downloadedBytes, 0);
  assert.strictEqual(resetTask.percent, 0);
  assert.strictEqual(resetTask.status, 'queued');

  // Test Settings persistence
  const initialSettings = await cleanQm.getSettings();
  assert.strictEqual(initialSettings.autoCleanTempOnDelete, true);
  await cleanQm.updateSettings({
    maxConcurrent: 5,
    autoCleanTempOnDelete: true,
    defaultConnections: 16
  });
  const updatedSettings = await cleanQm.getSettings();
  assert.strictEqual(updatedSettings.maxConcurrent, 5);
  assert.strictEqual(updatedSettings.defaultConnections, 16);

  // Test Window State Persistence (Sync & Async)
  cleanQm.stateStore.saveWindowStateSync({
    width: 1280,
    height: 800,
    x: 100,
    y: 150,
    isMaximized: false
  });
  const syncLoaded = cleanQm.stateStore.loadWindowStateSync();
  assert.strictEqual(syncLoaded.width, 1280);
  assert.strictEqual(syncLoaded.height, 800);
  assert.strictEqual(syncLoaded.x, 100);
  assert.strictEqual(syncLoaded.y, 150);
  assert.strictEqual(syncLoaded.isMaximized, false);

  await cleanQm.stateStore.saveWindowState({
    width: 1440,
    height: 900,
    x: 200,
    y: 250,
    isMaximized: true
  });
  const asyncLoaded = await cleanQm.stateStore.loadWindowState();
  assert.strictEqual(asyncLoaded.width, 1440);
  assert.strictEqual(asyncLoaded.height, 900);
  assert.strictEqual(asyncLoaded.isMaximized, true);

  console.log('  ✅ Temp cleaner, settings, and window layout persistence verified.');

  // Cleanup test directories
  try {
    await fs.rm(tempTestDir, { recursive: true, force: true });
    await fs.rm(path.dirname(testStorePath), { recursive: true, force: true });
  } catch {}

  console.log('\n🎉 ALL NIKA DOWNLOADER QUEUE TESTS PASSED SUCCESSFULLY!');
}

runQueueTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
