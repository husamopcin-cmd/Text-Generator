const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const aiChat = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');
const authConfig = fs.readFileSync(path.join(root, 'netlify', 'functions', 'auth-config.js'), 'utf8');
const generateImage = fs.readFileSync(path.join(root, 'netlify', 'functions', 'generate-image.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
const checklist = fs.readFileSync(path.join(root, 'NETLIFY-ENV-KURULUM.md'), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');

const expectedNetlifyKeys = [
  'ANTHROPIC_API_KEY',
  'CEREBRAS_API_KEY',
  'DEEPSEEK_API_KEY',
  'FAL_KEY',
  'FIREWORKS_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'HUGGINGFACE_API_KEY',
  'MISTRAL_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'POLLINATIONS_API_KEY',
  'REPLICATE_API_TOKEN',
  'RUNWARE_API_KEY',
  'STABILITY_API_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'TOGETHER_API_KEY',
  'TURNSTILE_SITE_KEY',
  'XAI_API_KEY'
];

function extractNodeEnvKeys(source) {
  return [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(match => match[1]);
}

test('deployment checklist covers every Netlify provider variable used by code', () => {
  const actual = [...new Set([
    ...extractNodeEnvKeys(aiChat),
    ...extractNodeEnvKeys(authConfig),
    ...extractNodeEnvKeys(generateImage)
  ])].sort();

  assert.deepEqual(actual, expectedNetlifyKeys);
  for (const key of expectedNetlifyKeys) {
    assert.match(checklist, new RegExp('`' + key + '`'));
  }
});

test('Vercel config preserves static assets and maps Netlify function routes', () => {
  assert.deepEqual(vercelConfig.routes, [
    { src: '/.netlify/functions/(.*)', dest: '/api/$1' },
    { handle: 'filesystem' },
    { src: '/.*', dest: '/cinocode_chat.html' }
  ]);
});

test('Vercel upload excludes local secrets and development state', () => {
  for (const entry of ['.env', '.netlify', '.git', 'node_modules', 'users.db']) {
    assert.match(vercelIgnore, new RegExp(`^${entry.replace('.', '\\.')}$`, 'm'));
  }
});

test('Vercel API wrappers cover every Netlify function endpoint', () => {
  for (const name of ['ai-chat', 'auth-config', 'generate-image', 'guest-session', 'image-search', 'web-search']) {
    const source = fs.readFileSync(path.join(root, 'api', `${name}.js`), 'utf8');
    assert.match(source, new RegExp(`\\.\\./netlify/functions/${name}`));
    assert.match(source, /createVercelHandler\(handler\)/);
  }
});

test('Vercel adapter translates a Netlify handler response', async () => {
  const { createVercelHandler } = require('../api/_netlify-adapter');
  const vercelHandler = createVercelHandler(async event => {
    assert.equal(event.httpMethod, 'POST');
    assert.equal(event.headers.origin, 'https://example.com');
    assert.equal(event.body, '{"hello":"world"}');
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  });

  const headers = {};
  const res = {
    statusCode: 0,
    body: '',
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };

  await vercelHandler({
    method: 'POST',
    headers: { Origin: 'https://example.com' },
    query: {},
    url: '/api/test',
    body: { hello: 'world' }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(res.body, '{"ok":true}');
});

test('deployment checklist covers the Render TTS key without embedding values', () => {
  assert.match(server, /os\.environ\.get\('GOOGLE_TTS_KEY'/);
  assert.match(checklist, /`GOOGLE_TTS_KEY`/);
  assert.doesNotMatch(checklist, /(?:API_KEY|API_TOKEN|FAL_KEY|GOOGLE_TTS_KEY)\s*=\s*\S+/);
});

test('Projects menu calls the implemented projects screen', () => {
  assert.match(html, /onclick="closeAttachMenu\(\); openProjectsScreen\(\);"/);
  assert.match(main, /function openProjectsScreen\(\)/);
  assert.doesNotMatch(html, /showProjectsModal\(/);
});

test('cloud provider guidance is concise and avoids false connected claims', () => {
  assert.equal((html.match(/Bulut sağlayıcıları Netlify üzerinden otomatik kullanılır\./g) || []).length, 1);
  assert.doesNotMatch(html, /Bulut API Durumları/);
  assert.doesNotMatch(html, /zaten otomatik bağlı/);
});
