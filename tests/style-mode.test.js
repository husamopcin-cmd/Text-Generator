const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'cinocode_chat.html');
const html = fs.readFileSync(htmlPath, 'utf8') + (fs.existsSync(path.join(__dirname, '..', 'assets', 'js')) ? fs.readdirSync(path.join(__dirname, '..', 'assets', 'js')).map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', f), 'utf8')).join('\n') : '');

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

// ─── B4: Free tone state persistence ────────────────────────────────────────

test('B4: normalizeChatMetadata initializes freeToneState with null override and positiveHint', () => {
  assert.match(html, /chat\.freeToneState = \{ override: null, positiveHint: null \}/);
});

test('B4: detectAndApplyFreeTonePreference function is defined', () => {
  assert.match(html, /function detectAndApplyFreeTonePreference/);
});

test('B4: detectAndApplyFreeTonePreference hard-guards on mode !== free', () => {
  const start = html.indexOf('function detectAndApplyFreeTonePreference');
  const end = html.indexOf('\n    }', start) + 6;
  const body = html.slice(start, end);
  assert.match(body, /!== 'free'\) return/);
});

test('B4: detectAndApplyFreeTonePreference recognizes a clean-tone request', () => {
  const start = html.indexOf('function detectAndApplyFreeTonePreference');
  const end = html.indexOf('\n    }', start) + 6;
  const body = html.slice(start, end);
  assert.match(body, /küfür etme|kufur etme/);
});

test('B4: detectAndApplyFreeTonePreference recognizes a return-to-free request', () => {
  const start = html.indexOf('function detectAndApplyFreeTonePreference');
  const end = html.indexOf('\n    }', start) + 6;
  const body = html.slice(start, end);
  assert.match(body, /artık serbest|artik serbest/);
});

test('B4: detectAndApplyFreeTonePreference clears state on explicit free request', () => {
  const start = html.indexOf('function detectAndApplyFreeTonePreference');
  const end = html.indexOf('\n    }', start) + 6;
  const body = html.slice(start, end);
  assert.match(body, /chat\.freeToneState = \{ override: null, positiveHint: null \}/);
});

test('B4: getFreeToneInstruction function is defined', () => {
  assert.match(html, /function getFreeToneInstruction/);
});

test('B4: getFreeToneInstruction hard-guards on mode !== free', () => {
  const start = html.indexOf('function getFreeToneInstruction');
  const end = html.indexOf('\n    }', start) + 6;
  const body = html.slice(start, end);
  assert.match(body, /!== 'free'\) return ''/);
});

test('B4: getFreeToneInstruction returns empty string when override is not set', () => {
  const sandbox = {
    getFeatureValue: () => 'free',
    sessions: { c1: { freeToneState: { override: null, positiveHint: null } } },
    currentChatId: 'c1'
  };
  const source = `${extractFunction('getFreeToneInstruction')}\nresult = getFreeToneInstruction();`;
  vm.runInNewContext(source, sandbox, { filename: 'cinocode-free-tone.vm.js' });
  assert.equal(sandbox.result, '');
});

test('B4: getFreeToneInstruction returns a clean-tone directive when override is clean', () => {
  const sandbox = {
    getFeatureValue: () => 'free',
    sessions: { c1: { freeToneState: { override: 'clean', positiveHint: null } } },
    currentChatId: 'c1'
  };
  const source = `${extractFunction('getFreeToneInstruction')}\nresult = getFreeToneInstruction();`;
  vm.runInNewContext(source, sandbox, { filename: 'cinocode-free-tone.vm.js' });
  assert.match(sandbox.result, /küfür etmeni.*istemedi/);
});

test('B4: getFreeToneInstruction returns empty in safe mode even with clean override set', () => {
  const sandbox = {
    getFeatureValue: () => 'safe',
    sessions: { c1: { freeToneState: { override: 'clean', positiveHint: null } } },
    currentChatId: 'c1'
  };
  const source = `${extractFunction('getFreeToneInstruction')}\nresult = getFreeToneInstruction();`;
  vm.runInNewContext(source, sandbox, { filename: 'cinocode-free-tone.vm.js' });
  assert.equal(sandbox.result, '');
});

test('B4: getStyleModeInstruction free branch calls getFreeToneInstruction defensively', () => {
  const instruction = runStyleFunction('getStyleModeInstruction', 'free');
  assert.match(instruction, /Serbest Uslup TAM AKTIF/);
});

test('B4: sendMessage calls detectAndApplyFreeTonePreference before building the style instruction', () => {
  const callSite = html.indexOf('detectAndApplyFreeTonePreference(text)');
  const styleCallSite = html.indexOf('baseSystemPrompt += getStyleModeInstruction()');
  assert.notEqual(callSite, -1);
  assert.ok(callSite < styleCallSite, 'detectAndApplyFreeTonePreference must run before getStyleModeInstruction is appended');
});

test('B4: safe and balanced modes are untouched by free tone state', () => {
  const safeInstruction = runStyleFunction('getStyleModeInstruction', 'safe');
  const balancedInstruction = runStyleFunction('getStyleModeInstruction', 'balanced');
  assert.doesNotMatch(safeInstruction, /KULLANICI TON TERCİHİ/);
  assert.doesNotMatch(balancedInstruction, /KULLANICI TON TERCİHİ/);
});
