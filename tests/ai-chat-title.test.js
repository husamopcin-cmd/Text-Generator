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

const cleanTextForTitleSrc = extractFunction(/function cleanTextForTitle/, /\n\s*const TITLE_LEADING_FILLERS/);
const generateTitleSrc = extractFunction(/function generateChatTitleFromMessage/, /\n\s*function isBadAutoTitle/);
const isBadAutoTitleSrc = extractFunction(/function isBadAutoTitle/, /\n\s*function makeShortTitle/);
const aiTitleSrc = extractFunction(/async function fz19GenerateAiChatTitle/, /\n\s*function ensureChatTitleFromUserInput/);
const ensureFromUserInputSrc = extractFunction(/function ensureChatTitleFromUserInput/, /\n\s*function repairBadChatTitles/);

function makeAiTitleContext(fetchImpl) {
  const fetchCalls = [];
  const context = {
    protectedApiFetch: async (url, options) => {
      fetchCalls.push({ url, options });
      if (fetchImpl) return fetchImpl(url, options);
      throw new TypeError('Failed to fetch');
    },
    setTimeout: (fn, ms) => ({ fn, ms }),
    clearTimeout: () => {},
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    JSON,
    fetchCalls
  };
  vm.createContext(context);
  vm.runInContext(aiTitleSrc, context);
  return context;
}

test('AI title: a clean model answer becomes the chat title, requested cheaply through the existing provider chain', async () => {
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: 'Python Öğrenme Planı' }) }));
  const title = await vm.runInContext("fz19GenerateAiChatTitle('bana python öğrenmek için yol haritası çıkarır mısın')", ctx);
  assert.equal(title, 'Python Öğrenme Planı');

  assert.equal(ctx.fetchCalls.length, 1);
  assert.equal(ctx.fetchCalls[0].url, '/.netlify/functions/ai-chat');
  const body = JSON.parse(ctx.fetchCalls[0].options.body);
  assert.equal(body.taskType, 'chat');
  assert.ok(body.maxTokens <= 32, 'title request must stay tiny/cheap');
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /başlık/i, 'system prompt must actually ask for a title');
});

test('AI title: label prefixes, quotes and multi-line explanations from disobedient models are stripped to the bare title', async () => {
  const messy = 'Başlık: "Kod Hatası Çözümü".\nBu başlık uygundur çünkü kullanıcı bir hatayı soruyor.';
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: messy }) }));
  const title = await vm.runInContext("fz19GenerateAiChatTitle('kodum patlıyor yardım et')", ctx);
  assert.equal(title, 'Kod Hatası Çözümü');
});

test('AI title: every failure mode collapses to null instead of throwing, so the offline fallback always has the last word', async () => {
  const network = makeAiTitleContext(null);
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('selam')", network), null, 'network failure -> null');

  const badStatus = makeAiTitleContext(() => ({ ok: false, status: 502, json: async () => ({}) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('selam')", badStatus), null, 'HTTP error -> null');

  const notOk = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: false, message: 'hata' }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('selam')", notOk), null, 'provider-level failure -> null');

  const tooLong = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: 'x'.repeat(60) }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('selam')", tooLong), null, 'over-long answer -> null');

  const empty = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: 'İyi Başlık' }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('   ')", empty), null, 'empty user message -> null');
  assert.equal(empty.fetchCalls.length, 0, 'empty message must not even hit the network');
});

test('AI title: the request is time-bounded so a hung provider can never stall title generation', () => {
  assert.match(aiTitleSrc, /new AbortController\(\)/);
  assert.match(aiTitleSrc, /setTimeout\(\(\) => controller\.abort\(\), 6000\)/);
  assert.match(aiTitleSrc, /clearTimeout\(timeoutId\)/);
  assert.match(aiTitleSrc, /signal: controller\.signal/);
});

function runEnsureFlow({ aiResult, manualFromStart = false, renameDuringFlight = false }) {
  const context = {
    sessions: { c1: { title: 'Yeni Sohbet', manualTitle: manualFromStart, messages: [] } },
    currentChatId: 'c1',
    saveDatabaseCalls: 0,
    renderSidebarCalls: 0,
    aiCalls: 0,
    saveDatabase() { context.saveDatabaseCalls++; },
    renderSidebar() { context.renderSidebarCalls++; },
    generateChatTitleFromMessage: () => 'Offline Başlık',
    isBadAutoTitle: t => !t || t === 'Yeni Sohbet',
    fz19GenerateAiChatTitle: () => {
      context.aiCalls++;
      if (renameDuringFlight) {
        context.sessions.c1.title = 'Elle Başlık';
        context.sessions.c1.manualTitle = true;
      }
      return Promise.resolve(aiResult);
    }
  };
  vm.createContext(context);
  vm.runInContext(ensureFromUserInputSrc + "\nensureChatTitleFromUserInput('python öğret bana', null);", context);
  return context;
}

test('title flow: the offline title appears instantly, then the AI title silently upgrades it in the background', async () => {
  const ctx = runEnsureFlow({ aiResult: 'Python Yol Haritası' });
  assert.equal(ctx.sessions.c1.title, 'Offline Başlık', 'user must see the offline title immediately, before any network');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.sessions.c1.title, 'Python Yol Haritası', 'AI title must replace the offline one when it lands');
  assert.ok(ctx.saveDatabaseCalls >= 2 && ctx.renderSidebarCalls >= 2, 'both title writes must persist and re-render');
});

test('title flow: when the AI call fails the offline title simply stays — no error, no blank title', async () => {
  const ctx = runEnsureFlow({ aiResult: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.sessions.c1.title, 'Offline Başlık');
});

test('title flow: a manual rename always wins — before the flow, and even mid-flight while the AI request is pending', async () => {
  const manual = runEnsureFlow({ aiResult: 'AI Başlığı', manualFromStart: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manual.sessions.c1.title, 'Yeni Sohbet', 'manualTitle chats must not be touched at all');
  assert.equal(manual.aiCalls, 0, 'no AI request for manually titled chats');

  const raced = runEnsureFlow({ aiResult: 'AI Başlığı', renameDuringFlight: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(raced.sessions.c1.title, 'Elle Başlık', 'a rename during the AI round-trip must not be overwritten');
});

test('title flow: the AI upgrade is fire-and-forget — offline assignment comes first and rejections are swallowed', () => {
  const offlineIdx = ensureFromUserInputSrc.indexOf('generateChatTitleFromMessage(userMessage, attachmentInfo)');
  const aiIdx = ensureFromUserInputSrc.indexOf('fz19GenerateAiChatTitle(userMessage).then');
  assert.ok(offlineIdx !== -1 && aiIdx !== -1 && offlineIdx < aiIdx, 'offline title must be assigned before the AI request fires');
  assert.match(ensureFromUserInputSrc, /\.catch\(\(\) => \{\}\)/, 'a rejected title promise must never surface as an unhandled rejection');
});

test('offline fallback generator and bad-title detector keep their existing contracts', () => {
  const context = { JSON };
  vm.createContext(context);
  vm.runInContext(cleanTextForTitleSrc + '\n' + generateTitleSrc + '\n' + isBadAutoTitleSrc, context);

  assert.equal(
    vm.runInContext("generateChatTitleFromMessage('merhaba python listeleri nasıl sıralanır acaba bilmiyorum', null)", context),
    'Python listeleri nasıl sıralanır acaba',
    'first-5-words fallback with greeting stripped and capitalized'
  );
  assert.equal(vm.runInContext("generateChatTitleFromMessage('', { type: 'application/pdf' })", context), 'Dosya Analizi');
  assert.equal(vm.runInContext("generateChatTitleFromMessage('', null)", context), 'Kısa Sohbet');

  assert.equal(vm.runInContext("isBadAutoTitle('Yeni Sohbet')", context), true);
  assert.equal(vm.runInContext("isBadAutoTitle('Sohbet 12')", context), true);
  assert.equal(vm.runInContext("isBadAutoTitle('abc')", context), true, 'too-short titles are bad');
  assert.equal(vm.runInContext("isBadAutoTitle('Python Hata Çözümü')", context), false);
});

test('AI title input is capped at exactly 500 characters before it reaches the API', async () => {
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: 'Bounded Title' }) }));
  await vm.runInContext(`fz19GenerateAiChatTitle('${'a'.repeat(620)}')`, ctx);
  const body = JSON.parse(ctx.fetchCalls[0].options.body);
  assert.equal(body.messages[1].content.length, 500);
  assert.equal(body.messages[1].content, 'a'.repeat(500));
});

test('AI title rejects a whitespace-only model answer', async () => {
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: '   \n  ' }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('valid input')", ctx), null);
});

test('AI title rejects a one-character model answer', async () => {
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: 'x' }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('valid input')", ctx), null);
});

test('AI title accepts an answer at the exact 48-character limit', async () => {
  const answer = 'a'.repeat(48);
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: answer }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('valid input')", ctx), 'A' + 'a'.repeat(47));
});

test('AI title rejects an answer one character over the 48-character limit', async () => {
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => ({ ok: true, content: 'a'.repeat(49) }) }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('valid input')", ctx), null);
});

test('AI title falls back cleanly when the API returns invalid JSON', async () => {
  const ctx = makeAiTitleContext(() => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }));
  assert.equal(await vm.runInContext("fz19GenerateAiChatTitle('valid input')", ctx), null);
});

test('late AI title results are safe across deletion, chat switching, valid-title races and promise rejection', async () => {
  function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
  }
  function makeFlow(aiFactory) {
    const context = {
      sessions: {
        c1: { title: 'Yeni Sohbet', manualTitle: false, messages: [] },
        c2: { title: 'Second Chat', manualTitle: false, messages: [] }
      },
      currentChatId: 'c1', saveDatabase() {}, renderSidebar() {},
      generateChatTitleFromMessage: () => 'Offline Title',
      isBadAutoTitle: title => !title || title === 'Yeni Sohbet',
      fz19GenerateAiChatTitle: aiFactory
    };
    vm.createContext(context);
    vm.runInContext(ensureFromUserInputSrc + "\nensureChatTitleFromUserInput('hello', null);", context);
    return context;
  }

  const switchedDeferred = deferred();
  const switched = makeFlow(() => switchedDeferred.promise);
  switched.currentChatId = 'c2';
  switchedDeferred.resolve('AI Title');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(switched.sessions.c1.title, 'AI Title');
  assert.equal(switched.sessions.c2.title, 'Second Chat');

  const deletedDeferred = deferred();
  const deleted = makeFlow(() => deletedDeferred.promise);
  delete deleted.sessions.c1;
  deletedDeferred.resolve('AI Title');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deleted.sessions.c1, undefined);

  const racedDeferred = deferred();
  const raced = makeFlow(() => racedDeferred.promise);
  raced.sessions.c1.title = 'Existing Valid Title';
  racedDeferred.resolve('Late AI Title');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(raced.sessions.c1.title, 'Existing Valid Title');

  const rejected = makeFlow(() => Promise.reject(new Error('provider rejected')));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rejected.sessions.c1.title, 'Offline Title');
});
