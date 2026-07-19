const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'main.js'), 'utf8');

function extract(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing end: ${endPattern}`);
  return tail.slice(0, end);
}

const digestSrc = extract(/function fz22HistorySummaryDigest/, /\n\s*async function fz22GenerateHistorySummary/);
const generatorSrc = extract(/async function fz22GenerateHistorySummary/, /\n\s*function fz22ScheduleHistorySummary/);

function contextFor(fetchImpl) {
  const calls = [];
  const context = {
    fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); },
    setTimeout: () => ({}), clearTimeout: () => {},
    AbortController: class { constructor() { this.signal = {}; } abort() {} }, JSON, calls
  };
  vm.createContext(context);
  vm.runInContext(digestSrc + '\n' + generatorSrc, context);
  return context;
}

test('summary digest is stable for the same dropped batch and changes with content', () => {
  const ctx = contextFor(async () => ({ ok: true, json: async () => ({ ok: true, content: 'x' }) }));
  const first = vm.runInContext("fz22HistorySummaryDigest([{role:'user',content:'old'}])", ctx);
  const same = vm.runInContext("fz22HistorySummaryDigest([{role:'user',content:'old'}])", ctx);
  const changed = vm.runInContext("fz22HistorySummaryDigest([{role:'user',content:'new'}])", ctx);
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('summary is a bounded, separate AI request that merges prior memory', async () => {
  const ctx = contextFor(async () => ({ ok: true, json: async () => ({ ok: true, content: 'Kisa hafiza notu.' }) }));
  const summary = await vm.runInContext("fz22GenerateHistorySummary('onceki not', [{role:'user',content:'Python plani'}])", ctx);
  assert.equal(summary, 'Kisa hafiza notu.');
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].url, '/.netlify/functions/ai-chat');
  const body = JSON.parse(ctx.calls[0].options.body);
  assert.equal(body.selectedModel, 'groq');
  assert.ok(body.maxTokens <= 160);
  assert.match(body.messages[1].content, /onceki not/);
  assert.match(body.messages[1].content, /Python plani/);
});

test('summary failures are null and cannot block the chat flow', async () => {
  const network = contextFor(async () => { throw new TypeError('offline'); });
  assert.equal(await vm.runInContext("fz22GenerateHistorySummary('', [{role:'user',content:'x'}])", network), null);
  const badOutput = contextFor(async () => ({ ok: true, json: async () => ({ ok: true, content: 'x'.repeat(2401) }) }));
  assert.equal(await vm.runInContext("fz22GenerateHistorySummary('', [{role:'user',content:'x'}])", badOutput), null);
});

test('helper has timeout and the call site is chat-only after char-budget trimming', () => {
  assert.match(generatorSrc, /setTimeout\(\(\) => controller\.abort\(\), 6000\)/);
  assert.match(generatorSrc, /maxTokens: 160/);
  assert.match(main, /const droppedForHistorySummary = historyBeforeCharBudget\.slice/);
  assert.match(main, /if \(taskType === 'chat'\) \{\s*fz22ScheduleHistorySummary\(chat, currentChatId, droppedForHistorySummary\);/);
  assert.match(main, /chat\.historySummary && chat\.historySummary\.text/);
});
