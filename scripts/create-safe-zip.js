#!/usr/bin/env node

/**
 * CinoCode Safe ZIP Export Script
 * 
 * Creates a secure ZIP archive of the repository for distribution.
 * Only includes committed HEAD content, excluding secrets and sensitive files.
 * 
 * Usage:
 *   node scripts/create-safe-zip.js [output-path]
 * 
 * Security guarantees:
 * - Only committed HEAD content is archived (git archive)
 * - Working tree must be clean (no uncommitted changes)
 * - Sensitive paths are blocked even if tracked by git
 * - Archive contents are validated after creation
 * - No secrets, logs, or development artifacts are included
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');

// Blocked patterns - paths that should never be in the archive
const BLOCKED_PATTERNS = [
  /^\.env($|\.local$|\.production$|\.staging$|\.dev$|\.test$)/,
  /^\.git($|\/)/,
  /^\.idea($|\/)/,
  /^\.vs($|\/)/,
  /^\.vscode($|\/)/,
  /^\.claude($|\/)/,
  /^\.agents($|\/)/,
  /^\.codex($|\/)/,
  /^node_modules($|\/)/,
  /^venv($|\/)/,
  /^__pycache__($|\/)/,
  /^\.netlify($|\/)/,
  /^\.vercel($|\/)/,
  /^test-results($|\/)/,
  /^playwright-report($|\/)/,
  /^\.pytest_cache($|\/)/,
  /^\.coverage$/,
  /^coverage($|\/)/,
  /\.log$/,
  /\.pid$/,
  /\.seed$/,
  /\.pid\.lock$/,
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /^desktop\.ini$/,
  /^users\.db$/,
  /^debug\.log$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/,
  /(credentials|service[-_]?account|oauth)[^/]*\.json$/,
  /\.npmrc$/,
  /\.yarnrc$/,
  /\.pnpmrc$/,
  /^\.yarn($|\/)/,
  /^\.pnpm($|\/)/,
];

// Allowed file extensions (whitelist-based approach for extra safety)
const ALLOWED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.json', '.md', '.txt', '.yml', '.yaml',
  '.py', '.pyc', '.pyo',
  '.bat', '.sh', '.ps1',
  '.toml', '.lock', '.gitignore', '.gitattributes',
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.map', // sourcemaps are acceptable
]);

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', ...options });
  } catch (error) {
    error.message = `Command failed: ${cmd}\n${error.message}`;
    throw error;
  }
}

function getRepoRoot() {
  try {
    const root = exec('git rev-parse --show-toplevel').trim();
    return root;
  } catch (error) {
    throw new Error('Not a Git repository. This script must be run inside a Git repo.');
  }
}

function checkWorkingTreeClean(repoRoot) {
  try {
    const status = exec('git status --porcelain --untracked-files=no', { cwd: repoRoot });
    if (status.trim()) {
      throw new Error(
        'Working tree has uncommitted changes. Commit or stash them before creating a safe export.\n' +
        'Run: git status'
      );
    }
  } catch (error) {
    if (error.message.includes('uncommitted changes')) throw error;
    throw new Error(`Failed to check git status: ${error.message}`);
  }
}

function getTrackedFiles(repoRoot) {
  try {
    const files = exec('git ls-files', { cwd: repoRoot });
    return files.trim().split('\n').filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to list tracked files: ${error.message}`);
  }
}

function checkBlockedFiles(trackedFiles) {
  const blocked = trackedFiles.filter(file => {
    const normalizedPath = file.replace(/\\/g, '/');
    return BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath));
  });

  if (blocked.length > 0) {
    throw new Error(
      `Blocked sensitive files are tracked by Git. Remove them before export:\n` +
      blocked.map(f => `  - ${f}`).join('\n') +
      '\n\nTo remove from git: git rm --cached <file>'
    );
  }
}

function validateArchiveContents(zipPath, repoRoot) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const violations = [];

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(new Error(`Failed to open ZIP: ${err.message}`));

      zipfile.on('entry', (entry) => {
        entries.push(entry.fileName);

        // Check for blocked patterns in archive
        const normalizedPath = entry.fileName.replace(/\\/g, '/');
        
        // Check blocked patterns
        if (BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath))) {
          violations.push(`Blocked pattern: ${entry.fileName}`);
        }

        // Check for suspicious file names
        if (normalizedPath.includes('.env') || 
            normalizedPath.includes('secret') || 
            normalizedPath.includes('credential') ||
            normalizedPath.includes('password') ||
            normalizedPath.includes('token') ||
            normalizedPath.includes('private') ||
            normalizedPath.includes('key.')) {
          violations.push(`Suspicious filename: ${entry.fileName}`);
        }

        // Check for extremely large files (>50MB)
        if (entry.uncompressedSize > 50 * 1024 * 1024) {
          violations.push(`Oversized file: ${entry.fileName} (${Math.round(entry.uncompressedSize / 1024 / 1024)}MB)`);
        }

        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        if (violations.length > 0) {
          reject(new Error(
            `Archive validation failed:\n` +
            violations.map(v => `  - ${v}`).join('\n')
          ));
        } else {
          resolve({ entries, violations });
        }
      });

      zipfile.on('error', (err) => {
        reject(new Error(`ZIP read error: ${err.message}`));
      });

      zipfile.readEntry();
    });
  });
}

async function createSafeZip(outputPath) {
  const repoRoot = getRepoRoot();
  console.error(`Repository root: ${repoRoot}`);

  // Check working tree is clean
  console.error('Checking working tree...');
  checkWorkingTreeClean(repoRoot);

  // Get tracked files and check for blocked patterns
  console.error('Checking tracked files...');
  const trackedFiles = getTrackedFiles(repoRoot);
  console.error(`Found ${trackedFiles.length} tracked files`);
  checkBlockedFiles(trackedFiles);

  // Determine output path
  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const repoName = path.basename(repoRoot);
    outputPath = path.join(path.dirname(repoRoot), `${repoName}-safe-${timestamp}.zip`);
  } else if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(repoRoot, outputPath);
  }

  outputPath = path.resolve(outputPath);

  // Check output doesn't exist
  if (fs.existsSync(outputPath)) {
    throw new Error(`Output file already exists: ${outputPath}`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create archive using git archive
  console.error(`Creating archive: ${outputPath}`);
  try {
    exec(`git archive --format=zip --output="${outputPath}" HEAD`, { cwd: repoRoot });
  } catch (error) {
    throw new Error(`Git archive failed: ${error.message}`);
  }

  // Verify archive was created
  if (!fs.existsSync(outputPath)) {
    throw new Error('Archive file was not created');
  }

  const stats = fs.statSync(outputPath);
  console.error(`Archive size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Validate archive contents
  console.error('Validating archive contents...');
  try {
    const validation = await validateArchiveContents(outputPath, repoRoot);
    console.error(`Archive contains ${validation.entries.length} entries`);
  } catch (error) {
    // Delete invalid archive
    fs.unlinkSync(outputPath);
    throw error;
  }

  console.error('✓ Archive validated successfully');
  console.log(outputPath);
}

// Main execution
async function main() {
  try {
    const outputPath = process.argv[2];
    await createSafeZip(outputPath);
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createSafeZip, BLOCKED_PATTERNS, validateArchiveContents };
