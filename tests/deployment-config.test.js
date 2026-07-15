const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const aiChat = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');
const generateImage = fs.readFileSync(path.join(root, 'netlify', 'functions', 'generate-image.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
const checklist = fs.readFileSync(path.join(root, 'NETLIFY-ENV-KURULUM.md'), 'utf8');

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
  'REPLICATE_API_TOKEN',
  'RUNWARE_API_KEY',
  'STABILITY_API_KEY',
  'TOGETHER_API_KEY',
  'XAI_API_KEY'
];

function extractNodeEnvKeys(source) {
  return [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(match => match[1]);
}

test('deployment checklist covers every Netlify provider variable used by code', () => {
  const actual = [...new Set([
    ...extractNodeEnvKeys(aiChat),
    ...extractNodeEnvKeys(generateImage)
  ])].sort();

  assert.deepEqual(actual, expectedNetlifyKeys);
  for (const key of expectedNetlifyKeys) {
    assert.match(checklist, new RegExp('`' + key + '`'));
  }
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
