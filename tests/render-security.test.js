const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'cinocode_chat.html');
const html = fs.readFileSync(htmlPath, 'utf8') + (fs.existsSync(path.join(__dirname, '..', 'assets', 'js')) ? fs.readdirSync(path.join(__dirname, '..', 'assets', 'js')).map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', f), 'utf8')).join('\n') : '');

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

test('document picker advertises only formats with real bounded local parsing', () => {
  const input = html.match(/<input type="file" id="docUpload"[^>]+>/)?.[0] || '';
  assert.ok(input, 'document input should exist');
  assert.match(input, /\.zip/);
  assert.match(input, /\.xlsx/, 'xlsx must be advertised now that a real parser exists');
  assert.match(input, /\.pptx/, 'pptx must be advertised now that a real parser exists');
  assert.match(html, /async function extractZipDocument\(file\)/);
  assert.match(html, /async function extractXlsxDocument\(file\)/);
  assert.match(html, /async function extractPptxDocument\(file\)/);
  assert.match(html, /ARCHIVE_ENTRY_MAX_BYTES/);
  assert.match(html, /ARCHIVE_TOTAL_MAX_BYTES/);
  assert.match(html, /ARCHIVE_SECRET_PATH/);
  assert.match(html, /OFFICE_XLSX_MAX_SHEETS/);
  assert.match(html, /OFFICE_PPTX_MAX_SLIDES/);
  assert.match(html, /desteklenmiyor\. PDF, DOCX, XLSX, PPTX, ZIP veya metin\/kod dosyası seçin/);
});

test('NVIDIA key input is masked', () => {
  const input = html.match(/<input type="password" id="nvidiaApiKeyInput"[^>]+>/)?.[0] || '';
  assert.ok(input, 'NVIDIA API key input should be a password field');
  assert.equal((input.match(/\btype=/g) || []).length, 1);
});
