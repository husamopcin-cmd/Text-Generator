const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');

test('Gelişmiş Ses Ayarları (voice name editor) is its own collapsed accordion, not buried inline', () => {
  const match = html.match(/<details[^>]*>\s*<summary[^>]*>Gelişmiş Ses Ayarları<\/summary>([\s\S]*?)<\/details>/);
  assert.ok(match, 'voice name editor must be wrapped in its own <details> accordion');
  assert.doesNotMatch(match[0], /\bopen\b/, 'the voice editor accordion must be collapsed by default');
  assert.match(match[1], /id="voiceNameEditorList"/, 'the accordion must actually contain the voice name editor list');
});

test('the settings save button stays visible (sticky) instead of requiring a scroll to the bottom of a long panel', () => {
  const match = html.match(/<button[^>]*onclick="saveSettings\(\)"[^>]*>([^<]*)<\/button>/);
  assert.ok(match, 'save button must exist');
  assert.match(match[0], /position:\s*sticky/, 'save button must be sticky so it stays reachable in the long scrollable settings panel');
  assert.match(match[0], /bottom:/, 'sticky positioning requires an anchor edge');
  assert.match(match[1], /Kaydet/, 'button must still say Kaydet (it already calls closeSettings() internally, i.e. Kaydet ve Çık)');
});

test('Runware, NVIDIA, xAI and Azure API key fields each link to their official key-issuing page', () => {
  const expectedLinks = {
    azureKeyInput: 'https://azure.microsoft.com/en-us/products/ai-services/ai-speech',
    runwareApiKeyInput: 'https://my.runware.ai/keys',
    nvidiaApiKeyInput: 'https://build.nvidia.com',
    xaiApiKeyInput: 'https://console.x.ai'
  };
  for (const [inputId, url] of Object.entries(expectedLinks)) {
    const inputIndex = html.indexOf(`id="${inputId}"`);
    assert.notEqual(inputIndex, -1, `${inputId} must exist`);
    const precedingBlock = html.slice(Math.max(0, inputIndex - 400), inputIndex);
    const linkMatch = precedingBlock.match(/<a[^>]*href="([^"]+)"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>/g) || [];
    assert.ok(linkMatch.length > 0, `${inputId}'s label must contain a help link`);
    assert.ok(linkMatch.some(a => a.includes(url)), `${inputId}'s help link must point to ${url}`);
  }
});
