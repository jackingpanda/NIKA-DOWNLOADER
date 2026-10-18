#!/usr/bin/env node

/**
 * NIKA DOWNLOADER Changelog Management System
 * 
 * Provides automated parsing, entry addition, version release, and JSON export.
 * Usage:
 *   node scripts/changelog.js view              - View formatted changelog
 *   node scripts/changelog.js json              - Print JSON structure
 *   node scripts/changelog.js add [type] [msg]  - Add entry to [Unreleased]
 *   node scripts/changelog.js release [ver]     - Bump [Unreleased] to a new version
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');
const PACKAGE_PATH = path.join(ROOT_DIR, 'package.json');

/**
 * Parses markdown CHANGELOG.md into a structured array of releases.
 * @param {string} [content]
 * @returns {Array<Object>}
 */
export function parseChangelog(content) {
  if (!content) {
    if (!fs.existsSync(CHANGELOG_PATH)) return [];
    content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  }

  const releases = [];
  const lines = content.split(/\r?\n/);

  let currentRelease = null;
  let currentSection = null;

  for (let line of lines) {
    // Version heading, e.g., "## [1.0.0] - 2026-10-18" or "## [Unreleased]"
    const releaseMatch = line.match(/^##\s*\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
    if (releaseMatch) {
      if (currentRelease) {
        releases.push(currentRelease);
      }
      currentRelease = {
        version: releaseMatch[1].trim(),
        date: releaseMatch[2] ? releaseMatch[2].trim() : (releaseMatch[1].toLowerCase() === 'unreleased' ? null : 'Recent'),
        isUnreleased: releaseMatch[1].toLowerCase() === 'unreleased',
        sections: {
          added: [],
          changed: [],
          deprecated: [],
          removed: [],
          fixed: [],
          security: []
        }
      };
      currentSection = null;
      continue;
    }

    if (!currentRelease) continue;

    // Sub-section heading, e.g., "### Added", "### Fixed"
    const sectionMatch = line.match(/^###\s*(Added|Changed|Deprecated|Removed|Fixed|Security)/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      continue;
    }

    if (line.trim().startsWith('---') || line.trim().startsWith('***')) {
      continue;
    }

    // List item, e.g., "- Core Engine improvements"
    if (currentSection && line.trim().startsWith('-')) {
      const item = line.trim().replace(/^-\s*/, '').trim();
      if (item && currentRelease.sections[currentSection]) {
        currentRelease.sections[currentSection].push(item);
      }
    }
  }

  if (currentRelease) {
    releases.push(currentRelease);
  }

  return releases;
}

/**
 * Adds an entry to the [Unreleased] section in CHANGELOG.md.
 * @param {'added'|'changed'|'fixed'|'security'} type 
 * @param {string} message 
 */
export function addEntry(type, message) {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error('CHANGELOG.md not found at ' + CHANGELOG_PATH);
  }

  const normalizedType = type.toLowerCase();
  const validTypes = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];
  if (!validTypes.includes(normalizedType)) {
    throw new Error(`Invalid type "${type}". Must be one of: ${validTypes.join(', ')}`);
  }

  const typeHeader = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);
  let content = fs.readFileSync(CHANGELOG_PATH, 'utf8');

  // Check if [Unreleased] section exists
  const unreleasedRegex = /##\s*\[Unreleased\]([\s\S]*?)(?=##\s*\[|$)/i;
  const match = content.match(unreleasedRegex);

  if (!match) {
    // Prepend [Unreleased] right after header
    const headerMarker = 'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n---\n';
    const newSection = `\n## [Unreleased]\n\n### ${typeHeader}\n- ${message}\n\n---\n`;
    if (content.includes(headerMarker)) {
      content = content.replace(headerMarker, headerMarker + newSection);
    } else {
      content = `## [Unreleased]\n\n### ${typeHeader}\n- ${message}\n\n---\n\n` + content;
    }
  } else {
    let unreleasedBody = match[1];
    const sectionRegex = new RegExp(`###\\s*${typeHeader}\\s*([\\s\\S]*?)(?=###|$)`, 'i');
    const sectionMatch = unreleasedBody.match(sectionRegex);

    if (sectionMatch) {
      // Append item under existing section
      const updatedSection = `### ${typeHeader}\n- ${message}\n` + sectionMatch[1].trimStart();
      unreleasedBody = unreleasedBody.replace(sectionMatch[0], updatedSection);
    } else {
      // Add new sub-section heading
      unreleasedBody = `\n### ${typeHeader}\n- ${message}\n` + unreleasedBody.trimStart();
    }

    content = content.replace(match[0], `## [Unreleased]${unreleasedBody}`);
  }

  fs.writeFileSync(CHANGELOG_PATH, content, 'utf8');
  console.log(`[OK] Added [${typeHeader}] entry: "${message}"`);
}

/**
 * Bumps the [Unreleased] section to a specific version with today's date.
 * Also updates package.json version.
 * @param {string} newVersion 
 */
export function releaseVersion(newVersion) {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error('CHANGELOG.md not found');
  }

  const cleanVersion = newVersion.replace(/^v/i, '').trim();
  const today = new Date().toISOString().split('T')[0];

  let content = fs.readFileSync(CHANGELOG_PATH, 'utf8');

  // Replace ## [Unreleased] with ## [Unreleased]\n\n---\n\n## [newVersion] - today
  const unreleasedRegex = /##\s*\[Unreleased\]([\s\S]*?)(?=---\s*\n\s*##\s*\[|$)/i;
  const match = content.match(unreleasedRegex);

  if (!match) {
    throw new Error('Could not find [Unreleased] section to release');
  }

  const unreleasedBody = match[1].trim();
  if (!unreleasedBody) {
    throw new Error('[Unreleased] section is empty. Add entries first with "node scripts/changelog.js add"');
  }

  const newReleaseHeader = `## [Unreleased]\n\n---\n\n## [${cleanVersion}] - ${today}\n\n${unreleasedBody}\n\n`;
  content = content.replace(match[0], newReleaseHeader);

  fs.writeFileSync(CHANGELOG_PATH, content, 'utf8');
  console.log(`[OK] Released version [${cleanVersion}] - ${today}`);

  // Update package.json version
  if (fs.existsSync(PACKAGE_PATH)) {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
    pkg.version = cleanVersion;
    fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`[OK] Updated package.json version to "${cleanVersion}"`);
  }

  // Update extension manifest.json version
  const extManifestPath = path.join(ROOT_DIR, 'src', 'extension', 'manifest.json');
  if (fs.existsSync(extManifestPath)) {
    const extPkg = JSON.parse(fs.readFileSync(extManifestPath, 'utf8'));
    extPkg.version = cleanVersion;
    fs.writeFileSync(extManifestPath, JSON.stringify(extPkg, null, 2) + '\n', 'utf8');
    console.log(`[OK] Updated extension manifest.json version to "${cleanVersion}"`);
  }

  // Attempt to create git commit & release tag checkpoint for rollbacks
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT_DIR, stdio: 'ignore' });
    execFileSync('git', ['add', CHANGELOG_PATH, PACKAGE_PATH, extManifestPath], { cwd: ROOT_DIR, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', `chore(release): v${cleanVersion}`], { cwd: ROOT_DIR, stdio: 'ignore' });
    execFileSync('git', ['tag', '-a', `v${cleanVersion}`, '-m', `Release v${cleanVersion}`], { cwd: ROOT_DIR, stdio: 'ignore' });
    console.log(`[OK] Created git checkpoint tag "v${cleanVersion}"`);
  } catch {
    // Git is not initialized or clean; safe to skip
  }
}

/**
 * Formats parsed changelog for terminal output with colors & boxes
 */
export function printFormattedChangelog() {
  const releases = parseChangelog();
  if (releases.length === 0) {
    console.log('No releases found in CHANGELOG.md');
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  📜 NIKA DOWNLOADER — Project Changelog');
  console.log('='.repeat(60) + '\n');

  for (const rel of releases) {
    const tag = rel.isUnreleased ? '🚧 [Unreleased]' : `📦 [v${rel.version}] — ${rel.date}`;
    console.log(`\x1b[1m\x1b[36m${tag}\x1b[0m`);
    console.log('-'.repeat(tag.length));

    let hasItems = false;
    for (const [secName, items] of Object.entries(rel.sections)) {
      if (items.length > 0) {
        hasItems = true;
        const color = secName === 'added' ? '\x1b[32m' : (secName === 'fixed' ? '\x1b[33m' : '\x1b[35m');
        console.log(`  ${color}${secName.toUpperCase()}\x1b[0m:`);
        for (const item of items) {
          console.log(`    • ${item}`);
        }
      }
    }

    if (!hasItems) {
      console.log('    (No logged changes)');
    }
    console.log('');
  }
}

// CLI Command Runner
function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || 'view';

  switch (command) {
    case 'view':
      printFormattedChangelog();
      break;

    case 'json':
      console.log(JSON.stringify(parseChangelog(), null, 2));
      break;

    case 'add': {
      let type = args[1];
      let msg = args.slice(2).join(' ');

      // Flags support: --type added --msg "..."
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--type' && args[i + 1]) {
          type = args[i + 1];
          i++;
        } else if (args[i] === '--msg' && args[i + 1]) {
          msg = args.slice(i + 1).join(' ');
          break;
        }
      }

      if (!type || !msg) {
        console.error('Usage: node scripts/changelog.js add <added|changed|fixed|security> <message>');
        process.exit(1);
      }
      addEntry(type, msg);
      break;
    }

    case 'release': {
      const version = args[1];
      if (!version) {
        console.error('Usage: node scripts/changelog.js release <version>');
        console.error('Example: node scripts/changelog.js release 1.1.0');
        process.exit(1);
      }
      releaseVersion(version);
      break;
    }

    case 'help':
    default:
      console.log(`
NIKA DOWNLOADER Changelog Management System

Commands:
  node scripts/changelog.js view               Print formatted changelog in terminal
  node scripts/changelog.js json               Output structured JSON
  node scripts/changelog.js add <type> <msg>   Add entry to [Unreleased]
  node scripts/changelog.js release <version>  Release unreleased changes under new version
      `);
      break;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
