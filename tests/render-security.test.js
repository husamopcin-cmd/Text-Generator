const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'cinocode_chat.html');
const html = fs.readFileSync(htmlPath, 'utf8');

test('DOMPurify is loaded locally before Markdown rendering libraries', () => {
  const purifierIndex = html.indexOf('vendor/dompurify-3.4.7.min.js');
  const markedIndex = html.indexOf('marked/marked.min.js');
  assert.ok(purifierIndex > 0, 'local DOMPurify script should be present');
  assert.ok(markedIndex > purifierIndex, 'DOMPurify should load before marked');
});

test('assistant Markdown passes through the sanitizer', () => {
  assert.match(html, /function sanitizeRenderedHtml\(html, context\)/);
  assert.match(html, /renderMarkdownSafely\(safeText\)/);
  assert.doesNotMatch(html, /let html = marked\.parse\(safeText\)/);
});

test('user-controlled message fields are escaped before innerHTML assignment', () => {
  assert.match(html, /escapeHtmlText\(msg\.content\)/);
  assert.match(html, /escapeHtmlText\(msg\.documentName \|\| 'Ekli Belge'\)/);
  assert.doesNotMatch(html, /<div>\$\{msg\.content\}<\/div>/);
});

test('code fences escape raw code and constrain language class names', () => {
  assert.match(html, /let highlighted = escapeHtmlText\(code\)/);
  assert.match(html, /replace\(\/\[\^a-z0-9_\+\-\]\/gi, ''\)\.slice\(0, 40\)/);
  assert.match(html, /registerTrustedRenderFragment\(trustedCodeBlock\)/);
});

test('unsupported document types are not advertised by the file picker', () => {
  const input = html.match(/<input type="file" id="docUpload"[^>]+>/)?.[0] || '';
  assert.ok(input, 'document input should exist');
  assert.doesNotMatch(input, /\.(?:zip|xlsx|pptx)/);
  assert.match(html, /desteklenmiyor\. PDF, DOCX veya metin tabanlı bir dosya seçin/);
});

test('NVIDIA key input is masked', () => {
  const input = html.match(/<input type="password" id="nvidiaApiKeyInput"[^>]+>/)?.[0] || '';
  assert.ok(input, 'NVIDIA API key input should be a password field');
  assert.equal((input.match(/\btype=/g) || []).length, 1);
});