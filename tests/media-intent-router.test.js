const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');

test('Visual Router: "şimdi" keyword is stripped from media subject', () => {
  assert.match(main, /şimdi\|simdi\|hemen/);
  assert.match(main, /function getMediaCommandSubject/);
});

test('Visual Router: "hemen" keyword is stripped from media subject', () => {
  assert.match(main, /hemen/);
  assert.match(main, /getMediaCommandSubject/);
});

test('Visual Router: "simdi" (Turkish without dot) keyword is stripped', () => {
  assert.match(main, /simdi/);
  assert.match(main, /getMediaCommandSubject/);
});

test('Visual Router: direct image search requests are detected', () => {
  assert.match(main, /function isDirectImageSearchRequest/);
  assert.match(main, /internetten|internette|webden|web üzerinden|web uzerinden|openverse|açık lisans|acik lisans/i);
});

test('Visual Router: generate_ımage typo is corrected to generate_image', () => {
  assert.match(main, /generate_image/);
  assert.doesNotMatch(main, /generate_ımage/);
});

test('Visual Router: negative intent prevents media generation', () => {
  assert.match(main, /function hasMediaNegativeIntent/);
  assert.match(main, /üretme|uretme|oluşturma|olusturma|çizme|cizme|yapma|başlatma|baslatma/i);
});

test('Visual Router: code drawing requests do not trigger image generation', () => {
  assert.match(main, /isImageTechnicalDiscussion/);
  assert.match(main, /function|class|const|let|var|import|export/i);
});
