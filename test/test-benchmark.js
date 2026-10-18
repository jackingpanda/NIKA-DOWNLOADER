import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ReaDownloader } from '../src/core/downloader.js';

async function calculateFileSha256(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function runBenchmark() {
  console.log('='.repeat(65));
  console.log('  ⚡ NIKA DOWNLOADER Phase 5 End-to-End Benchmark & Integrity Suite');
  console.log('='.repeat(65));

  const testDir = path.join(os.tmpdir(), `rea-benchmark-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  // Test URL: Public 10MB test file
  const testUrl = 'https://proof.ovh.net/files/10Mb.dat';

  console.log(`\nTarget File: ${testUrl} (~10 MB)`);
  console.log(`Test Directory: ${testDir}\n`);

  // Run 1: Single Connection (Baseline / Standard Browser style)
  console.log('🚀 [Run 1] Single Connection (1 Chunk Stream)...');
  const startSingle = Date.now();
  const downloader1 = new ReaDownloader(testUrl, {
    destinationDir: testDir,
    filename: 'single_stream.dat',
    connections: 1
  });

  const file1 = await downloader1.start();
  const durationSingle = (Date.now() - startSingle) / 1000;
  const hash1 = await calculateFileSha256(file1);
  const size1 = (await fs.stat(file1)).size;
  const speed1 = (size1 / (1024 * 1024)) / durationSingle;

  console.log(`  ⏱️ Duration: ${durationSingle.toFixed(2)}s | Speed: ${speed1.toFixed(2)} MB/s`);
  console.log(`  🔐 SHA-256: ${hash1}`);

  // Run 2: Multi-Segment (8 Connections - NIKA Engine)
  console.log('\n⚡ [Run 2] Multi-Segment Parallel (8 Range Connections)...');
  const startMulti = Date.now();
  const downloader8 = new ReaDownloader(testUrl, {
    destinationDir: testDir,
    filename: 'multi_stream_8.dat',
    connections: 8
  });

  const file8 = await downloader8.start();
  const durationMulti = (Date.now() - startMulti) / 1000;
  const hash8 = await calculateFileSha256(file8);
  const size8 = (await fs.stat(file8)).size;
  const speed8 = (size8 / (1024 * 1024)) / durationMulti;

  console.log(`  ⏱️ Duration: ${durationMulti.toFixed(2)}s | Speed: ${speed8.toFixed(2)} MB/s`);
  console.log(`  🔐 SHA-256: ${hash8}`);

  // Verification
  console.log('\n' + '-'.repeat(65));
  console.log('📊 Verification & Integrity Results:');
  console.log(`  File Size 1: ${size1} bytes`);
  console.log(`  File Size 8: ${size8} bytes`);

  if (hash1 === hash8 && size1 === size8) {
    console.log('  ✅ 100% BIT-PERFECT MATCH! (Zero byte corruption across all segments)');
  } else {
    throw new Error('Hash mismatch between single and multi-chunk downloads!');
  }

  const speedup = (durationSingle / durationMulti).toFixed(2);
  console.log(`  ⚡ Speedup Factor: ${speedup}x over single-stream connection!`);
  console.log('-'.repeat(65));

  // Cleanup
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {}

  console.log('\n🎉 PHASE 5 PERFORMANCE & INTEGRITY BENCHMARK COMPLETE!');
}

runBenchmark().catch(err => {
  console.error('\n❌ Benchmark error:', err);
  process.exit(1);
});
