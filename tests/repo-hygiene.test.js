const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'scripts', 'export-safe.ps1'), 'utf8');

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
