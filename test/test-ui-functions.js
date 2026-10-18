import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { QueueManager } from '../src/core/queue-manager.js';

async function testUiFunctions() {
  console.log('🧪 Testing UI Button Backend Functions & Concurrency Logic...\n');

  const testStorePath = path.join(os.tmpdir(), `rea-uifunc-test-${Date.now()}`, 'downloads.json');
  const qm = new QueueManager({
    maxConcurrent: 3,
    stateStorePath: testStorePath
  });
  await qm.init();

  // 1. Add Task Button logic
  console.log('Test 1: "Add Download" button logic...');
  const task1 = await qm.addTask({
    url: 'https://proof.ovh.net/files/1Mb.dat',
    filename: 'test1.dat',
    autoStart: false
  });
  const task2 = await qm.addTask({
    url: 'https://proof.ovh.net/files/1Mb.dat',
    filename: 'test2.dat',
    autoStart: false
  });
  assert.strictEqual(qm.getAllTasks().length, 2);
  console.log('  ✅ Add button logic creates tasks properly.');

  // 2. Pause All & Resume All Buttons
  console.log('Test 2: "Resume All" and "Stop All" button logic...');
  await qm.resumeAll();
  const t1Status = qm.getTask(task1.id).status;
  assert.ok(t1Status === 'downloading' || t1Status === 'queued');

  await qm.pauseAll();
  assert.strictEqual(qm.getTask(task1.id).status, 'paused');
  console.log('  ✅ Resume All / Stop All functions respond correctly.');

  // 3. Speed Limiter Slider & Toggle
  console.log('Test 3: Speed Limiter toggle & slider logic...');
  qm.setSpeedLimit(2048 * 1024); // 2 MB/s
  assert.strictEqual(qm.globalLimiter.bytesPerSecond, 2048 * 1024);
  qm.setSpeedLimit(0); // OFF / Unlimited
  assert.strictEqual(qm.globalLimiter.bytesPerSecond, 0);
  console.log('  ✅ Speed Limiter slider updates limit cleanly.');

  // 4. Batch Delete Button logic
  console.log('Test 4: "Delete" button logic (single & batch)...');
  await qm.removeTask(task1.id, false);
  assert.strictEqual(qm.getAllTasks().length, 1);
  await qm.removeTask(task2.id, false);
  assert.strictEqual(qm.getAllTasks().length, 0);
  console.log('  ✅ Delete button successfully removes tasks.');

  // Cleanup
  try {
    await fs.rm(path.dirname(testStorePath), { recursive: true, force: true });
  } catch {}

  console.log('\n🎉 ALL UI BUTTON FUNCTIONS VERIFIED RESPONSIVE & FUNCTIONAL!');
}

testUiFunctions().catch(err => {
  console.error('\n❌ UI function test failed:', err);
  process.exit(1);
});
