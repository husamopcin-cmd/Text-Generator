const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');

function extractFunction(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing function start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing function end: ${endPattern}`);
  return tail.slice(0, end);
}

const source = [
  // Contiguous block: sanitizeAssistantOutput ... getCoreVideoPrompt (covers every helper
  // buildCleanMediaPrompt/getCoreVideoPrompt/getPublicVideoSubject depend on in file order).
  extractFunction(/function sanitizeAssistantOutput/, /\n\s*function parseRequestedVideoDuration/),
  extractFunction(/function enhanceVideoPrompt/, /\n\s*function editMessage/)
].join('\n');

function runInVideoPromptContext(code, videoMode) {
  const context = {
    localStorage: { getItem: (key) => (key === 'video_mode' ? videoMode || null : null) },
    TR_WB_BEFORE: '(?<=^|[^\\p{L}\\p{N}_])',
    TR_WB_AFTER: '(?=$|[^\\p{L}\\p{N}_])',
    result: null
  };
  vm.createContext(context);
  vm.runInContext(source + '\n' + code, context);
  return context.result;
}

test('single-frame video scene prompts avoid narrative/editing jargon that biases diffusion models toward generic movie-set or actor imagery', () => {
  for (const mode of ['fast_clip', 'standard_video', 'cinematic', 'scene_long', 'experimental_long']) {
    const scenePrompt = runInVideoPromptContext(
      `result = enhanceVideoPrompt(buildCleanMediaPrompt(getCoreVideoPrompt("elma çiz, sinematik bir video yap"), "video"), "standard", false) + ", wide angle establishing shot, cinematic 4k, masterpiece";`,
      mode
    );
    assert.doesNotMatch(scenePrompt, /storytelling/i, `mode ${mode} must not inject narrative "storytelling" language into a single still-image prompt`);
    assert.doesNotMatch(scenePrompt, /narrative flow/i, `mode ${mode} must not inject "narrative flow"`);
    assert.doesNotMatch(scenePrompt, /character design/i, `mode ${mode} must not force "character design" onto a non-character subject`);
    assert.doesNotMatch(scenePrompt, /\bfast cuts\b/i, `mode ${mode} must not inject editing-timeline jargon ("cuts") into a single generated frame`);
  }
});

test('the actual prompt subject survives style-suffix assembly for every video mode', () => {
  for (const mode of ['fast_clip', 'standard_video', 'cinematic', 'scene_long', 'experimental_long']) {
    const scenePrompt = runInVideoPromptContext(
      `result = enhanceVideoPrompt(buildCleanMediaPrompt(getCoreVideoPrompt("bir kırmızı bisiklet çiz"), "video"), "standard", false);`,
      mode
    );
    assert.match(scenePrompt.toLowerCase(), /bisiklet/, `mode ${mode} must keep the user's actual subject in the assembled prompt`);
  }
});

test('getPublicVideoSubject and getCoreVideoPrompt strip the renamed style suffixes cleanly (no leaked jargon in UI-facing text)', () => {
  const visual = runInVideoPromptContext(
    `result = buildCleanMediaPrompt(getCoreVideoPrompt("elma çiz, sinematik bir video yap"), "video");`,
    'fast_clip'
  );
  const publicSubject = runInVideoPromptContext(`result = getPublicVideoSubject(${JSON.stringify(visual)});`, 'fast_clip');
  assert.match(publicSubject, /elma/, 'the subject must remain visible to the user');
  assert.doesNotMatch(publicSubject, /punchy energetic composition|bold dynamic motion blur|rich visual detail/i, 'internal style tokens must not leak into the user-facing subject label');
});
