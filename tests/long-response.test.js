const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const chatApiCode = fs.readFileSync(path.join(root, 'assets', 'js', 'modules', 'chat-api.js'), 'utf8');
const aiChat = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');

test('explicit long response requests select the long token budget', () => {
  assert.match(main, /function isLongResponseRequest\(text\)/);
  assert.match(main, /uzun\\s\+\(yanıt\|yanit\|cevap/);
  assert.match(main, /isLongResponseRequest\(text\)\) return RESPONSE_LENGTH_TOKEN_LIMITS\.long/);
});

test('normal and pasted messages are not short-circuited by a local style answer', () => {
  assert.doesNotMatch(main, /isStyleBoundaryQuestion/);
  assert.doesNotMatch(main, /getStyleBoundaryAnswer/);
  assert.doesNotMatch(main, /Serbest Üslup sınırsız mod değildir/);
});

test('client and server allow long buffered responses within the Netlify budget', () => {
  assert.match(chatApiCode, /responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS\.long\) return 58000/);
  assert.match(aiChat, /const FUNCTION_BUDGET_MS = 55000/);
  assert.match(aiChat, /maxTokens >= 6500\) return 52000/);
  assert.match(aiChat, /Math\.min\(getProviderTimeoutMs\(taskType, maxTokens\), remainingBudget\)/);
});

test('real failures use a neutral generation error instead of a policy lecture', () => {
  assert.match(main, /Bu otomatik bir içerik reddi değil/);
  assert.match(main, /class="chat-generation-error"/);
});
