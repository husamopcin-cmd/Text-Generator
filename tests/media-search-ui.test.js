const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');

test('internet image search is wired through a serverless endpoint and persisted cards', () => {
  assert.match(main, /netlify\/functions\/image-search/);
  assert.match(main, /appendInternetImageResults\(div, msg\)/);
  assert.match(main, /webImages/);
  assert.doesNotMatch(main, /Bu özellik henüz aktif değil/);
});

test('failed image cards offer an internet search recovery action', () => {
  assert.match(main, /function searchSimilarImagesFromPrompt/);
  assert.match(main, /İnternetten Benzerini Bul/);
});

test('smart suggestions preserve the original request context', () => {
  assert.match(main, /function buildContextualSuggestionPrompt/);
  assert.match(main, /submitSmartSuggestion\(text, userText, assistantText\)/);
  assert.match(main, /mediaFailureContext/);
});

test('attachment menu no longer advertises web search as coming soon', () => {
  assert.match(html, /Web destekli sohbet/);
  assert.doesNotMatch(html, /Web Arama yakında aktif/);
  assert.doesNotMatch(html, />Yakında<\/span>/);
});
