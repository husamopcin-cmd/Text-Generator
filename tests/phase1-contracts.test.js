'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contracts = require('../src/contracts');
const adapters = require('../src/adapters');

test('compatibility contracts expose the Phase 1 public shapes without validators or routing', () => {
  assert.equal(contracts.CHAT_REQUEST_CONTRACT.name, 'ChatRequest');
  assert.deepEqual(contracts.CHAT_REQUEST_CONTRACT.required, ['messages']);
  assert.deepEqual(contracts.CHAT_RESPONSE_CONTRACT.required, ['ok', 'provider', 'model', 'content']);
  assert.deepEqual(contracts.IMAGE_REQUEST_CONTRACT.required, ['prompt']);
  assert.deepEqual(contracts.IMAGE_RESPONSE_CONTRACT.required, ['ok', 'provider', 'images', 'attempts']);
  assert.equal(contracts.AI_ERROR_CONTRACT.name, 'AIError');
  assert.equal(contracts.CAPABILITY_CONTRACT.name, 'Capability');
  assert.equal(contracts.PROVIDER_METADATA_CONTRACT.name, 'ProviderMetadata');
});

test('chat contract limits match the current ai-chat handler constants', () => {
  const source = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');
  assert.equal(contracts.CHAT_LIMITS.bodyBytes, 6 * 1024 * 1024);
  assert.equal(contracts.CHAT_LIMITS.functionBudgetMs, 55000);
  assert.match(source, /maxBodyBytes: 6 \* 1024 \* 1024/);
  assert.match(source, /const FUNCTION_BUDGET_MS = 55000/);
  assert.match(source, /const count = taskType === 'pdf' \? 8 : 4/);
  assert.match(source, /const maxLen = taskType === 'pdf' \? 40000 : 20000/);
  assert.match(source, /m\.images\.slice\(0, 20\)/);
});

test('image contract limits match current normalization and endpoint guards', () => {
  const source = fs.readFileSync(path.join(root, 'netlify', 'functions', 'generate-image.js'), 'utf8');
  assert.equal(contracts.IMAGE_LIMITS.promptCharacters.max, 8000);
  assert.equal(contracts.IMAGE_LIMITS.width.min, 256);
  assert.equal(contracts.IMAGE_LIMITS.width.max, 2048);
  assert.match(source, /maxBodyBytes: 64 \* 1024/);
  assert.match(source, /Math\.min\(2048, Math\.max\(256, parseInt\(body\.width, 10\) \|\| 1024\)\)/);
  assert.match(source, /prompt\.length > 8000/);
});

test('Phase 1 adapters fail closed and cannot silently route production traffic', () => {
  const cases = [
    [new adapters.PlatformClient(), 'chat'],
    [new adapters.ProviderRegistry(), 'resolve'],
    [new adapters.PromptEngine(), 'compose'],
    [new adapters.ExecutionAdapter(), 'execute'],
    [new adapters.StreamAdapter(), 'open'],
    [new adapters.StorageAdapter(), 'load']
  ];

  for (const [adapter, operation] of cases) {
    assert.throws(
      () => adapter[operation](),
      error => error instanceof adapters.AdapterNotConfiguredError && error.code === 'adapter_not_configured'
    );
  }
});

test('production browser and serverless entry points do not import Phase 1 skeletons', () => {
  const productionFiles = [
    'cinocode_chat.html',
    ...fs.readdirSync(path.join(root, 'assets', 'js'), { recursive: true })
      .filter(file => String(file).endsWith('.js'))
      .map(file => path.join('assets', 'js', String(file))),
    ...fs.readdirSync(path.join(root, 'netlify', 'functions'))
      .filter(file => file.endsWith('.js'))
      .map(file => path.join('netlify', 'functions', file))
  ];

  for (const relativePath of productionFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /src[\\/]adapters|PlatformClient|ProviderRegistry|PromptEngine|ExecutionAdapter|StreamAdapter|StorageAdapter/,
      `${relativePath} must not route through Phase 1 skeletons`);
  }
});
