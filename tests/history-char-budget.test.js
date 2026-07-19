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

const fnSrc = extractFunction(/function fz21ApplyHistoryCharBudget/, /\n\s*function generateChatTitleFromMessage/);

function run(historyMsgs, budgetChars) {
  const context = { historyMsgs, budgetChars, result: null };
  vm.createContext(context);
  vm.runInContext(`${fnSrc}\nresult = fz21ApplyHistoryCharBudget(historyMsgs, budgetChars);`, context);
  return context.result;
}

test('leaves history untouched when the total is already under budget', () => {
  const msgs = [{ role: 'user', content: 'selam' }, { role: 'assistant', content: 'naber' }];
  const out = run(msgs.slice(), 1000);
  assert.equal(out.length, 2);
  assert.deepEqual(out, msgs);
});

test('drops the oldest messages first once the budget is exceeded, keeping the most recent', () => {
  const msgs = [
    { role: 'user', content: 'x'.repeat(500) },   // oldest, should be dropped first
    { role: 'assistant', content: 'y'.repeat(500) },
    { role: 'user', content: 'z'.repeat(500) }    // most recent, must survive
  ];
  const out = run(msgs.slice(), 700);
  assert.ok(out.length < 3, 'at least one message must have been dropped');
  assert.equal(out[out.length - 1].content, 'z'.repeat(500), 'the most recent message must never be dropped');
  assert.ok(!out.some(m => m.content === 'x'.repeat(500)), 'the oldest message must be the first to go');
});

test('never drops the last remaining message even if it alone exceeds the budget', () => {
  const msgs = [{ role: 'user', content: 'x'.repeat(50000) }];
  const out = run(msgs.slice(), 100);
  assert.equal(out.length, 1, 'a lone message must survive even over-budget — we trim messages, not their content');
});

test('is a no-op (returns input unchanged) when budget is not a finite number, e.g. Infinity for non-chat tasks', () => {
  const msgs = [{ role: 'user', content: 'x'.repeat(999999) }];
  const out = run(msgs.slice(), Infinity);
  assert.equal(out.length, 1);
  assert.equal(out[0].content.length, 999999, 'vision/pdf tasks must not be truncated by this guard');
});

test('mutates the array in place (shift), matching how the call site uses it without reassignment', () => {
  const context = {
    historyMsgs: [
      { role: 'user', content: 'a'.repeat(1000) },
      { role: 'user', content: 'b'.repeat(10) }
    ],
    result: null
  };
  vm.createContext(context);
  vm.runInContext(`${fnSrc}\nconst ref = historyMsgs; fz21ApplyHistoryCharBudget(historyMsgs, 50); result = (ref === historyMsgs) && historyMsgs.length;`, context);
  assert.equal(context.result, 1, 'same array reference must be mutated, and the oversized old message dropped');
});

test('call site: char budget is only applied for taskType "chat", tighter under Serbest Üslup, and Infinity (no trim) otherwise', () => {
  const wireSrc = extractFunction(/const historyCharBudget = \(taskType === 'chat'\)/, /\n\s*for \(let hm of historyMsgs\)/);
  assert.match(wireSrc, /activeStyleForHistory === 'free' \? 6000 : 12000/, 'free/serbest üslup must use the tighter budget');
  assert.match(wireSrc, /: Infinity/, 'non-chat tasks (pdf/vision) must not be trimmed by this guard');
  assert.match(wireSrc, /fz21ApplyHistoryCharBudget\(historyMsgs, historyCharBudget\)/);
});

test('the char-budget guard runs after historyMsgs is fully assembled but before it is copied into reqMessages', () => {
  const idxGuard = main.search(/fz21ApplyHistoryCharBudget\(historyMsgs, historyCharBudget\)/);
  const idxUnshiftLoop = main.search(/for \(let i = rawHistory\.length - 1;/);
  const idxCopyLoop = main.search(/for \(let hm of historyMsgs\) \{\r?\n\s*let hmClone/);
  assert.ok(idxGuard > -1 && idxUnshiftLoop > -1 && idxCopyLoop > -1, 'all three anchors must exist');
  assert.ok(idxGuard > idxUnshiftLoop, 'guard must run after historyMsgs is populated from rawHistory');
  assert.ok(idxGuard < idxCopyLoop, 'guard must run before historyMsgs is copied into reqMessages');
});
