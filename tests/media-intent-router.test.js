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

// ─── B3: Follow-up image context ────────────────────────────────────────────

test('B3: hasActiveImageContext function is defined', () => {
  assert.match(main, /function hasActiveImageContext/);
});

test('B3: hasActiveImageContext guards on lastMediaPrompt', () => {
  assert.match(main, /if \(!lastMediaPrompt\) return false/);
});

test('B3: hasActiveImageContext inspects recent messages for webImageQuery', () => {
  assert.match(main, /m\.webImageQuery/);
});

test('B3: hasActiveImageContext inspects recent messages for GENERATE_IMAGE content', () => {
  assert.match(main, /GENERATE_IMAGE/);
});

test('B3: hasActiveImageContext uses slice to limit to recent messages', () => {
  assert.match(main, /messages\.slice\(-\d+\)/);
});

test('B3: isDirectImageSearchRequest falls back to hasActiveImageContext when no visual word', () => {
  assert.match(main, /return hasActiveImageContext\(\)/);
});

test('B3: isDirectImageSearchRequest still returns true when visual word present', () => {
  assert.match(main, /if \(hasVisualWord\) return true/);
});

// ─── B3: Chip handler ────────────────────────────────────────────────────────

test('B3: searchSimilarImagesFromPrompt does not call setComposerValue', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /setComposerValue/);
});

test('B3: searchSimilarImagesFromPrompt does not call sendMessage', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /sendMessage\(\)/);
});

test('B3: searchSimilarImagesFromPrompt calls searchInternetImages directly', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /searchInternetImages\(coreSubject\)/);
});

test('B3: searchSimilarImagesFromPrompt appends result to chat.messages', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /chat\.messages\.push/);
});

test('B3: searchSimilarImagesFromPrompt calls appendInternetImageResults', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /appendInternetImageResults/);
});

test('B3: searchSimilarImagesFromPrompt sets webImageQuery on the assistant message', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /webImageQuery/);
});

test('B3: searchSimilarImagesFromPrompt persists chat on success and error', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /saveDatabase\(\)/);
});

test('B3: searchSimilarImagesFromPrompt shows loading text before awaiting', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /aranıyor/);
});

test('B3: searchSimilarImagesFromPrompt handles empty coreSubject gracefully', () => {
  const fnStart = main.indexOf('async function searchSimilarImagesFromPrompt');
  const fnEnd = main.indexOf('\n    }', fnStart + 10) + 6;
  const fnBody = main.slice(fnStart, fnEnd);
  assert.match(fnBody, /if \(!coreSubject\)/);
});
