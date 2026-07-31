#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publishDir = path.join(root, 'dist');
const runtimeEntries = [
  'index.html',
  'cinocode_chat.html',
  'manifest.json',
  'models.json',
  'sw.js',
  'assets',
  'vendor'
];

function assertSafePublishDir(target) {
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== root || path.basename(resolved) !== 'dist') {
    throw new Error(`Refusing unsafe publish directory: ${resolved}`);
  }
}

function copyRuntimeEntry(entry) {
  const source = path.join(root, entry);
  const destination = path.join(publishDir, entry);
  if (!fs.existsSync(source)) throw new Error(`Missing runtime entry: ${entry}`);
  fs.cpSync(source, destination, { recursive: true, errorOnExist: false });
}

function validatePublishTree() {
  const required = [
    'index.html',
    'cinocode_chat.html',
    'manifest.json',
    'sw.js',
    'assets/js/main.js',
    'assets/css/main.css',
    'vendor/dompurify-3.4.7.min.js'
  ];
  const forbidden = [
    'supabase',
    'tests',
    'scripts',
    'node_modules',
    '.git',
    '.env',
    'NETLIFY-ENV-KURULUM.md'
  ];

  for (const entry of required) {
    if (!fs.existsSync(path.join(publishDir, entry))) {
      throw new Error(`Publish artifact is missing required entry: ${entry}`);
    }
  }
  for (const entry of forbidden) {
    if (fs.existsSync(path.join(publishDir, entry))) {
      throw new Error(`Forbidden publish entry detected: ${entry}`);
    }
  }
}

function prepareNetlifyPublish() {
  assertSafePublishDir(publishDir);
  fs.rmSync(publishDir, { recursive: true, force: true });
  fs.mkdirSync(publishDir);
  runtimeEntries.forEach(copyRuntimeEntry);
  validatePublishTree();
  console.log(`Prepared Netlify publish artifact: ${publishDir}`);
}

if (require.main === module) prepareNetlifyPublish();

module.exports = {
  prepareNetlifyPublish,
  validatePublishTree,
  runtimeEntries,
  publishDir
};
