const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const aiChat = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');

function extractFunction(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing function start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing function end: ${endPattern}`);
  return tail.slice(0, end);
}

test('file pickers enable real multi-selection while camera remains single-shot', () => {
  for (const id of ['imageUpload', 'mediaUpload', 'audioUpload', 'docUpload']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*\\bmultiple\\b`));
  }
  assert.doesNotMatch(html, /id="cameraUpload"[^>]*\bmultiple\b/);
});

test('vision queue uses current message images with bounded payloads', () => {
  assert.match(main, /const MAX_VISION_IMAGES = 20/);
  assert.match(main, /const VISION_BASE64_MAX_CHARS = Math\.floor\(3\.5 \* 1024 \* 1024\)/);
  assert.match(main, /const hasAttachments = isVisionTask/);
  assert.doesNotMatch(main, /const hasAttachments = !!selectedImageBase64/);
  assert.match(main, /Ses ve video analizi henüz bağlı değil/);
});

test('provider 403 details remain authorization failures instead of network errors', () => {
  const source = extractFunction(/function classifyImageProviderFailure/, /\n\s*async function generateRunwareImage/);
  const context = { result: null, getAccessControlErrorMessage: () => '' };
  vm.runInNewContext(`${source}\nresult = classifyImageProviderFailure({ details: JSON.stringify([{ provider: 'fal', error: 'provider_error', status: 403 }]) }, 502);`, context);

  assert.equal(context.result.error, 'provider_unauthorized');
  assert.match(context.result.message, /403/);
});

test('smart suggestions do not confuse oyuncu with oyun or assistant prose with video intent', () => {
  const source = extractFunction(/function getSmartSuggestions/, /\n\s*function appendSmartSuggestions/);
  const context = {
    document: { getElementById: (id) => id === 'personaSelect' ? { value: 'kanka' } : null },
    currentMode: 'chat',
    result: null
  };
  vm.runInNewContext(`${source}\nresult = getSmartSuggestions('Kamera oyuncuyla birlikte nefes alır; gerçek video üretemem.', 'Bana şu resmi çiz: yağmurlu sokak');`, context);
  const suggestions = Array.from(context.result);

  assert.ok(suggestions.includes('Promptu profesyonelleştir'));
  assert.ok(!suggestions.includes('Zorluğu artır'));
  assert.ok(!suggestions.includes('Sahne planı yap'));
});

test('vision backend uses current multimodal models', () => {
  assert.doesNotMatch(aiChat, /gemini-2\.0-flash/);
  assert.match(aiChat, /gemini-2\.5-flash/);
  assert.match(aiChat, /meta-llama\/llama-4-scout-17b-16e-instruct/);
  assert.match(aiChat, /google\/gemini-2\.5-flash/);
});
