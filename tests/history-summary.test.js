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
const schedulerSrc = extract(/function fz22ScheduleHistorySummary/, /\n\s*function getDocumentChunkPayload/);

function contextFor(fetchImpl) {
  const calls = [];
  const context = {
    protectedApiFetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); },
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function schedulerContext(generateImpl, sessions = { c1: { messages: [] } }) {
  const context = {
    sessions,
    saveCalls: 0,
    saveDatabase() { context.saveCalls++; },
    fz22GenerateHistorySummary: generateImpl,
    Date, Map, Promise
  };
  vm.createContext(context);
  vm.runInContext('const fz22HistorySummaryPending = new Map();\n' + digestSrc + '\n' + schedulerSrc, context);
  return context;
}

async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
}

test('history scheduler ignores an empty dropped-message batch without calling AI', () => {
  let calls = 0;
  const ctx = schedulerContext(() => { calls++; return Promise.resolve('summary'); });
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [])", ctx);
  assert.equal(calls, 0);
  assert.equal(ctx.saveCalls, 0);
});

test('history scheduler coalesces concurrent requests for the same chat and digest', () => {
  const pending = deferred();
  let calls = 0;
  const ctx = schedulerContext(() => { calls++; return pending.promise; });
  const call = "fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'old'}])";
  vm.runInContext(call, ctx);
  vm.runInContext(call, ctx);
  assert.equal(calls, 1);
  pending.resolve(null);
});

test('a newer history digest supersedes a stale response from an older request', async () => {
  const oldRequest = deferred();
  const newRequest = deferred();
  let calls = 0;
  const ctx = schedulerContext(() => (++calls === 1 ? oldRequest.promise : newRequest.promise));
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'old'}])", ctx);
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'new'}])", ctx);
  oldRequest.resolve('stale summary');
  await flushPromises();
  assert.equal(ctx.saveCalls, 0);
  newRequest.resolve('fresh summary');
  await flushPromises();
  assert.equal(ctx.sessions.c1.historySummary.text, 'fresh summary');
  assert.equal(ctx.saveCalls, 1);
});

test('history scheduler does not persist into a deleted or replaced chat object', async () => {
  const pending = deferred();
  const original = { messages: [] };
  const ctx = schedulerContext(() => pending.promise, { c1: original });
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'old'}])", ctx);
  ctx.sessions.c1 = { messages: [] };
  pending.resolve('orphaned summary');
  await flushPromises();
  assert.equal(ctx.sessions.c1.historySummary, undefined);
  assert.equal(ctx.saveCalls, 0);
});

test('successful history summary persists complete cache metadata', async () => {
  const ctx = schedulerContext(() => Promise.resolve('memory note'));
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'old'}])", ctx);
  await flushPromises();
  const cache = ctx.sessions.c1.historySummary;
  assert.equal(cache.text, 'memory note');
  assert.match(cache.sourceDigest, /^1:/);
  assert.equal(cache.coveredMessageCount, 1);
  assert.equal(typeof cache.updatedAt, 'number');
});

test('history scheduler saves only successful non-empty summaries', async () => {
  const success = schedulerContext(() => Promise.resolve('saved'));
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'one'}])", success);
  await flushPromises();
  assert.equal(success.saveCalls, 1);

  const empty = schedulerContext(() => Promise.resolve(null));
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'one'}])", empty);
  await flushPromises();
  assert.equal(empty.saveCalls, 0);
});

test('history scheduler clears pending state after success, null failure and rejection', async () => {
  for (const factory of [() => Promise.resolve('ok'), () => Promise.resolve(null), () => Promise.reject(new Error('fail'))]) {
    const ctx = schedulerContext(factory);
    vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', [{role:'user',content:'old'}])", ctx);
    await flushPromises();
    assert.equal(vm.runInContext('fz22HistorySummaryPending.size', ctx), 0);
  }
});

test('history scheduler skips a digest that is already cached', () => {
  const dropped = [{ role: 'user', content: 'old' }];
  const digestCtx = schedulerContext(() => Promise.resolve('unused'));
  const digest = vm.runInContext("fz22HistorySummaryDigest([{role:'user',content:'old'}])", digestCtx);
  const chat = { messages: [], historySummary: { text: 'cached', sourceDigest: digest } };
  let calls = 0;
  const ctx = schedulerContext(() => { calls++; return Promise.resolve('new'); }, { c1: chat });
  ctx.dropped = dropped;
  vm.runInContext("fz22ScheduleHistorySummary(sessions.c1, 'c1', dropped)", ctx);
  assert.equal(calls, 0);
});

test('cached history summary is inserted after the primary system prompt and before retained messages', () => {
  const systemPush = main.indexOf('reqMessages.push({ role: "system", content: baseSystemPrompt });');
  const summaryPush = main.indexOf("content: 'OLD CONVERSATION SUMMARY");
  const historyLoop = main.indexOf('for (let hm of historyMsgs)');
  assert.ok(systemPush !== -1 && summaryPush !== -1 && historyLoop !== -1);
  assert.ok(systemPush < summaryPush && summaryPush < historyLoop);
});

test('history summary generator returns null for each upstream and malformed-output failure mode', async () => {
  const cases = [
    () => ({ ok: false, json: async () => ({}) }),
    () => ({ ok: true, json: async () => ({ ok: false, content: 'ignored' }) }),
    () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }),
    () => ({ ok: true, json: async () => ({ ok: true, content: '   ' }) })
  ];
  for (const fetchImpl of cases) {
    const ctx = contextFor(fetchImpl);
    assert.equal(await vm.runInContext("fz22GenerateHistorySummary('', [{role:'user',content:'old'}])", ctx), null);
  }
});
