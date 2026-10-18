import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { calculateChunks, dynamicSplitChunk } from '../src/core/chunk-calculator.js';
import { probeUrl } from '../src/core/probe.js';
import { ReaDownloader } from '../src/core/downloader.js';

async function runTests() {
  console.log('--- [Test 1] Testing Chunk Calculator Partitioning ---');
  const totalSize = 10 * 1024 * 1024; // 10 MB
  const chunks = calculateChunks(totalSize, 8);
  assert.strictEqual(chunks.length, 8, 'Should produce exactly 8 chunks');
  
  let totalChunkBytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    assert.strictEqual(c.id, i);
    totalChunkBytes += (c.endByte - c.startByte + 1);
    if (i > 0) {
      assert.strictEqual(c.startByte, chunks[i - 1].endByte + 1, 'Chunks must be contiguous');
    }
  }
  assert.strictEqual(totalChunkBytes, totalSize, 'Sum of chunks must equal total file size');
  console.log('✅ Chunk calculator partitioning: PASS');

  console.log('\n--- [Test 2] Testing Dynamic Chunk Re-Splitting ---');
  const slowChunk = {
    id: 3,
    startByte: 3000000,
    endByte: 5000000,
    currentOffset: 3100000,
    downloadedBytes: 100000,
    status: 'downloading'
  };
  const newChunk = dynamicSplitChunk(slowChunk, 8);
  assert.ok(newChunk, 'Should successfully split chunk with large remaining bytes');
  assert.strictEqual(slowChunk.endByte + 1, newChunk.startByte, 'Split chunks must be contiguous');
  console.log('✅ Dynamic chunk re-splitting: PASS');

  console.log('\n--- [Test 3] Testing Remote URL Probe & Range Detection ---');
  const testUrl = 'https://raw.githubusercontent.com/morluto/rea/main/README.md';
  const probe = await probeUrl(testUrl);
  console.log('Probe result:', {
    url: probe.url,
    filename: probe.filename,
    contentLength: probe.contentLength,
    supportsRange: probe.supportsRange,
    contentType: probe.contentType
  });
  assert.ok(probe.filename, 'Filename must be resolved');
  assert.ok(probe.contentLength > 0, 'Content-Length must be detected');
  console.log('✅ Remote URL probe: PASS');

  console.log('\n--- [Test 4] Testing End-to-End Download & Integrity ---');
  const tempDir = path.join(process.cwd(), 'temp_test_downloads');
  await fs.mkdir(tempDir, { recursive: true });

  const downloader = new ReaDownloader(testUrl, {
    destinationDir: tempDir,
    filename: 'tested_rea_readme.md',
    connections: 4
  });

  let progressEventsCount = 0;
  downloader.on('progress', (p) => {
    progressEventsCount++;
  });

  const savedFile = await downloader.start();
  assert.ok(savedFile, 'Saved filepath must be returned');

  const fileExists = await fs.stat(savedFile);
  assert.strictEqual(fileExists.size, probe.contentLength, 'Downloaded file size must match remote length exactly');
  assert.ok(progressEventsCount > 0, 'Progress events must be emitted');

  // Verify file content starts with expected markdown header
  const content = await fs.readFile(savedFile, 'utf8');
  assert.ok(content.includes('REA'), 'File content should contain REA text');
  console.log(`✅ End-to-End download test: PASS (Downloaded ${fileExists.size} bytes without corruption)`);

  // Cleanup test artifacts
  await fs.rm(tempDir, { recursive: true, force: true });

  console.log('\n--- [Test 5] Testing YouTube Google Video Probe & Cookie Stripping ---');
  const googleVideoUrl = 'https://rr1---sn-ab5sznzl.googlevideo.com/videoplayback?expire=1792340000&ei=test&ip=127.0.0.1&id=o-test&itag=22&clen=18492040&dur=120.5&mime=video%2Fmp4';
  const gvProbe = await probeUrl(googleVideoUrl, {
    cookies: 'LOGIN_INFO=AFmmF2kw...; SAPISID=secret;',
    headers: { 'Cookie': 'SAPISID=secret;' }
  });
  assert.strictEqual(gvProbe.contentLength, 18492040, 'Should parse clen from URL query parameters upfront');
  assert.strictEqual(gvProbe.supportsRange, true, 'Google Video streams must support Range requests');
  assert.strictEqual(gvProbe.contentType, 'video/mp4', 'Should deduce mime type from query string');
  assert.strictEqual(gvProbe.headers['Cookie'], undefined, 'Cookie header must be completely stripped for Google Video');
  assert.strictEqual(gvProbe.headers['Referer'], 'https://www.youtube.com/', 'Must provide YouTube referer header');
  assert.strictEqual(gvProbe.headers['Origin'], 'https://www.youtube.com', 'Must provide YouTube origin header');
  console.log('✅ YouTube Google Video probe & cookie stripping: PASS');

  console.log('\n--- [Test 6] Testing Cross-Platform Filename Sanitization ---');
  const { sanitizeFilename } = await import('../src/core/storage.js');
  const dirtyYoutubeName = 'I Built a HUGE Crocodile Habitat in Planet Zoo 2 | Speed Build [360p].mp4';
  const cleanName = sanitizeFilename(dirtyYoutubeName);
  assert.strictEqual(cleanName, 'I Built a HUGE Crocodile Habitat in Planet Zoo 2 _ Speed Build [360p].mp4');
  assert.strictEqual(cleanName.includes('|'), false, 'Pipe character must be replaced');

  const colonAndQuestion = 'Episode 1: Who is Antigravity? [1080p].mp4';
  assert.strictEqual(sanitizeFilename(colonAndQuestion), 'Episode 1_ Who is Antigravity_ [1080p].mp4');

  const trailingSpacesAndDots = 'my file name . . . ';
  assert.strictEqual(sanitizeFilename(trailingSpacesAndDots), 'my file name');

  const reservedDevice = 'con.mp4';
  assert.strictEqual(sanitizeFilename(reservedDevice), '_con.mp4');
  console.log('✅ Cross-Platform Filename Sanitization: PASS');

  console.log('\n--- [Test 7] Testing Media Stream URL Sanitization (Instagram/Meta bytestart & YouTube range stripping) ---');
  const { cleanMediaStreamUrl } = await import('../src/core/probe.js');
  const dirtyInstagramUrl = 'https://instagram.fkno13-1.fna.fbcdn.net/o1/v/t2/f2/m78/video.mp4?_nc_cat=101&bytestart=918&byteend=1821422&oe=6AD6AB7E';
  const cleanInstagramUrl = cleanMediaStreamUrl(dirtyInstagramUrl);
  assert.strictEqual(cleanInstagramUrl.includes('bytestart'), false, 'bytestart parameter must be removed');
  assert.strictEqual(cleanInstagramUrl.includes('byteend'), false, 'byteend parameter must be removed');
  assert.strictEqual(cleanInstagramUrl.includes('oe=6AD6AB7E'), true, 'Authentication token must be preserved');

  const dirtyYoutubeRangeUrl = 'https://rr9---sn-pjvo2aopq-230e.googlevideo.com/videoplayback?itag=136&range=0-1000000&rn=1&clen=83733220';
  const cleanYoutubeRangeUrl = cleanMediaStreamUrl(dirtyYoutubeRangeUrl);
  assert.strictEqual(cleanYoutubeRangeUrl.includes('range='), false, 'range parameter must be removed');
  assert.strictEqual(cleanYoutubeRangeUrl.includes('rn='), false, 'rn parameter must be removed');
  assert.strictEqual(cleanYoutubeRangeUrl.includes('clen='), true, 'clen parameter must be preserved');
  console.log('✅ Media Stream URL Sanitization: PASS');

  console.log('\n🎉 ALL PHASE 1 CORE TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
