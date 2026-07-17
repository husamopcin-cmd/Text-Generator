const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');

function extractFunction(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing function start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing function end: ${endPattern}`);
  return tail.slice(0, end);
}

const getImageProviderStatusSrc = extractFunction(/function getImageProviderStatus/, /\n\s*function getVideoProviderStatus/);
const renderProviderErrorCardSrc = extractFunction(/function renderProviderErrorCard/, /\n\s*function renderMediaErrorMessage/);
const triggerRunwareImagesSrc = extractFunction(/async function triggerRunwareImages/, /\n\s*function buildImageUrl/);
const handleGeneratedImageErrorSrc = extractFunction(/function handleGeneratedImageError/, /\n\s*function handleGeneratedImageLoad/);

function makeFakeCard(attrs = {}) {
  const store = { ...attrs };
  return {
    getAttribute: (key) => (key in store ? store[key] : null),
    setAttribute: (key, value) => { store[key] = value; },
    _store: store
  };
}

test('a real backend reason (all_providers_failed) is no longer swallowed into the generic provider_unavailable path without its detail', () => {
  const context = { window: { location: { protocol: 'https:' } }, result: null };
  vm.createContext(context);
  vm.runInContext(getImageProviderStatusSrc, context);
  context.card = makeFakeCard({
    'data-runware-error': 'all_providers_failed',
    'data-runware-message': 'Tüm görsel sağlayıcıları başarısız oldu: openai=missing_env, fal=unauthorized'
  });
  vm.runInContext('result = getImageProviderStatus(null, card);', context);
  assert.equal(context.result.reason, 'provider_unavailable');
  assert.match(context.result.detail, /fal=unauthorized/, 'the real per-provider detail must survive, not just a generic label');
});

test('renderProviderErrorCard prefers the real backend detail message over the generic templated one', () => {
  const context = { window: { location: { protocol: 'https:' } }, result: null };
  vm.createContext(context);
  vm.runInContext(getImageProviderStatusSrc + '\n' + renderProviderErrorCardSrc, context);
  vm.runInContext(`result = renderProviderErrorCard('image', { reason: 'provider_unavailable', detail: 'openai=missing_env, fal=unauthorized (403)' });`, context);
  assert.match(context.result, /openai=missing_env, fal=unauthorized \(403\)/);
});

test('getImageProviderStatus no longer force-matches "network_error" from a bare status string containing "load error"', () => {
  // Regression guard for the confirmed bug: scrubPlaceholderErrorImages used to call
  // getImageProviderStatus("image load error") with no card, which matched /load error/ and
  // ALWAYS returned network_error regardless of the real cause.
  const context = { window: { location: { protocol: 'https:' } }, result: null };
  vm.createContext(context);
  vm.runInContext(getImageProviderStatusSrc, context);
  vm.runInContext(`result = getImageProviderStatus(null, null);`, context);
  assert.notEqual(context.result.reason, 'network_error', 'a null/absent error must not be misclassified as a confirmed network error');
});

test('triggerRunwareImages stashes the backend failure message, not just the short error code, onto the card', () => {
  assert.match(triggerRunwareImagesSrc, /el\.setAttribute\('data-runware-message', result\.message\)/, 'the detailed server message must be preserved for later display, not discarded');
});

test('handleGeneratedImageError shows the real stashed backend message instead of a hardcoded network_error label', () => {
  assert.doesNotMatch(handleGeneratedImageErrorSrc, /\|\|\s*'network_error'/, 'must not silently default the failure reason to a fake specific "network_error" diagnosis');
  assert.match(handleGeneratedImageErrorSrc, /data-runware-message/, 'must read the detailed backend message stashed by triggerRunwareImages');
  assert.match(handleGeneratedImageErrorSrc, /image_display_failed/, 'when no backend reason was ever recorded, the fallback code must be honestly labeled, not falsely specific');
});
