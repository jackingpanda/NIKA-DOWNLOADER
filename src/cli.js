#!/usr/bin/env node
import { ReaDownloader } from './core/downloader.js';
import path from 'node:path';

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function renderProgressBar(percent, length = 30) {
  const filled = Math.min(length, Math.max(0, Math.round((percent / 100) * length)));
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

async function main() {
  const args = process.argv.slice(2);
  let url = null;
  let connections = 8;
  let outputDir = process.cwd();
  let filename = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-c' || args[i] === '--connections') {
      connections = parseInt(args[++i], 10) || 8;
    } else if (args[i] === '-o' || args[i] === '--out') {
      outputDir = args[++i];
    } else if (args[i] === '-n' || args[i] === '--name') {
      filename = args[++i];
    } else if (!url && !args[i].startsWith('-')) {
      url = args[i];
    }
  }

  console.log('\n========================================================');
  console.log('   ⚡ REA-IDM — Next-Gen Multi-Segment Downloader ⚡');
  console.log('========================================================\n');

  if (!url) {
    console.log('Usage:');
    console.log('  node src/cli.js <URL> [options]\n');
    console.log('Options:');
    console.log('  -c, --connections <num>  Simultaneous connections (default: 8, max: 32)');
    console.log('  -o, --out <dir>          Output directory (default: current directory)');
    console.log('  -n, --name <filename>    Custom output filename\n');
    console.log('Example:');
    console.log('  node src/cli.js https://speed.hetzner.de/100MB.bin -c 8\n');
    process.exit(1);
  }

  const downloader = new ReaDownloader(url, {
    connections,
    destinationDir: outputDir,
    filename
  });

  downloader.on('probe', (info) => {
    console.log(`[Target]      : ${info.url}`);
    console.log(`[File]        : ${info.filename}`);
    console.log(`[Size]        : ${formatBytes(info.contentLength)} (${info.contentLength || 'Unknown'} bytes)`);
    console.log(`[Range Req]   : ${info.supportsRange ? '✅ Supported (Multi-segment Enabled)' : '⚠️ Not supported (Single stream)'}`);
    console.log(`[Connections] : ${connections}\n`);
    console.log('Starting download...\n');
  });

  downloader.on('start', ({ totalBytes, chunks }) => {
    console.log(`Partitioned file into ${chunks.length} segments.`);
  });

  downloader.on('progress', (data) => {
    const { downloadedBytes, totalBytes, percent, speed, eta, chunks } = data;
    
    // Clear last lines if terminal supports it or print formatted status
    const bar = renderProgressBar(percent, 25);
    const downloadedStr = formatBytes(downloadedBytes);
    const totalStr = formatBytes(totalBytes);
    const speedStr = `${formatBytes(speed)}/s`;
    const etaStr = formatTime(eta);

    // One-line status update
    process.stdout.write(`\r[${bar}] ${percent.toFixed(1)}% | ${downloadedStr}/${totalStr} | ⚡ ${speedStr} | ETA: ${etaStr} | Segments: ${chunks.filter(c => c.status === 'completed').length}/${chunks.length}   `);
  });

  downloader.on('complete', (stats) => {
    console.log('\n\n========================================================');
    console.log('  🎉 Download Completed Successfully!');
    console.log('========================================================');
    console.log(`[Saved to] : ${stats.filepath}`);
    console.log(`[Size]     : ${formatBytes(stats.totalBytes)}`);
    console.log(`[Time]     : ${(stats.totalTimeMs / 1000).toFixed(2)} seconds`);
    console.log(`[Avg Speed]: ${formatBytes(stats.averageSpeed)}/s`);
    console.log('========================================================\n');
  });

  downloader.on('error', (err) => {
    console.error(`\n\n❌ Download Error: ${err.message}\n`);
    process.exit(1);
  });

  await downloader.start();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
