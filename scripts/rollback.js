#!/usr/bin/env node

/**
 * REA-IDM Automated Rollback Manager
 * 
 * Safely rolls back the codebase to any previous version or git release tag.
 * 
 * Usage:
 *   node scripts/rollback.js                    - Interactive rollback menu
 *   node scripts/rollback.js list               - List available release checkpoints
 *   node scripts/rollback.js to <version>       - Roll back to specific version (creates rollback branch)
 *   node scripts/rollback.js to <version> --restore - Linear rollback on current branch (clean git commit)
 *   node scripts/rollback.js to <version> --inspect - Checkout tag in detached HEAD mode for testing
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './changelog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_PATH = path.join(ROOT_DIR, 'package.json');
const MANIFEST_PATH = path.join(ROOT_DIR, 'src', 'extension', 'manifest.json');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

/**
 * Executes a git command safely across Windows/Linux using execFileSync
 * @param {string[]} args
 */
function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`Git command failed (git ${args.join(' ')}): ${err.stderr || err.message}`);
  }
}

/**
 * Checks if git is initialized and working
 */
function isGitRepo() {
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets list of release tags and changelog releases
 */
export function getAvailableCheckpoints() {
  if (!isGitRepo()) {
    throw new Error('Not a git repository. Git must be installed and initialized.');
  }

  // Get git tags with date and annotation
  const rawTags = runGit([
    'for-each-ref',
    '--sort=-creatordate',
    '--format=%(refname:short)|%(creatordate:short)|%(subject)',
    'refs/tags'
  ]);
  const gitTags = rawTags ? rawTags.split('\n').filter(Boolean).map(line => {
    // Strip leading/trailing single quotes if present
    const cleaned = line.replace(/^'|'$/g, '');
    const [tag, date, ...subjectParts] = cleaned.split('|');
    return {
      tag: tag.trim(),
      version: tag.replace(/^v/i, '').trim(),
      date: date ? date.trim() : 'Unknown',
      subject: subjectParts.join('|').trim()
    };
  }) : [];

  // Parse changelog for additional context
  const changelogReleases = parseChangelog();

  // Combine tag info with changelog data
  const checkpoints = gitTags.map(gt => {
    const matchingChangelog = changelogReleases.find(cr => cr.version === gt.version);
    return {
      ...gt,
      changelog: matchingChangelog || null
    };
  });

  return checkpoints;
}

/**
 * Checks if the git working directory has uncommitted changes
 */
export function isWorkingTreeClean() {
  const status = runGit(['status', '--porcelain']);
  return status.length === 0;
}

/**
 * Syncs version in package.json and extension manifest.json
 */
export function syncVersionFiles(version) {
  const cleanVersion = version.replace(/^v/i, '').trim();

  if (fs.existsSync(PACKAGE_PATH)) {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
    pkg.version = cleanVersion;
    fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  if (fs.existsSync(MANIFEST_PATH)) {
    const extPkg = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    extPkg.version = cleanVersion;
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(extPkg, null, 2) + '\n', 'utf8');
  }
}

/**
 * Performs safe rollback to a specific version/tag
 * 
 * @param {string} targetVersion e.g. "1.0.0" or "v1.0.0"
 * @param {Object} options
 * @param {'branch'|'restore'|'inspect'} [options.mode='branch']
 * @param {boolean} [options.force=false]
 * @param {string} [options.reason]
 */
export function rollback(targetVersion, options = {}) {
  const mode = options.mode || 'branch';
  const cleanVersion = targetVersion.replace(/^v/i, '').trim();
  const tagName = `v${cleanVersion}`;

  if (!isGitRepo()) {
    throw new Error('Not a git repository.');
  }

  // Verify tag exists
  const tags = runGit(['tag', '-l']).split('\n').map(t => t.trim());
  const matchedTag = tags.find(t => t.toLowerCase() === tagName.toLowerCase() || t.toLowerCase() === cleanVersion.toLowerCase());

  if (!matchedTag) {
    throw new Error(`Tag "${tagName}" or "${cleanVersion}" not found. Available tags: ${tags.join(', ') || '(none)'}`);
  }

  // Pre-flight check for uncommitted changes
  if (!options.force && !isWorkingTreeClean()) {
    throw new Error('Working directory has uncommitted changes. Please commit, stash, or pass --force before rolling back.');
  }

  const currentBranch = runGit(['branch', '--show-current']) || 'HEAD';

  console.log(`\n\x1b[1m\x1b[36m🔄 Initiating Rollback to [${matchedTag}] (Mode: ${mode.toUpperCase()})\x1b[0m`);
  console.log('='.repeat(65));

  if (mode === 'branch') {
    // Mode 1: Create a safe isolated branch from the tag
    const branchName = `rollback/${matchedTag}`;
    
    // Check if branch already exists
    const existingBranches = runGit(['branch', '--list']).split('\n').map(b => b.replace(/^\*?\s*/, '').trim());
    if (existingBranches.includes(branchName)) {
      console.log(`Branch "${branchName}" already exists. Switching to it...`);
      runGit(['checkout', branchName]);
    } else {
      console.log(`Creating and switching to new safe rollback branch: "${branchName}"...`);
      runGit(['checkout', '-b', branchName, matchedTag]);
    }

    syncVersionFiles(cleanVersion);
    console.log(`\x1b[32m✔ Successfully switched to branch "${branchName}" at ${matchedTag}\x1b[0m`);
    console.log(`\nNext steps:`);
    console.log(`  1. Verify functionality: \x1b[33mnpm test\x1b[0m`);
    console.log(`  2. Test desktop app:     \x1b[33mnpm run desktop\x1b[0m`);
    console.log(`  3. When ready to merge:  \x1b[33mgit checkout ${currentBranch} && git merge ${branchName}\x1b[0m`);
    console.log(`  4. Return to main:       \x1b[33mgit checkout ${currentBranch}\x1b[0m\n`);

  } else if (mode === 'restore') {
    // Mode 2: Linear revert on current branch (replaces working tree files with tag files)
    console.log(`Restoring working tree files to state of [${matchedTag}] on branch "${currentBranch}"...`);
    runGit(['checkout', matchedTag, '--', '.']);

    syncVersionFiles(cleanVersion);

    // Record rollback notice in CHANGELOG.md
    if (fs.existsSync(CHANGELOG_PATH)) {
      let changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
      const rollbackMsg = `- Codebase rolled back to version ${matchedTag} (${options.reason || 'Manual rollback request'})`;
      
      const unreleasedRegex = /##\s*\[Unreleased\]([\s\S]*?)(?=##\s*\[|$)/i;
      const match = changelog.match(unreleasedRegex);
      if (match) {
        const updated = `## [Unreleased]\n\n### Changed\n${rollbackMsg}\n` + match[1].replace(/###\s*Changed\s*/i, '');
        changelog = changelog.replace(match[0], updated);
        fs.writeFileSync(CHANGELOG_PATH, changelog, 'utf8');
      }
    }

    // Auto-commit rollback
    runGit(['add', '.']);
    const commitMsg = `revert: rollback codebase to ${matchedTag} (${options.reason || 'manual rollback'})`;
    runGit(['commit', '-m', commitMsg]);

    console.log(`\x1b[32m✔ Codebase successfully rolled back to ${matchedTag} on "${currentBranch}"!\x1b[0m`);
    console.log(`Created clean revert commit: \x1b[33m"${commitMsg}"\x1b[0m`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run test suite: \x1b[33mnpm test\x1b[0m`);
    console.log(`  2. Push safely to remote: \x1b[33mgit push origin ${currentBranch}\x1b[0m (Linear history preserved, no force-push needed!)\n`);

  } else if (mode === 'inspect') {
    // Mode 3: Detached checkout for testing
    console.log(`Checking out [${matchedTag}] in detached HEAD state for inspection...`);
    runGit(['checkout', matchedTag]);

    console.log(`\x1b[32m✔ Checked out ${matchedTag} (Detached HEAD)\x1b[0m`);
    console.log(`\nNotes:`);
    console.log(`  - You are viewing the exact snapshot of ${matchedTag}.`);
    console.log(`  - Any temporary edits will not affect branches unless committed to a new branch.`);
    console.log(`  - To return to your branch: \x1b[33mgit checkout ${currentBranch}\x1b[0m\n`);
  }
}

/**
 * Formats and prints available release checkpoints
 */
export function printAvailableCheckpoints() {
  const checkpoints = getAvailableCheckpoints();
  
  console.log('\n' + '='.repeat(68));
  console.log('  🎯 REA-IDM — Available Version Checkpoints & Rollback Targets');
  console.log('='.repeat(68) + '\n');

  if (checkpoints.length === 0) {
    console.log('  No release tags found in git repository.');
    console.log('  Create a release tag first with: \x1b[33mnode scripts/changelog.js release <version>\x1b[0m\n');
    return;
  }

  checkpoints.forEach((cp, idx) => {
    console.log(`  \x1b[1m\x1b[36m[${idx + 1}] ${cp.tag}\x1b[0m \x1b[90m(${cp.date})\x1b[0m`);
    if (cp.subject) {
      console.log(`      \x1b[37m${cp.subject}\x1b[0m`);
    }
    if (cp.changelog) {
      const added = cp.changelog.sections.added?.length || 0;
      const fixed = cp.changelog.sections.fixed?.length || 0;
      const changed = cp.changelog.sections.changed?.length || 0;
      console.log(`      \x1b[90mHighlights: ${added} added, ${fixed} fixed, ${changed} changed\x1b[0m`);
    }
    console.log('');
  });
}

/**
 * Interactive rollback prompt using readline
 */
async function runInteractiveMenu() {
  const checkpoints = getAvailableCheckpoints();
  if (checkpoints.length === 0) {
    console.log('\x1b[31mNo release checkpoints found to roll back to.\x1b[0m');
    return;
  }

  printAvailableCheckpoints();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise(resolve => rl.question(query, resolve));

  try {
    const choice = await question(`Select version to roll back to (1-${checkpoints.length}, or type tag e.g. v1.0.0, or 'q' to quit): `);
    if (!choice || choice.trim().toLowerCase() === 'q') {
      console.log('Rollback cancelled.');
      rl.close();
      return;
    }

    let selectedCp = null;
    const num = parseInt(choice.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= checkpoints.length) {
      selectedCp = checkpoints[num - 1];
    } else {
      selectedCp = checkpoints.find(c => c.tag.toLowerCase() === choice.trim().toLowerCase() || c.version === choice.trim());
    }

    if (!selectedCp) {
      console.log('\x1b[31mInvalid selection.\x1b[0m');
      rl.close();
      return;
    }

    console.log(`\nSelected target: \x1b[1m\x1b[36m${selectedCp.tag}\x1b[0m`);
    console.log(`\nChoose rollback strategy:`);
    console.log(`  \x1b[1m[1] Safe Branch (Recommended)\x1b[0m: Creates a new isolated branch "rollback/${selectedCp.tag}"`);
    console.log(`  \x1b[1m[2] Linear Revert\x1b[0m: Restores current branch to this version with a clean revert commit`);
    console.log(`  \x1b[1m[3] Inspection Only\x1b[0m: Checks out detached tag snapshot for quick testing\n`);

    const modeChoice = await question('Enter choice (1, 2, or 3) [Default: 1]: ');
    let mode = 'branch';
    if (modeChoice.trim() === '2') mode = 'restore';
    else if (modeChoice.trim() === '3') mode = 'inspect';

    let reason = '';
    if (mode === 'restore') {
      reason = await question('Enter reason for rollback (optional): ');
    }

    const confirm = await question(`Are you sure you want to proceed with rollback to ${selectedCp.tag}? (y/N): `);
    if (confirm.trim().toLowerCase() !== 'y') {
      console.log('Rollback cancelled by user.');
      rl.close();
      return;
    }

    rl.close();
    rollback(selectedCp.tag, { mode, reason: reason.trim() });

  } catch (err) {
    rl.close();
    console.error(`\x1b[31mError during rollback: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command) {
    await runInteractiveMenu();
    return;
  }

  if (command === 'list') {
    printAvailableCheckpoints();
    return;
  }

  if (command === 'to') {
    const version = args[1];
    if (!version) {
      console.error('Usage: node scripts/rollback.js to <version> [--branch | --restore | --inspect]');
      process.exit(1);
    }

    let mode = 'branch';
    if (args.includes('--restore')) mode = 'restore';
    if (args.includes('--inspect')) mode = 'inspect';
    const force = args.includes('--force');

    try {
      rollback(version, { mode, force });
    } catch (err) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
      process.exit(1);
    }
    return;
  }

  console.log(`
REA-IDM Rollback Manager

Commands:
  node scripts/rollback.js                     Launch interactive rollback selector
  node scripts/rollback.js list                List all available release tags & checkpoints
  node scripts/rollback.js to <ver>            Roll back by creating isolated branch rollback/<ver>
  node scripts/rollback.js to <ver> --restore  Roll back directly on current branch with clean revert commit
  node scripts/rollback.js to <ver> --inspect  Checkout tag in detached HEAD mode for inspection
  `);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
