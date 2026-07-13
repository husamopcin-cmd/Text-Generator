const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'cinocode_chat.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(functionName) {
  const marker = `function ${functionName}(`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist in cinocode_chat.html`);

  const nextFunction = html.indexOf('\n    function ', start + marker.length);
  assert.notEqual(nextFunction, -1, `${functionName} must be followed by another top-level function`);
  return html.slice(start, nextFunction);
}

function runStyleFunction(functionName, mode) {
  const sandbox = {
    getFeatureValue: (key) => key === 'styleMode' ? mode : '',
    document: { getElementById: () => null }
  };
  const source = `${extractFunction(functionName)}\nresult = ${functionName}();`;
  vm.runInNewContext(source, sandbox, { filename: 'cinocode-style-mode.vm.js' });
  return sandbox.result;
}

test('safe mode keeps its strict language contract', () => {
  const instruction = runStyleFunction('getStyleModeInstruction', 'safe');

  assert.match(instruction, /Guvenli Mod/);
  assert.match(instruction, /KESINLIKLE YASAK/);
  assert.match(instruction, /HER MODDA DEGISMEYEN KESIN SINIRLAR/);
  assert.doesNotMatch(instruction, /Dogal kelime havuzu/);
});

test('balanced mode permits only light banter', () => {
  const instruction = runStyleFunction('getStyleModeInstruction', 'balanced');

  assert.match(instruction, /Dengeli Mod/);
  assert.match(instruction, /hafif saka\/takilma/);
  assert.match(instruction, /agir kufur Serbest Uslup'a ait/);
  assert.doesNotMatch(instruction, /Dogal kelime havuzu/);
});

test('free mode keeps the explicit tone contract and shared safety boundary', () => {
  const instruction = runStyleFunction('getStyleModeInstruction', 'free');

  assert.match(instruction, /Serbest Uslup TAM AKTIF/);
  assert.match(instruction, /GECERSIZDIR/);
  assert.match(instruction, /Dogal kelime havuzu/);
  assert.match(instruction, /HER MODDA DEGISMEYEN KESIN SINIRLAR/);
});

test('free mode bypasses only the extra response-style governor', () => {
  const freeGovernor = runStyleFunction('getResponseStyleGovernorInstruction', 'free');
  const safeGovernor = runStyleFunction('getResponseStyleGovernorInstruction', 'safe');

  assert.equal(freeGovernor, '');
  assert.match(safeGovernor, /CEVAP ST\S+ FRENI/);
});

test('tone stability preserves the free-mode contract', () => {
  const instruction = runStyleFunction('getToneStabilityInstruction', 'free');

  assert.match(instruction, /Serbest Uslup TAM AKTIF/);
  assert.match(instruction, /temel guvenlik sinirlari sabittir/);
});

test('final override is present once and guarded by free mode', () => {
  const authorityStart = html.indexOf("const activeStyleForReminder = getFeatureValue('styleMode')");
  const authorityEnd = html.indexOf('// ===== KR', authorityStart);
  const authorityBlock = html.slice(authorityStart, authorityEnd);
  const overrideCount = (html.match(/SERBEST USLUP FINAL OVERRIDE/g) || []).length;

  assert.notEqual(authorityStart, -1);
  assert.notEqual(authorityEnd, -1);
  assert.equal(overrideCount, 1);
  assert.match(
    authorityBlock,
    /if \(activeStyleForReminder === 'free'\) \{[\s\S]*SERBEST USLUP FINAL OVERRIDE/
  );
});
