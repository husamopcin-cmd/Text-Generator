const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const core = require(path.join(root, 'assets', 'js', 'dil-kocu-core.js'));
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');

test('language coach normalizes preset and custom daily goals', () => {
  assert.equal(core.normalizeGoal(10), 10);
  assert.equal(core.normalizeGoal(20), 20);
  assert.equal(core.normalizeGoal(50), 50);
  assert.equal(core.normalizeGoal('90'), 90);
  assert.equal(core.normalizeGoal(0), 10);
  assert.equal(core.normalizeGoal(900), 500);
});

test('lesson batches remain separate from the daily goal', () => {
  assert.equal(core.getLessonBatchSize(10, 10), 10);
  assert.equal(core.getLessonBatchSize(20, 20), 10);
  assert.equal(core.getLessonBatchSize(50, 50), 15);
  assert.equal(core.getLessonBatchSize(90, 90), 20);
  assert.equal(core.getLessonBatchSize(50, 7), 7);
  assert.equal(core.getLessonBatchSize(50, 0), 0);
});

test('quiz size scales safely without imposing a ten-question ceiling', () => {
  assert.equal(core.getQuizQuestionCount(10), 5);
  assert.equal(core.getQuizQuestionCount(20), 7);
  assert.equal(core.getQuizQuestionCount(50), 17);
  assert.equal(core.getQuizQuestionCount(90), 20);
  assert.equal(core.getQuizQuestionCount(1), 1);
});

test('language coach receives a dedicated bounded response budget', () => {
  assert.equal(core.getResponseTokenBudget({ goal: 10, remaining: 10, quizActive: false }), 4600);
  assert.equal(core.getResponseTokenBudget({ goal: 50, remaining: 50, quizActive: false }), 6000);
  assert.equal(core.getResponseTokenBudget({ goal: 90, remaining: 90, quizActive: false }), 6500);
  assert.equal(core.getResponseTokenBudget({ goal: 50, quizActive: true }), 3610);
});

test('learned markers update progress once and stop exactly at the goal', () => {
  const reply = '[KELİME ÖĞRENİLDİ ✅]\n[KELİME ÖĞRENİLDİ ✅]\n[KELİME ÖĞRENİLDİ ✅]';
  assert.equal(core.countLearnedMarkers(reply), 3);
  assert.equal(core.countLearnedMarkers('Quiz cevabı'), 0);

  assert.deepEqual(core.applyProgressDelta(8, 3, 10), {
    previous: 8,
    count: 10,
    added: 2,
    reachedGoal: true
  });
  assert.equal(core.applyProgressDelta(10, 3, 10).reachedGoal, false);
});

test('browser integration loads the core before main and records only lesson replies', () => {
  assert.ok(html.indexOf('assets/js/dil-kocu-core.js') < html.indexOf('assets/js/main.js'));
  assert.doesNotMatch(main, /Math\.min\(goal, 10\)/);
  assert.doesNotMatch(main, /kelimelerden 5 soru sor/);
  assert.match(main, /function recordDilKocuProgressFromResponse\(responseText\)/);
  assert.match(main, /if \(!isDilKocuPersonaActive\(\) \|\| dilKocuQuizActive\) return 0/);
  assert.match(main, /getDilKocuResponseMaxTokens\(\)/);
});
