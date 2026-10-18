import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { WebSocket } from 'ws';
import { QueueManager } from '../src/core/queue-manager.js';
import { ReaBridgeServer } from '../src/bridge/server.js';

async function runBridgeTests() {
  console.log('🧪 Starting NIKA DOWNLOADER Phase 4 IPC Bridge & Protocol Tests...\n');

  const testStorePath = path.join(os.tmpdir(), `rea-bridge-test-${Date.now()}`, 'downloads.json');
  const qm = new QueueManager({
    maxConcurrent: 2,
    stateStorePath: testStorePath
  });
  await qm.init();

  const testPort = 41722;
  const bridge = new ReaBridgeServer(qm, { port: testPort });
  bridge.start();

  console.log(`Test 1: Connecting extension client to ws://127.0.0.1:${testPort}...`);
  const client = new WebSocket(`ws://127.0.0.1:${testPort}`);

  const messages = [];
  client.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });

  await new Promise((resolve, reject) => {
    client.on('open', resolve);
    client.on('error', reject);
  });
  console.log('  ✅ WebSocket client connected successfully.');

  // Test 2: Initial state receive
  console.log('Test 2: Verifying initial state synchronization...');
  // Wait up to 2 seconds for initial_state message in queue
  let initialMsg = null;
  for (let i = 0; i < 20; i++) {
    initialMsg = messages.find(m => m.type === 'initial_state');
    if (initialMsg) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(initialMsg, 'Expected initial_state message');
  assert.ok(Array.isArray(initialMsg.payload.tasks));
  console.log('  ✅ Initial state received.');

  // Test 3: Add download through extension bridge
  console.log('Test 3: Simulating browser extension adding intercepted download...');
  client.send(JSON.stringify({
    type: 'add_download',
    payload: {
      url: 'https://proof.ovh.net/files/1Mb.dat',
      filename: 'extension_test.dat',
      cookies: 'session_token=secret_123; user_id=42',
      referer: 'https://example.com/watch?v=xyz',
      headers: { 'User-Agent': 'Chrome/133.0' },
      autoStart: false
    }
  }));

  let addedMsg = null;
  for (let i = 0; i < 20; i++) {
    addedMsg = messages.find(m => m.type === 'download_added');
    if (addedMsg) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(addedMsg, 'Expected download_added message');
  const createdTask = addedMsg.payload;
  assert.strictEqual(createdTask.filename, 'extension_test.dat');
  assert.strictEqual(createdTask.cookies, 'session_token=secret_123; user_id=42');
  assert.strictEqual(createdTask.referer, 'https://example.com/watch?v=xyz');
  console.log('  ✅ Download intercepted & added to queue with cookies and referer intact.');

  // Test 4: Change speed limit via extension
  console.log('Test 4: Setting speed limit via extension command...');
  client.send(JSON.stringify({
    type: 'set_speed_limit',
    payload: { bytesPerSec: 1048576 }
  }));

  let speedAckMsg = null;
  for (let i = 0; i < 20; i++) {
    speedAckMsg = messages.find(m => m.type === 'speed_limit_updated');
    if (speedAckMsg) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(speedAckMsg, 'Expected speed_limit_updated message');
  assert.strictEqual(qm.globalLimiter.bytesPerSecond, 1048576);
  console.log('  ✅ Speed limit successfully applied.');

  // Test 5: Clean teardown
  client.close();
  bridge.stop();

  try {
    await fs.rm(path.dirname(testStorePath), { recursive: true, force: true });
  } catch {}

  console.log('\n🎉 ALL PHASE 4 BRIDGE & EXTENSION PROTOCOL TESTS PASSED!');
}

runBridgeTests().catch(err => {
  console.error('\n❌ Bridge test failed:', err);
  process.exit(1);
});
