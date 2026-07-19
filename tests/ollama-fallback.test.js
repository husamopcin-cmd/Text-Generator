const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');

function extractFunction(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing function start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing function end: ${endPattern}`);
  return tail.slice(0, end);
}

const helpersSrc = extractFunction(/function getOllamaUrl\(\)/, /\n\s*async function checkOllamaStatus/);

function makeContext({ storedValues = {}, fetchImpl } = {}) {
  const fetchCalls = [];
  const context = {
    localStorage: { getItem: key => (key in storedValues ? storedValues[key] : null) },
    window: { location: { hostname: 'localhost' } },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      if (fetchImpl) return fetchImpl(url, options);
      throw new TypeError('Failed to fetch');
    },
    setTimeout: (fn, ms) => ({ fn, ms }),
    clearTimeout: () => {},
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    JSON,
    fetchCalls
  };
  vm.createContext(context);
  vm.runInContext(helpersSrc, context);
  return context;
}

test('local Ollama fallback is opt-in: disabled by default, enabled only by the explicit settings value', () => {
  const off = makeContext();
  assert.equal(vm.runInContext('isOllamaFallbackEnabled()', off), false, 'no stored value must mean OFF');

  const explicitOff = makeContext({ storedValues: { ollama_fallback_enabled: '0' } });
  assert.equal(vm.runInContext('isOllamaFallbackEnabled()', explicitOff), false);

  const on = makeContext({ storedValues: { ollama_fallback_enabled: '1' } });
  assert.equal(vm.runInContext('isOllamaFallbackEnabled()', on), true);
});

test('fallback model name is configurable from settings and never hardcoded at the call site', () => {
  const def = makeContext();
  assert.equal(vm.runInContext('getOllamaFallbackModel()', def), 'qwen2.5', 'sensible default when nothing saved');

  const custom = makeContext({ storedValues: { ollama_fallback_model: '  llama3.2  ' } });
  assert.equal(vm.runInContext('getOllamaFallbackModel()', custom), 'llama3.2', 'saved model wins, trimmed');

  const callSrc = extractFunction(/async function fetchOllamaFallbackResponse/, /\n\s*function printChat/);
  assert.match(callSrc, /model: getOllamaFallbackModel\(\)/, 'request body must resolve the model via settings, not a literal');
});

test('fetchOllamaFallbackResponse returns the response when the local server answers OK', async () => {
  const ctx = makeContext({
    storedValues: { ollama_fallback_model: 'llama3.2', ollama_ip: 'http://127.0.0.1:11434' },
    fetchImpl: () => ({ ok: true, body: 'stream' })
  });
  const resp = await vm.runInContext('fetchOllamaFallbackResponse([{ role: "user", content: "selam" }], 512)', ctx);
  assert.ok(resp && resp.ok, 'OK response must be handed back to the caller');
  assert.equal(ctx.fetchCalls.length, 1);
  assert.equal(ctx.fetchCalls[0].url, 'http://127.0.0.1:11434/api/chat');
  const body = JSON.parse(ctx.fetchCalls[0].options.body);
  assert.equal(body.model, 'llama3.2');
  assert.equal(body.stream, true);
  assert.equal(body.options.num_predict, 512);
});

test('fetchOllamaFallbackResponse swallows connection failures and non-OK statuses into null (existing error path preserved)', async () => {
  const refused = makeContext();
  const r1 = await vm.runInContext('fetchOllamaFallbackResponse([], 256)', refused);
  assert.equal(r1, null, 'connection refused must yield null, not a thrown error');

  const notOk = makeContext({ fetchImpl: () => ({ ok: false, status: 404 }) });
  const r2 = await vm.runInContext('fetchOllamaFallbackResponse([], 256)', notOk);
  assert.equal(r2, null, 'non-OK (e.g. model missing) must yield null');
});

test('the connect attempt is time-bounded with a short abort and the timer is cleared once streaming starts', () => {
  const fnSrc = extractFunction(/async function fetchOllamaFallbackResponse/, /\n\s*function printChat/);
  assert.match(fnSrc, /new AbortController\(\)/);
  assert.match(fnSrc, /setTimeout\(\(\) => controller\.abort\(\), 3000\)/, 'Ollama must be given up on quickly when not running');
  assert.match(fnSrc, /clearTimeout\(connectTimeoutId\)/, 'the abort timer must be cleared so a live stream is not killed mid-read');
  assert.match(fnSrc, /signal: controller\.signal/);
});

test('the fallback only fires after the whole cloud chain failed, only for text chat, and only when the toggle is on', () => {
  const gate = main.match(/if \(!response\) \{\s*\r?\n\s*removeImage\(\);[\s\S]*?if \(taskType !== 'vision' && isOllamaFallbackEnabled\(\)\) \{[\s\S]*?fetchOllamaFallbackResponse\(reqMessages, responseMaxTokens\)/);
  assert.ok(gate, 'fetchOllamaFallbackResponse must sit inside the !response block, gated by the toggle and non-vision task type');
  const callCount = (main.match(/fetchOllamaFallbackResponse\(/g) || []).length;
  assert.equal(callCount, 2, 'exactly one call site plus the definition — no stray un-gated calls');
});

test('a successful local answer resets the stream-parser flags to the Ollama format and labels the reply transparently', () => {
  const successBlock = main.match(/if \(localResp\) \{([\s\S]*?)\n\s*\}\s*\r?\n\s*\}/);
  assert.ok(successBlock, 'success branch must exist');
  assert.match(successBlock[1], /isGroq = false; isNvidia = false; isOpenRouter = false; isXai = false/, 'OpenAI-style SSE flags must be cleared so the JSON-lines Ollama parser branch runs');
  assert.match(successBlock[1], /[Yy]erel model \(Ollama/, 'the reply must carry a visible local-model label');
  assert.match(successBlock[1], /escapeHtmlText\(actualModel\)/, 'user-configurable model name must be escaped before entering innerHTML');
});

test('settings panel wires the toggle and model input: present in HTML, default unchecked, loaded and saved symmetrically', () => {
  assert.match(html, /id="ollamaFallbackToggle"/);
  assert.doesNotMatch(html, /id="ollamaFallbackToggle"[^>]*checked/, 'toggle must default to OFF for users without Ollama');
  assert.match(html, /id="ollamaFallbackModelInput"/);
  assert.match(main, /ollamaFallbackToggleEl\.checked = isOllamaFallbackEnabled\(\)/, 'openSettings must load the persisted toggle state');
  assert.match(main, /localStorage\.setItem\('ollama_fallback_enabled', ollamaFallbackToggle\.checked \? '1' : '0'\)/, 'save must persist the toggle');
  assert.match(main, /localStorage\.setItem\('ollama_fallback_model', ollamaFallbackModel\)/, 'save must persist the model name');
});
