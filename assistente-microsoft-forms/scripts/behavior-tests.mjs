import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFile(path.join(projectRoot, relative), 'utf8');
let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

async function testAlternativeInsertionIntegrity() {
  const source = await read('src/content/alternatives/01-base.js');
  const context = {
    cleanText: (value) => String(value ?? '').replace(/\s+/g, ' ').trim(),
    normalizeText: (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(),
    letter: (index) => String.fromCharCode(65 + index),
    stripWrappingParenthesesForOption: (value) => value
  };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.__alt={withAlternativeLetter,withoutAlternativeLetter,alternativeInsertionPreservesOriginal,alternativeStartsWithExpectedLetter};', context);
  const { withAlternativeLetter, withoutAlternativeLetter, alternativeInsertionPreservesOriginal } = context.__alt;
  const cases = [
    [0, '- 25', 'A - 25'], [0, '−25', 'A −25'], [0, '+25', 'A +25'], [0, '±25', 'A ±25'],
    [0, '×25', 'A ×25'], [0, '÷25', 'A ÷25'], [0, '=25', 'A =25'], [0, '<25', 'A <25'],
    [0, '≤25', 'A ≤25'], [0, '/25', 'A /25'], [0, '\\frac{1}{2}', 'A \\frac{1}{2}'],
    [1, '+25', 'B +25'], [2, '(x + 2)', 'C (x + 2)'], [3, '√25', 'D √25']
  ];
  for (const [index, before, expected] of cases) {
    const after = withAlternativeLetter(before, index, false, null);
    assert(after === expected, `Inserção deve preservar “${before}”: obtido “${after}”.`);
    assert(alternativeInsertionPreservesOriginal(before, after, index), `Invariante de preservação falhou para “${before}”.`);
    const rerun = withAlternativeLetter(after, index, false, null);
    assert(rerun === after, `Segunda execução não pode alterar “${after}”: obtido “${rerun}”.`);
  }
  for (const [index, already] of [[0, 'A - 25'], [1, 'B +25'], [2, 'C ± 2'], [3, 'D ÷ 4'], [4, 'E = 0']]) {
    assert(withAlternativeLetter(already, index, false, null) === already, `Prefixo existente deve ser intocável: ${already}.`);
  }
  const stressSymbols = ['−','–','—','+','±','∓','×','÷','=','≠','≈','≡','<','>','≤','≥','/','|','%','√','∛','∞','∑','∏','∫','∂','∆','∈','∉','∪','∩','∧','∨','→','←','↔','°','′','″','!','?','~','^','_','*','·','•','⊕','⊗','⌈','⌊'];
  for (let index = 0; index < 5; index += 1) {
    for (const symbol of stressSymbols) {
      const before = `${symbol}25`;
      const after = withAlternativeLetter(before, index, false, null);
      assert(alternativeInsertionPreservesOriginal(before, after, index), `Símbolo desconhecido não pode ser apagado: “${before}” -> “${after}”.`);
      assert(withAlternativeLetter(after, index, false, null) === after, `Segunda execução deve ser idempotente para “${after}”.`);
    }
  }

  const removalCases = [[0, 'A - 25', '- 25'], [1, 'B +25', '+25'], [2, 'C ± 2', '± 2'], [3, 'D ÷ 4', '÷ 4'], [0, 'A) texto', ') texto']];
  for (const [index, before, expected] of removalCases) {
    assert(withoutAlternativeLetter(before, index, false, null) === expected, `Remoção não pode apagar símbolo em “${before}”.`);
  }
}

async function testMathInsertionIntegrity() {
  const source = await read('src/content/math-audit/03-normalization.js');
  const context = {
    cleanText: (value) => String(value ?? '').replace(/\\s+/g, ' ').trim(),
    normalizeText: (value) => String(value ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim(),
    letter: (index) => String.fromCharCode(65 + index),
    escapeRegExp: (value) => String(value || ''),
    textOf: (el) => String(el?.text || ''),
    document: { activeElement: null, querySelectorAll: () => [] }
  };
  vm.createContext(context);
  vm.runInContext(source + '\\nthis.__math={cleanMathBodyForLetter,mathOptionAlreadyHasLetter};', context);
  const { cleanMathBodyForLetter, mathOptionAlreadyHasLetter } = context.__math;
  const terminalCases = [[0, '25 A'], [0, '64A'], [1, 'x + B'], [2, 'x^2 + C'], [3, '20 D'], [4, 'x + E']];
  for (const [index, value] of terminalCases) assert(cleanMathBodyForLetter(value, index) === value, `Conteúdo terminal legítimo foi alterado em “${value}”.`);
  assert(cleanMathBodyForLetter('A 64', 0) === '64', 'Prefixo A no início deve ser isolado quando o chamador o trata como prefixo.');
  assert(cleanMathBodyForLetter('A A 64', 0) === '64', 'Prefixos A repetidos no início devem ser isolados sem tocar o fim.');
  const fake = (text) => ({ text, getAttribute: () => '', querySelectorAll: () => [] });
  for (const [index, value] of [[0,'A+25'],[0,'A−25'],[1,'B ± 2'],[3,'D÷4'],[4,'E = E']]) assert(mathOptionAlreadyHasLetter(fake(value), null, index), `Caso ambíguo deve ser preservado sem nova edição: “${value}”.`);

  const insertion = await read('src/content/math-audit/05-prefix-editing.js');
  const insertSource = insertion.slice(insertion.indexOf('async function insertMathOptionLetterOnly'));
  assert(!insertSource.includes('replaceMathOptionWithPrefix'), 'Inserção matemática não pode reconstruir a expressão inteira.');
  assert(!insertSource.includes('selectAllMathEditor'), 'Inserção matemática não pode selecionar toda a expressão.');
}

async function testHistoricalMatchingIsStrict() {
  const source = await read('src/content/diagnostic/01-state/start-diagnostic-runtime/01-state-modules/09-report-export-selected-pdfs.js');
  const match = source.match(/function automaticHistoricalStudent\([\s\S]*?\nfunction manualHistoricalEntry/);
  if (!match) throw new Error('Não foi possível localizar automaticHistoricalStudent para teste.');
  const functionSource = match[0].replace(/\nfunction manualHistoricalEntry[\s\S]*$/, '');
  const normalizeName = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const context = {
    state: { matchMode: 'class_roll_name' },
    clean: (value) => String(value ?? '').trim(),
    normName: normalizeName,
    classEquivalent: (a, b) => String(a).toUpperCase() === String(b).toUpperCase(),
    uniqueStudentMatch: (items, predicate) => { const hits = items.filter(predicate); return hits.length === 1 ? hits[0] : null; },
    similarName: (a, b) => { const aa=a.split(' '),bb=b.split(' '); return a===b || (aa[0]===bb[0]&&aa.at(-1)===bb.at(-1)&&Math.abs(a.length-b.length)<5); }
  };
  vm.createContext(context);
  vm.runInContext(functionSource + '\nthis.__match=automaticHistoricalStudent;', context);
  const exact = { className: '6º ANO A', roll: '7', name: 'Ana Maria Silva' };
  const same = { name: 'ANA MARIA SILVA', roll: '7' };
  const different = { name: 'Ana Clara Silva', roll: '7' };
  const batchSame = { classes: [{ name: '6º ANO A', students: [same] }], students: [same] };
  const batchDifferent = { classes: [{ name: '6º ANO A', students: [different] }], students: [different] };
  assert(context.__match(exact, batchSame) === same, 'Nome completo normalizado idêntico deve associar automaticamente.');
  assert(context.__match(exact, batchDifferent) === null, 'Mesmo primeiro/último nome não pode virar vínculo exato.');
}

async function testSpreadsheetLimits() {
  const source = await read('src/content/spreadsheet-adapter/index.js');
  const context = { globalThis: { XLSX: { read(){}, utils: { decode_range: () => ({ s:{r:0,c:0}, e:{r:0,c:0} }) } } } };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.__sheet={GSSF_SPREADSHEET_LIMITS,gssfAssertSpreadsheetFile,gssfAssertZipArchive,gssfAssertWorkbookShape};', context);
  const x = context.__sheet;
  const fakeFile = (size) => ({ size, arrayBuffer(){} });
  x.gssfAssertSpreadsheetFile(fakeFile(x.GSSF_SPREADSHEET_LIMITS.maxFileBytes));
  assert(true, 'Arquivo no limite deve ser aceito.');
  let rejected = false;
  try { x.gssfAssertSpreadsheetFile(fakeFile(x.GSSF_SPREADSHEET_LIMITS.maxFileBytes + 1)); } catch (_) { rejected = true; }
  assert(rejected, 'Arquivo acima do limite deve ser rejeitado antes da leitura.');
  const hugeEntry = { dir:false, name:'xl/sharedStrings.xml', _data:{ uncompressedSize:x.GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes + 1 } };
  rejected = false;
  try { x.gssfAssertZipArchive({ files:{ hugeEntry } }); } catch (_) { rejected = true; }
  assert(rejected, 'Entrada ZIP excessiva deve ser rejeitada antes da descompactação.');
  const lib = { utils:{ decode_range:() => ({s:{r:0,c:0},e:{r:x.GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet,c:0}}) } };
  rejected = false;
  try { x.gssfAssertWorkbookShape({SheetNames:['Reports'],Sheets:{Reports:{'!ref':'A1:A100001'}}}, lib); } catch (_) { rejected = true; }
  assert(rejected, 'Workbook com linhas acima do teto deve ser rejeitado.');
}

async function testPedagogicalStorageBoundary() {
  const printing = await read('src/content/printing/01-state/start-printing-runtime/02-detect-header-and-mapping.js');
  const diagnostic = await read('src/content/diagnostic/01-state/start-diagnostic-runtime/01-state-modules/12-demo-student.js');
  const background = await read('src/background/04-pedagogical-data.js');
  assert(!/indexedDB\.open/.test(printing), 'Impressão não deve abrir IndexedDB no origin do Forms.');
  assert(!/indexedDB\.open/.test(diagnostic), 'Diagnóstico não deve abrir IndexedDB no origin do Forms.');
  assert(/GSSF_PEDAGOGICAL_DATA/.test(background) && /gssfAllowedSender/.test(background), 'Service worker deve validar a origem nas operações pedagógicas.');
}

await testAlternativeInsertionIntegrity();
await testMathInsertionIntegrity();
await testHistoricalMatchingIsStrict();
await testSpreadsheetLimits();
await testPedagogicalStorageBoundary();
console.log(`${passed} verificações comportamentais aprovadas.`);
