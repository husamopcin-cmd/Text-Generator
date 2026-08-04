'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const aiChatSource = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const providerContract = require('../src/contracts/provider-metadata');
const metadata = require('../src/providers');

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractCurrentServerMetadata() {
  const metadataStart = aiChatSource.indexOf('const PROXY_PROVIDERS');
  const metadataEnd = aiChatSource.indexOf('const PROVIDER_TIMEOUTS');
  const fallbackStart = aiChatSource.indexOf('function getFallbackOrder');
  const fallbackEnd = aiChatSource.indexOf('exports.handler');
  assert.ok(metadataStart >= 0 && metadataEnd > metadataStart);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart);

  const context = { process: { env: {} }, result: null, exports: {} };
  vm.runInNewContext(`${aiChatSource.slice(metadataStart, metadataEnd)}
${aiChatSource.slice(fallbackStart, fallbackEnd)}
result = {
  providerIds: PROXY_PROVIDERS,
  defaultModels: DEFAULT_MODELS,
  visionModels: VISION_MODELS,
  order: {
    chat: getFallbackOrder('chat'),
    pdf: getFallbackOrder('pdf'),
    vision: getFallbackOrder('vision')
  }
};`, context);

  const keyBlock = aiChatSource.slice(
    aiChatSource.indexOf('const PROVIDER_KEYS'),
    aiChatSource.indexOf('const DEFAULT_MODELS')
  );
  const environmentVariables = Object.fromEntries(
    [...keyBlock.matchAll(/^\s{2}([a-z0-9]+): process\.env\.([A-Z0-9_]+)/gm)]
      .map(match => [match[1], match[2]])
  );

  return { ...toPlain(context.result), environmentVariables };
}

function parseCurrentAliases(labels) {
  const metadataStart = aiChatSource.indexOf('const PROXY_PROVIDERS');
  const metadataEnd = aiChatSource.indexOf('const PROVIDER_TIMEOUTS');
  const parserStart = aiChatSource.indexOf('function parseModelLabel');
  const parserEnd = aiChatSource.indexOf('function resolveModelId');
  const context = { process: { env: {} }, labels, result: null };

  vm.runInNewContext(`${aiChatSource.slice(metadataStart, metadataEnd)}
${aiChatSource.slice(parserStart, parserEnd)}
result = labels.map(parseModelLabel);`, context);

  return toPlain(context.result);
}

test('managed provider metadata exactly matches current server identifiers, models, keys, and ordering', () => {
  const current = extractCurrentServerMetadata();
  assert.deepEqual(metadata.MANAGED_PROVIDER_IDS, current.providerIds);
  assert.deepEqual(metadata.MANAGED_PROVIDER_ENVIRONMENT_VARIABLES, current.environmentVariables);
  assert.deepEqual(metadata.MANAGED_PROVIDER_DEFAULT_MODELS, current.defaultModels);
  assert.deepEqual(metadata.MANAGED_PROVIDER_VISION_MODELS, current.visionModels);
  assert.deepEqual(metadata.MANAGED_PROVIDER_ORDER, current.order);
});

test('provider definitions derive tasks, capability flags, models, aliases, and order without policy changes', () => {
  for (const providerId of metadata.MANAGED_PROVIDER_IDS) {
    const definition = metadata.MANAGED_PROVIDER_DEFINITIONS[providerId];
    const expectedTasks = Object.keys(metadata.MANAGED_PROVIDER_ORDER)
      .filter(taskType => metadata.MANAGED_PROVIDER_ORDER[taskType].includes(providerId));
    const expectedModels = [...new Set([
      metadata.MANAGED_PROVIDER_DEFAULT_MODELS[providerId],
      metadata.MANAGED_PROVIDER_VISION_MODELS[providerId]
    ].filter(Boolean))];

    assert.equal(definition.id, providerId);
    assert.deepEqual(definition.tasks, expectedTasks);
    assert.deepEqual(definition.models, expectedModels);
    assert.deepEqual(definition.aliases, {
      provider: [providerId],
      modelSuffix: [`-${providerId}`]
    });
    assert.equal(definition.streaming, false);
    assert.deepEqual(definition.capabilities, {
      chat: expectedTasks.includes('chat'),
      pdf: expectedTasks.includes('pdf'),
      vision: expectedTasks.includes('vision'),
      streaming: false
    });
    for (const taskType of expectedTasks) {
      assert.equal(definition.order[taskType], metadata.MANAGED_PROVIDER_ORDER[taskType].indexOf(providerId));
    }
  }
  assert.doesNotMatch(aiChatSource, /\bstream\s*:/);
  assert.ok(Object.isFrozen(metadata.MANAGED_PROVIDER_DEFINITIONS));
});

test('provider and model-suffix aliases preserve the current parser behavior', () => {
  const labels = metadata.MANAGED_PROVIDER_IDS.flatMap(providerId => [
    providerId,
    `${metadata.MANAGED_PROVIDER_DEFAULT_MODELS[providerId]}-${providerId}`
  ]);
  const parsed = parseCurrentAliases(labels);

  metadata.MANAGED_PROVIDER_IDS.forEach((providerId, index) => {
    const providerAlias = parsed[index * 2];
    const modelAlias = parsed[(index * 2) + 1];
    assert.deepEqual(providerAlias, {
      provider: providerId,
      modelId: metadata.MANAGED_PROVIDER_DEFAULT_MODELS[providerId],
      isProviderAlias: true
    });
    assert.deepEqual(modelAlias, {
      provider: providerId,
      modelId: metadata.MANAGED_PROVIDER_DEFAULT_MODELS[providerId],
      isProviderAlias: false
    });
  });
});

test('display names are copied only from existing client labels', () => {
  const selectStart = htmlSource.indexOf('<select id="modelSelect"');
  const selectEnd = htmlSource.indexOf('</select>', selectStart);
  const primaryModelSelect = htmlSource.slice(selectStart, selectEnd);

  for (const [providerId, displayName] of Object.entries(metadata.MANAGED_PROVIDER_DISPLAY_NAMES)) {
    if (providerId === 'xai') {
      assert.match(mainSource, /<option value="xai">Grok \/ xAI<\/option>/);
    } else if (displayName) {
      assert.ok(primaryModelSelect.includes(`value="${providerId}"`));
      assert.ok(primaryModelSelect.includes(`>${displayName}</option>`));
    } else {
      assert.equal(providerId, 'anthropic');
      assert.ok(!primaryModelSelect.includes('value="anthropic"'));
    }
  }
});

test('configured state is materialized from explicit environment values without reading runtime globals', () => {
  const resolved = metadata.getManagedProviderMetadata({
    OPENAI_API_KEY: 'configured',
    ANTHROPIC_API_KEY: 'configured'
  });
  const byId = Object.fromEntries(resolved.map(provider => [provider.id, provider]));

  assert.equal(byId.openai.configured, true);
  assert.equal(byId.anthropic.configured, true);
  assert.equal(byId.gemini.configured, false);
  assert.ok(Object.isFrozen(resolved));
  assert.ok(Object.isFrozen(byId.openai));
});

test('ProviderMetadata compatibility contract includes the extracted optional fields', () => {
  const optional = providerContract.PROVIDER_METADATA_CONTRACT.optional;
  for (const field of [
    'displayName',
    'aliases',
    'environmentVariable',
    'defaultModel',
    'visionModel',
    'models',
    'streaming',
    'capabilities',
    'order'
  ]) {
    assert.ok(optional.includes(field), `missing ProviderMetadata field: ${field}`);
  }
});

test('P2-001 metadata remains disconnected from production routing', () => {
  assert.doesNotMatch(aiChatSource, /src[\\/]providers|managed-provider-metadata/);
  assert.doesNotMatch(mainSource, /src[\\/]providers|managed-provider-metadata/);
});
