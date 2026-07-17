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

const helperSource = extractFunction(/const DOC_PROCESSING_TIMEOUT_MS/, /\n\s*async function handleDocSelect/);
const handleDocSelectSource = extractFunction(/async function handleDocSelect/, /\n\s*function isPlainTextDocument/);

function runHelpers(code) {
  const context = { setTimeout, clearTimeout, Promise, Error, result: null };
  vm.createContext(context);
  vm.runInContext(helperSource + '\n' + code, context);
  return context.result;
}

test('withDocTimeout rejects a hanging (never-resolving) operation instead of blocking forever', async () => {
  const context = { setTimeout, clearTimeout, Promise, Error, hangingPromise: new Promise(() => {}) };
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  const raced = vm.runInContext('withDocTimeout(hangingPromise, 40)', context);
  await assert.rejects(raced, (err) => {
    assert.equal(err.message, 'DOC_PROCESSING_TIMEOUT');
    return true;
  });
});

test('withDocTimeout resolves normally when the wrapped operation finishes before the deadline', async () => {
  const context = { setTimeout, clearTimeout, Promise, Error, fastPromise: Promise.resolve('done') };
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  const raced = vm.runInContext('withDocTimeout(fastPromise, 5000)', context);
  assert.equal(await raced, 'done');
});

test('docErrorMessage gives a distinct, honest Turkish timeout message instead of a misleading format-specific error', () => {
  const timeoutMsg = runHelpers(`result = docErrorMessage('rapor.pdf', new Error('DOC_PROCESSING_TIMEOUT'), '"rapor.pdf" PDF olarak okunamadı.');`);
  assert.match(timeoutMsg, /zaman aşımına uğradı/);
  assert.match(timeoutMsg, /rapor\.pdf/);

  const fallbackMsg = runHelpers(`result = docErrorMessage('rapor.pdf', new Error('some other failure'), '"rapor.pdf" PDF olarak okunamadı.');`);
  assert.equal(fallbackMsg, '"rapor.pdf" PDF olarak okunamadı.');
});

test('every document-processing branch in handleDocSelect is timeout-bounded so one hanging file cannot freeze the upload loop forever', () => {
  const branchMarkers = [
    'await withDocTimeout(extractXlsxDocument(file))',
    'await withDocTimeout(extractPptxDocument(file))',
    'await withDocTimeout(extractZipDocument(file))',
    "await withDocTimeout(file.text())",
  ];
  for (const marker of branchMarkers) {
    assert.ok(handleDocSelectSource.includes(marker), `missing timeout wrap: ${marker}`);
  }
  // PDF and DOCX branches wrap a multi-step async IIFE in withDocTimeout rather than a single call.
  assert.match(handleDocSelectSource, /await withDocTimeout\(\(async \(\) => \{[\s\S]*?getDocument/, 'PDF branch must be timeout-wrapped');
  assert.match(handleDocSelectSource, /await withDocTimeout\(\(async \(\) => \{[\s\S]*?mammoth\.extractRawText/, 'DOCX branch must be timeout-wrapped');
});

test('missing Word reader no longer blocks the loop with a native alert()', () => {
  assert.doesNotMatch(handleDocSelectSource, /alert\(/, 'handleDocSelect must not use blocking native alert(); use the non-blocking toast like the rest of the app');
  assert.match(handleDocSelectSource, /Word okuyucu yüklenemedi\. İnternet bağlantısını kontrol edin\./);
});
