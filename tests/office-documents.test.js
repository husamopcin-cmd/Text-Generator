const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');

function extractFunction(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing function start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing function end: ${endPattern}`);
  return tail.slice(0, end);
}

const officeConstants = (main.match(/const OFFICE_[A-Z_]+ = \d+;/g) || []).join('\n');
const decodeSrc = extractFunction(/function decodeOfficeXmlEntities/, /\n\s*function extractPptxSlideText/);
const pptxSrc = extractFunction(/function extractPptxSlideText/, /\n\s*function collectXlsxSections/);
const xlsxCollectSrc = extractFunction(/function collectXlsxSections/, /\n\s*async function extractXlsxDocument/);

test('office XML entity decoding covers named, decimal and hex entities safely', () => {
  const context = { result: null };
  vm.runInNewContext(`${decodeSrc}
result = [
  decodeOfficeXmlEntities('&quot;Sat&#x131;&#351; &amp; Plan&quot;'),
  decodeOfficeXmlEntities('b&#252;y&#252;me &lt;%25&gt;'),
  decodeOfficeXmlEntities('bozuk&#x110000;deger')
];`, context);
  assert.equal(context.result[0], '"Satış & Plan"');
  assert.equal(context.result[1], 'büyüme <%25>');
  assert.equal(context.result[2], 'bozukdeger', 'out-of-range code points must be dropped, not thrown');
});

test('pptx slide extraction joins runs per paragraph and drops empty lines', () => {
  const context = {
    xml: '<p:sld><a:p><a:r><a:t>Q3 Sat&#x131;&#351;</a:t></a:r><a:r><a:t> Raporu</a:t></a:r></a:p>' +
      '<a:p><a:r><a:t>   </a:t></a:r></a:p>' +
      '<a:p><a:r><a:t>Hedef &amp; B&#252;t&#231;e</a:t></a:r></a:p></p:sld>',
    result: null
  };
  vm.runInNewContext(`${decodeSrc}\n${pptxSrc}\nresult = extractPptxSlideText(xml);`, context);
  assert.equal(context.result, 'Q3 Satış Raporu\nHedef & Bütçe');
});

test('xlsx section collector enforces the sheet cap, skips empty sheets and labels sections', () => {
  const sheets = {};
  const names = [];
  for (let i = 1; i <= 25; i++) {
    const name = `Sayfa${i}`;
    names.push(name);
    sheets[name] = { csv: i === 3 ? '   ' : `kolonA,kolonB\n${i},${i * 2}` };
  }
  const context = {
    window: { XLSX: { utils: { sheet_to_csv: (sheet) => sheet.csv } } },
    workbook: { SheetNames: names, Sheets: sheets },
    result: null
  };
  vm.runInNewContext(`${officeConstants}\n${xlsxCollectSrc}\nresult = collectXlsxSections(workbook, 100000);`, context);
  assert.equal(context.result.totalSheets, 25);
  assert.equal(context.result.included, 19, 'cap of 20 sheets minus one empty sheet');
  assert.match(context.result.sections[0], /--- Sayfa: Sayfa1 ---/);
  assert.match(context.result.sections[0], /kolonA,kolonB/);
  assert.ok(!context.result.sections.some(s => s.includes('Sayfa21')), 'sheets beyond the cap must not leak');
});

test('xlsx section collector respects the remaining context budget', () => {
  const context = {
    window: { XLSX: { utils: { sheet_to_csv: (sheet) => sheet.csv } } },
    workbook: {
      SheetNames: ['Uzun', 'Sonraki'],
      Sheets: { Uzun: { csv: 'x'.repeat(500) }, Sonraki: { csv: 'gelmemeli' } }
    },
    result: null
  };
  vm.runInNewContext(`${officeConstants}\n${xlsxCollectSrc}\nresult = collectXlsxSections(workbook, 60);`, context);
  assert.equal(context.result.included, 1, 'collection must stop once the budget is spent');
  assert.ok(context.result.sections[0].length <= 60);
  assert.ok(!context.result.sections.some(s => s.includes('gelmemeli')));
});

test('doc dispatcher routes xlsx and pptx before the generic zip branch', () => {
  const handler = extractFunction(/async function handleDocSelect/, /\n\s*function isPlainTextDocument/);
  const xlsxIndex = handler.indexOf('isXlsxDocument(file)');
  const pptxIndex = handler.indexOf('isPptxDocument(file)');
  const zipIndex = handler.indexOf('isZipDocument(file)');
  assert.ok(xlsxIndex > -1 && pptxIndex > -1 && zipIndex > -1);
  assert.ok(xlsxIndex < zipIndex, 'xlsx must be detected before zip (OOXML files can carry zip MIME types)');
  assert.ok(pptxIndex < zipIndex, 'pptx must be detected before zip (OOXML files can carry zip MIME types)');
});

test('office extractors stay inside the shared document context budget', () => {
  assert.match(main, /async function extractXlsxDocument\(file\)[\s\S]*?getRemainingDocumentContextChars\(\)/);
  assert.match(main, /async function extractPptxDocument\(file\)[\s\S]*?getRemainingDocumentContextChars\(\)/);
  assert.match(main, /sourceType: 'xlsx'/);
  assert.match(main, /sourceType: 'pptx'/);
  assert.match(main, /OFFICE_PPTX_SLIDE_MAX_CHARS/);
  assert.match(main, /OFFICE_XLSX_SHEET_MAX_CHARS/);
});

test('office detectors accept both the OOXML MIME type and the file extension', () => {
  assert.match(main, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(main, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/);
  assert.match(main, /endsWith\('\.xlsx'\)/);
  assert.match(main, /endsWith\('\.pptx'\)/);
});

test('sheetjs CDN is pinned and loaded before main.js', () => {
  const cdnIndex = html.indexOf('xlsx@0.18.5/dist/xlsx.full.min.js');
  const mainIndex = html.indexOf('assets/js/main.js');
  assert.ok(cdnIndex > 0, 'pinned SheetJS script must be present');
  assert.ok(mainIndex > cdnIndex, 'SheetJS must load before main.js');
});
