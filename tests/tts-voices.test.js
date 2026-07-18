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

test('Edge TTS fallback to Google is signaled to the client via a response header instead of staying invisible', () => {
  assert.match(server, /def mp3_response\(audio_data, fallback_voice=None\)/, 'mp3_response must accept which fallback voice (if any) was used');
  assert.match(server, /response\.headers\['X-Cino-TTS-Fallback'\] = fallback_voice/, 'the fallback voice must be exposed as a response header');
  assert.match(server, /mp3_response\(google_tts\(text, fallback_voice, api_key\), fallback_voice=fallback_voice\)/, 'the actual Edge->Google fallback call site must pass the fallback voice through');
  assert.match(server, /Access-Control-Expose-Headers'\] = 'X-Cino-TTS-Fallback'/, 'without Access-Control-Expose-Headers, fetch() in the browser cannot read the custom header at all');
});

test('speakWithServer surfaces a character-switch warning instead of silently playing a different voice', () => {
  const serverFn = main.match(/function speakWithServer\([\s\S]*?\r?\n    \}\r?\n\r?\n    function quickSyncVoiceReadEmojis/);
  assert.ok(serverFn, 'Missing speakWithServer implementation');
  assert.match(serverFn[0], /response\.headers\.get\('X-Cino-TTS-Fallback'\)/, 'must read the fallback signal from the response');
  assert.match(serverFn[0], /getVoiceDisplayName\(expectedVoiceId\)/, 'the warning must name the character the user actually selected');
  assert.match(serverFn[0], /"warning"\)/, 'must be shown as an explicit warning toast, not a console-only note');
});

test('previewVoice exists, uses its own isolated audio element, and never touches the live conversation-read state', () => {
  const start = main.search(/function previewVoice\(voiceId\)/);
  assert.notEqual(start, -1, 'previewVoice must exist so all nine profiles can be sampled from Settings');
  const end = main.indexOf('\n    function populateVoices()', start);
  assert.notEqual(end, -1);
  const fnSrc = main.slice(start, end);
  assert.doesNotMatch(fnSrc, /speechRunId/, 'preview must not interfere with the live conversation-read run id');
  assert.doesNotMatch(fnSrc, /isPlayingTTS/, 'preview must not interfere with the live playback flag');
  assert.doesNotMatch(fnSrc, /ttsQueue/, 'preview must not touch the conversation TTS queue');
  assert.doesNotMatch(fnSrc, /window\.sharedAudio/, 'preview must not reuse (and potentially interrupt) the conversation audio element');
  assert.match(fnSrc, /window\.previewAudio/, 'preview must use a dedicated, isolated audio element');
});

test('previewVoice routes the device voice (Deniz/native) through speechSynthesis directly, never through the server pipeline', () => {
  const start = main.search(/function previewVoice\(voiceId\)/);
  const end = main.indexOf('\n    function populateVoices()', start);
  const fnSrc = main.slice(start, end);
  assert.match(fnSrc, /voiceId === "male_local" \|\| voiceId\.startsWith\("native_"\)/, 'must branch device/native voices away from the server fetch path');
  assert.match(fnSrc, /window\.speechSynthesis\.speak\(utterance\)/, 'device voice preview must use the Web Speech API directly');
});

test('previewVoice for server-side characters reuses the same voice-id resolution and MP3 validation as real playback', () => {
  const start = main.search(/function previewVoice\(voiceId\)/);
  const end = main.indexOf('\n    function populateVoices()', start);
  const fnSrc = main.slice(start, end);
  assert.match(fnSrc, /getServerTtsVoiceId\(voiceId\)/, 'must resolve the same stable server voice id as real speech, not a different lookup');
  assert.match(fnSrc, /isValidMp3Header\(bytes\)/, 'preview audio must be validated the same way as real TTS audio, not trusted blindly');
  assert.match(fnSrc, /AbortController/, 'preview fetch must be cancellable/time-bounded, not able to hang forever');
});

test('every one of the nine voice profile rows in the settings editor gets a working preview button', () => {
  const fnStart = main.search(/function renderVoiceNameEditor\(\)/);
  const fnEnd = main.indexOf('\n    }', main.indexOf('container.innerHTML = html;', fnStart)) + 6;
  const fnSrc = main.slice(fnStart, fnEnd);
  assert.match(fnSrc, /onclick="previewVoice\('\$\{voiceId\}'\)"/, 'each rendered voice row must wire up a preview button for that exact voiceId');
  assert.match(fnSrc, /Sesi önizle/, 'preview button must have a clear Turkish label/title');
});
