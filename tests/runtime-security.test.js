const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'baslat.bat'), 'utf8');
const checklist = fs.readFileSync(path.join(root, 'NETLIFY-ENV-KURULUM.md'), 'utf8');

test('TTS sends text in a POST body instead of a URL', () => {
  assert.match(main, /fetch\(getTtsUrl\(\),\s*\{\s*method: 'POST'/);
  assert.match(main, /body: JSON\.stringify\(\{ text: cleanText, voice: vName, lang: langCode \}\)/);
  assert.doesNotMatch(main, /getTtsUrl\(\) \+ "\?voice="/);
});

test('local services bind to loopback while Render keeps its required public bind', () => {
  assert.match(server, /'0\.0\.0\.0' if os\.environ\.get\('RENDER'\) else '127\.0\.0\.1'/);
  assert.match(launcher, /OLLAMA_HOST=127\.0\.0\.1:11434/);
  assert.match(launcher, /http\.server 8000 --bind 127\.0\.0\.1/);
  assert.doesNotMatch(launcher, /OLLAMA_ORIGINS=\*/);
  assert.doesNotMatch(launcher, /OLLAMA_HOST=0\.0\.0\.0/);
});

test('TTS applies origin, size and rate limits without wildcard CORS', () => {
  assert.match(server, /MAX_TTS_TEXT_LENGTH = 5000/);
  assert.match(server, /RATE_LIMIT_REQUESTS = 60/);
  assert.match(server, /CINOCODE_ALLOWED_ORIGINS/);
  assert.doesNotMatch(server, /Access-Control-Allow-Origin'\] = '\*'/);
  assert.match(checklist, /`CINOCODE_ALLOWED_ORIGINS`/);
});
