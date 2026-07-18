const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
const ttsUrlSourceMatch = main.match(/(const DEFAULT_TTS_URL[\s\S]*?function getTtsUrl\(\) \{[\s\S]*?\r?\n    \})\r?\n\r?\n    \/\/ Dil Koçu/);
assert.ok(ttsUrlSourceMatch, 'Missing TTS URL resolver source');
const ttsUrlSource = ttsUrlSourceMatch[1];

function resolveTtsUrl({ savedUrl = '', ollamaIp = '', protocol = 'https:', hostname = 'cinocode-final-v4.netlify.app' } = {}) {
  const values = new Map([
    ['tts_url', savedUrl],
    ['ollama_ip', ollamaIp]
  ]);
  const context = {
    URL,
    window: { location: { protocol, hostname } },
    localStorage: { getItem: key => values.get(key) || null },
    result: null
  };
  vm.runInNewContext(`${ttsUrlSource}\nresult = getTtsUrl();`, context);
  return context.result;
}

const characterVoiceIds = [
  'female_gtts',
  'female_edge',
  'female_melis',
  'female_zeynep',
  'male_gtts',
  'male_edge_tolga',
  'male_emre',
  'male_baris'
];

test('frontend forwards every character voice with its own stable server id', () => {
  const mapping = main.match(/const SERVER_TTS_VOICE_IDS = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(mapping, 'Missing character-to-server voice mapping');
  for (const voiceId of characterVoiceIds) {
    assert.match(mapping[1], new RegExp(`${voiceId}: '${voiceId}'`));
  }
  assert.match(main, /const vName = getServerTtsVoiceId\(expectedVoiceId\)/);
  assert.doesNotMatch(main, /expectedVoiceId === 'female_melis'\) vName = 'female_gtts2'/);
  assert.doesNotMatch(main, /expectedVoiceId === 'male_emre'\) vName = 'male_gtts'/);
});

test('server exposes distinct Turkish providers for named character voices', () => {
  const google = server.match(/GOOGLE_VOICE_CONFIG = \{([\s\S]*?)\n\}/);
  assert.ok(google, 'Missing Google voice configuration');
  const expected = {
    female_gtts: 'tr-TR-Wavenet-A',
    female_melis: 'tr-TR-Wavenet-C',
    female_zeynep: 'tr-TR-Wavenet-D',
    male_gtts: 'tr-TR-Wavenet-B',
    male_emre: 'tr-TR-Wavenet-E',
    male_baris: 'tr-TR-Standard-B'
  };
  for (const [voiceId, providerVoice] of Object.entries(expected)) {
    assert.match(google[1], new RegExp(`'${voiceId}': \\{[\\s\\S]*?'name': '${providerVoice}'`));
  }
  assert.match(server, /'female_edge': \('tr-TR-EmelNeural'/);
  assert.match(server, /'male_edge_tolga': \('tr-TR-AhmetNeural'/);
});

test('server keeps character-specific speaking rates and pitch', () => {
  const audio = server.match(/VOICE_AUDIO_CONFIG = \{([\s\S]*?)\n\}/);
  assert.ok(audio, 'Missing voice audio configuration');
  for (const voiceId of ['female_gtts', 'female_melis', 'female_zeynep', 'male_gtts', 'male_emre', 'male_baris']) {
    assert.match(audio[1], new RegExp(`'${voiceId}': \\{`));
  }
  assert.match(main, /audio\.fz19BaseRate = 1\.0/);
  assert.match(main, /let finalRate = window\.fz19GetTtsSpeed\(\)/);
});

test('local development origins include every supported CinoCode port', () => {
  for (const port of [8000, 8888, 8899]) {
    assert.match(server, new RegExp(`'http://localhost:${port}'`));
    assert.match(server, new RegExp(`'http://127\\.0\\.0\\.1:${port}'`));
  }
});

test('named server voices never silently fall back to browser speech', () => {
  const serverFn = main.match(/function speakWithServer\([\s\S]*?\r?\n    \}\r?\n\r?\n    function quickSyncVoiceReadEmojis/);
  assert.ok(serverFn, 'Missing speakWithServer implementation');
  assert.doesNotMatch(serverFn[0], /speakWithLocalVoice\(/);
  assert.match(serverFn[0], /Başka cinsiyette veya cihaz sesine otomatik geçiş yapılmadı/);
});

test('live HTTPS uses the public Render TTS endpoint when no custom override exists', () => {
  assert.match(main, /const DEFAULT_TTS_URL = "https:\/\/cinocode-tts-server\.onrender\.com\/api\/tts"/);
  assert.match(main, /const savedTtsUrl = normalizeTtsUrl\(localStorage\.getItem\("tts_url"\)\)/);
  assert.match(main, /if \(savedTtsUrl\) return savedTtsUrl/);
  assert.match(main, /if \(window\.location\.protocol === "https:"\) return DEFAULT_TTS_URL/);
  assert.match(main, /localStorage\.setItem\('tts_url', normalizedTtsUrl\)/);
  assert.match(main, /if \(!isSecure && !isLocalHttp\) return ""/);
  assert.match(main, /contentType !== 'audio\/mpeg'/);
  assert.match(main, /isValidMp3Header/);
  assert.match(main, /currentTtsAbortController/);
});

test('TTS URL resolution honors a secure override and returns to the default when cleared', () => {
  assert.equal(resolveTtsUrl(), 'https://cinocode-tts-server.onrender.com/api/tts');
  assert.equal(resolveTtsUrl({ savedUrl: 'https://voice.example.com' }), 'https://voice.example.com/api/tts');
  assert.equal(resolveTtsUrl({ savedUrl: '' }), 'https://cinocode-tts-server.onrender.com/api/tts');
});

test('live HTTPS rejects an insecure or invalid custom TTS URL', () => {
  assert.equal(resolveTtsUrl({ savedUrl: 'http://voice.example.com/api/tts' }), 'https://cinocode-tts-server.onrender.com/api/tts');
  assert.equal(resolveTtsUrl({ savedUrl: 'not a url' }), 'https://cinocode-tts-server.onrender.com/api/tts');
  assert.equal(resolveTtsUrl({ ollamaIp: 'http://192.168.1.10:11434' }), 'https://cinocode-tts-server.onrender.com/api/tts');
});
