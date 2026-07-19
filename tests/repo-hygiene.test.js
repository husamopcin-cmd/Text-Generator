const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('child_process');
const os = require('os');

const root = path.resolve(__dirname, '..');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'scripts', 'export-safe.ps1'), 'utf8');
const { BLOCKED_PATTERNS } = require('../scripts/create-safe-zip');

test('IDE workspace folders are ignored', () => {
  assert.match(gitignore, /^\.idea\/$/m);
  assert.match(gitignore, /^\.vs\/$/m);
});

test('safe exporter archives only committed HEAD content', () => {
  assert.match(exporter, /status --porcelain --untracked-files=no/);
  assert.match(exporter, /git -C \$repoRoot archive --format=zip/);
  assert.doesNotMatch(exporter, /Compress-Archive/);
});

test('safe exporter blocks secret and workspace paths', () => {
  for (const marker of ['\\.env', '\\.git', '\\.idea', '\\.vs', 'node_modules', 'service[-_]?', '\\.(pem|key|p12|pfx)']) {
    assert.ok(exporter.includes(marker), `Missing blocked marker: ${marker}`);
  }
});

// Safe ZIP script tests
test('BLOCKED_PATTERNS blocks sensitive paths', () => {
  const blockedPaths = [
    '.env',
    '.env.local',
    '.env.production',
    '.git/config',
    'node_modules/pkg/index.js',
    '.netlify/state.json',
    '.vercel/project.json',
    'users.db',
    'debug.log',
    'playwright-report/index.html',
    'test-results/result.json',
    'id_rsa',
    'credentials.json'
  ];

  for (const testPath of blockedPaths) {
    const normalizedPath = testPath.replace(/\\/g, '/');
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath));
    assert.ok(isBlocked, `Path should be blocked: ${testPath}`);
  }
});

test('BLOCKED_PATTERNS allows normal project files', () => {
  const allowedPaths = [
    'assets/js/main.js',
    'netlify/functions/generate-image.js',
    'README.md',
    '.env.example',
    'tests/example.test.js'
  ];

  for (const testPath of allowedPaths) {
    const normalizedPath = testPath.replace(/\\/g, '/');
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath));
    assert.ok(!isBlocked, `Path should be allowed: ${testPath}`);
  }
});

test('BLOCKED_PATTERNS blocks SSH keys and credential files', () => {
  const sensitiveFiles = [
    'id_rsa',
    'id_rsa.pub',
    'id_ed25519',
    'credentials.json',
    'service-account.json',
    'oauth-credentials.json',
    'config.pem',
    'private.key',
    'cert.p12',
    'keystore.pfx'
  ];

  for (const testPath of sensitiveFiles) {
    const normalizedPath = testPath.replace(/\\/g, '/');
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath));
    assert.ok(isBlocked, `Sensitive file should be blocked: ${testPath}`);
  }
});

test('BLOCKED_PATTERNS blocks development artifacts', () => {
  const devArtifacts = [
    'node_modules/lodash/index.js',
    'venv/lib/python3.9/site-packages/requests/__init__.py',
    '__pycache__/module.pyc',
    '.netlify/cache/xyz',
    '.vercel/cache/abc',
    'test-results/junit.xml',
    'playwright-report/index.html',
    '.pytest_cache/.lock',
    'coverage/lcov.info',
    'debug.log',
    'app.pid',
    'npm-debug.log'
  ];

  for (const testPath of devArtifacts) {
    const normalizedPath = testPath.replace(/\\/g, '/');
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath));
    assert.ok(isBlocked, `Dev artifact should be blocked: ${testPath}`);
  }
});

test('BLOCKED_PATTERNS blocks OS-specific files', () => {
  const osFiles = [
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini'
  ];

  for (const testPath of osFiles) {
    const normalizedPath = testPath.replace(/\\/g, '/');
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(normalizedPath));
    assert.ok(isBlocked, `OS file should be blocked: ${testPath}`);
  }
});
