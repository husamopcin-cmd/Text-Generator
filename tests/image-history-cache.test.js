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

const persistResolvedImageUrlSrc = extractFunction(/function persistResolvedImageUrl/, /\n\s*async function triggerRunwareImages/);
const triggerRunwareImagesSrc = extractFunction(/async function triggerRunwareImages/, /\n\s*function buildImageUrl/);
const renderContentWithImagesSignature = main.match(/function renderContentWithImages\([^)]*\)/);

function makeFakeCard(attrs = {}) {
  const store = { ...attrs };
  return {
    getAttribute: (key) => (key in store ? store[key] : null),
  };
}

function runPersist(sessions, el, url) {
  const context = { sessions, saveDatabase: () => { context.saveDatabaseCalled = true; }, saveDatabaseCalled: false, el, url, Number, Array, parseInt };
  vm.createContext(context);
  vm.runInContext(persistResolvedImageUrlSrc + '\npersistResolvedImageUrl(el, url);', context);
  return context;
}

test('renderContentWithImages accepts a messageIndex parameter so a card can be tied back to its history entry', () => {
  assert.ok(renderContentWithImagesSignature, 'renderContentWithImages must exist');
  assert.match(renderContentWithImagesSignature[0], /messageIndex\s*=\s*null/);
});

test('persistResolvedImageUrl rewrites the GENERATE_IMAGE marker in the correct chat/message with the resolved URL', () => {
  const sessions = {
    'chat-1': { messages: [{ role: 'user', content: 'elma çiz' }, { role: 'assistant', content: '[GENERATE_IMAGE: elma]' }] }
  };
  const card = makeFakeCard({ 'data-message-index': '1', 'data-chat-id': 'chat-1' });
  const ctx = runPersist(sessions, card, 'https://cdn.example.com/elma.jpg');
  assert.equal(sessions['chat-1'].messages[1].content, '[GENERATED_IMAGE: https://cdn.example.com/elma.jpg]');
  assert.ok(ctx.saveDatabaseCalled, 'saveDatabase must be called so the rewritten history is actually persisted');
});

test('persistResolvedImageUrl does not touch unrelated messages or chats', () => {
  const sessions = {
    'chat-1': { messages: [{ role: 'assistant', content: '[GENERATE_IMAGE: elma]' }] },
    'chat-2': { messages: [{ role: 'assistant', content: '[GENERATE_IMAGE: elma]' }] }
  };
  const card = makeFakeCard({ 'data-message-index': '0', 'data-chat-id': 'chat-1' });
  runPersist(sessions, card, 'https://cdn.example.com/elma.jpg');
  assert.equal(sessions['chat-1'].messages[0].content, '[GENERATED_IMAGE: https://cdn.example.com/elma.jpg]');
  assert.equal(sessions['chat-2'].messages[0].content, '[GENERATE_IMAGE: elma]', 'a different chat with the same content must remain untouched');
});

test('persistResolvedImageUrl is a safe no-op when the card carries no history reference (live-only render)', () => {
  const sessions = { 'chat-1': { messages: [{ role: 'assistant', content: '[GENERATE_IMAGE: elma]' }] } };
  const card = makeFakeCard({});
  const ctx = runPersist(sessions, card, 'https://cdn.example.com/elma.jpg');
  assert.equal(sessions['chat-1'].messages[0].content, '[GENERATE_IMAGE: elma]');
  assert.equal(ctx.saveDatabaseCalled, false);
});

test('persistResolvedImageUrl is a safe no-op for a stale/out-of-range index or deleted chat', () => {
  const sessions = { 'chat-1': { messages: [{ role: 'assistant', content: '[GENERATE_IMAGE: elma]' }] } };
  const staleIndexCard = makeFakeCard({ 'data-message-index': '9', 'data-chat-id': 'chat-1' });
  runPersist(sessions, staleIndexCard, 'https://cdn.example.com/elma.jpg');
  assert.equal(sessions['chat-1'].messages[0].content, '[GENERATE_IMAGE: elma]');

  const missingChatCard = makeFakeCard({ 'data-message-index': '0', 'data-chat-id': 'deleted-chat' });
  const ctx = runPersist(sessions, missingChatCard, 'https://cdn.example.com/elma.jpg');
  assert.equal(ctx.saveDatabaseCalled, false);
});

test('triggerRunwareImages persists the resolved URL on both the primary success path and the Pollinations fallback path', () => {
  assert.match(triggerRunwareImagesSrc, /persistResolvedImageUrl\(el, result\.url\)/, 'a successful Runware/provider result must be persisted so it is not silently re-generated later');
  assert.match(triggerRunwareImagesSrc, /persistResolvedImageUrl\(el, fallbackUrl\)/, 'the Pollinations fallback URL must also be persisted, otherwise it would regenerate with a new random seed on every history re-render');
});

test('a resolved [GENERATED_IMAGE: url] marker renders directly and never calls triggerRunwareImages again', () => {
  const start = main.search(/resolvedImageUrls\.forEach/);
  assert.notEqual(start, -1, 'the resolved-image render branch must exist');
  const end = main.indexOf('});', start) + 3;
  const resolvedBranchSrc = main.slice(start, end);
  assert.doesNotMatch(resolvedBranchSrc, /triggerRunwareImages/, 'rendering an already-resolved image must be a pure cache hit — no new generation request');
  assert.doesNotMatch(resolvedBranchSrc, /setTimeout/, 'no async generation should be scheduled for a resolved image');
  assert.match(resolvedBranchSrc, /handleGeneratedImageLoad/, 'it must still wire up the normal image-loaded artifact tracking');
});

test('the resolved-image marker is extracted into a placeholder token before markdown parsing runs, and swapped for the real card afterward', () => {
  // Regression guard for a real bug caught via live browser testing: marked.parse() auto-linkifies
  // bare https:// URLs, which corrupted the raw "[GENERATED_IMAGE: url]" bracket syntax (produced a
  // stray "</a>" and no image at all) when the substitution ran on the post-markdown HTML like the
  // GENERATE_IMAGE (pending) branch does. The fix extracts the URL from the raw text BEFORE
  // renderMarkdownSafely() runs, and only injects the final <div> card into the HTML afterward.
  const placeholderIdx = main.search(/safeText = safeText\.replace\(\/\\\[GENERATED_IMAGE:/);
  const markdownIdx = main.search(/let html = renderMarkdownSafely\(safeText\);/);
  const forEachIdx = main.search(/resolvedImageUrls\.forEach/);
  const pendingIdx = main.search(/html = html\.replace\(\/\\\[GENERATE_IMAGE:/);
  assert.ok(placeholderIdx !== -1, 'must extract GENERATED_IMAGE from raw text before markdown parsing');
  assert.ok(placeholderIdx < markdownIdx, 'placeholder extraction must happen before renderMarkdownSafely() so marked.parse() never sees a bare URL inside brackets');
  assert.ok(markdownIdx < forEachIdx, 'the real HTML card must be injected only after markdown+sanitize has already run');
  assert.ok(forEachIdx < pendingIdx, 'resolved images must be substituted before the pending-generation branch runs');
});

test('"tekrar çiz" (retry) still builds a brand-new GENERATE_IMAGE marker instead of reusing a cached resolved URL', () => {
  // Regression guard: the image-history caching feature must not interfere with the intentional
  // "generate again" flow, which must always request a fresh image, not replay an old resolved one.
  const retrySrc = extractFunction(/aynısını\|aynisini\|aynısı\|aynisi\)\$/, /\n\s*if \(wantsVideoGeneration\)/);
  assert.match(retrySrc, /const cleanPrompt = buildCleanMediaPrompt\(imagePromptSource, "image"\)/);
  assert.match(retrySrc, /\[GENERATE_IMAGE: \$\{cleanPrompt\}\]/, 'retry must construct a fresh pending marker, not a [GENERATED_IMAGE: ...] cache reference');
  assert.doesNotMatch(retrySrc, /GENERATED_IMAGE/, 'retry path must never read/write the resolved-image marker directly');
});

test('the live "wantsImageGeneration" send flow pushes the message before rendering so the card can carry a real, stable message index', () => {
  const idx = main.indexOf('chat.messages.push({ role: "assistant", content: `[GENERATE_IMAGE: ${cleanPrompt}]` });');
  assert.notEqual(idx, -1);
  const renderIdx = main.indexOf('typingDiv.innerHTML = renderContentWithImages(`[GENERATE_IMAGE: ${cleanPrompt}]`, true, newImageMsgIndex);');
  assert.notEqual(renderIdx, -1);
  assert.ok(idx < renderIdx, 'push must happen before render so chat.messages.length - 1 is the correct, already-committed index');
});

test('history re-render threads the real array index into renderContentWithImages', () => {
  assert.match(main, /renderContentWithImages\(msg\.content, index === history\.length - 1, index\)/);
});

test('getMessageCopyText copies the plain URL for a resolved image marker instead of the raw bracket syntax', () => {
  const getMessageCopyTextSrc = extractFunction(/function getMessageCopyText/, /\r?\n\r?\n/);
  const context = { result: null, getPublicVideoSubject: () => '' };
  vm.createContext(context);
  vm.runInContext(getMessageCopyTextSrc + "\nresult = getMessageCopyText('[GENERATED_IMAGE: https://cdn.example.com/elma.jpg]');", context);
  assert.equal(context.result, 'https://cdn.example.com/elma.jpg');
});
