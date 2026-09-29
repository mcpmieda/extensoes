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
  for (const [index, already] of [
    [0, 'A - 25'], [1, 'B +25'], [2, 'C ± 2'], [3, 'D ÷ 4'], [4, 'E = 0'],
    [0, 'A+25'], [1, 'B-3'], [0, 'A√25'], [1, 'B∑x'], [2, 'C%5'],
    [3, 'D^2'], [4, 'E·x'], [0, 'A²'], [1, 'B(x+1)']
  ]) {
    assert(withAlternativeLetter(already, index, false, null) === already, `Prefixo ambíguo existente deve ser intocável: ${already}.`);
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

  const removalCases = [
    [0, 'A - 25', 'A - 25'], [1, 'B +25', 'B +25'], [2, 'C ± 2', 'C ± 2'], [3, 'D ÷ 4', 'D ÷ 4'],
    [0, 'A+5', 'A+5'], [1, 'B-3', 'B-3'], [2, 'C√25', 'C√25'], [3, 'D^2', 'D^2'], [4, 'E·x', 'E·x'],
    [0, 'A 25', 'A 25'], [0, 'A (x+1)', 'A (x+1)'], [0, 'A) texto', ') texto'], [0, 'A texto comum', 'texto comum']
  ];
  for (const [index, before, expected] of removalCases) {
    assert(withoutAlternativeLetter(before, index, false, null) === expected, `Remoção não pode apagar símbolo em “${before}”.`);
  }
}

async function testMathInsertionIntegrity() {
  const source = await read('src/content/math-audit/03-normalization.js');
  const context = {
    cleanText: (value) => String(value ?? '').replace(/\s+/g, ' ').trim(),
    normalizeText: (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(),
    letter: (index) => String.fromCharCode(65 + index),
    escapeRegExp: (value) => String(value || ''),
    textOf: (el) => String(el?.text || ''),
    document: { activeElement: null, querySelectorAll: () => [] }
  };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.__math={asciiMathLetters,cleanMathBodyForLetter,mathOptionAlreadyHasLetter};', context);
  const { asciiMathLetters, cleanMathBodyForLetter, mathOptionAlreadyHasLetter } = context.__math;
  const terminalCases = [[0, '25 A'], [0, '64A'], [1, 'x + B'], [2, 'x^2 + C'], [3, '20 D'], [4, 'x + E']];
  for (const [index, value] of terminalCases) assert(cleanMathBodyForLetter(value, index) === value, `Conteúdo terminal legítimo foi alterado em “${value}”.`);
  assert(cleanMathBodyForLetter('A 64', 0) === '64', 'Prefixo A no início deve ser isolado quando o chamador o trata como prefixo.');
  assert(cleanMathBodyForLetter('A A 64', 0) === '64', 'Prefixos A repetidos no início devem ser isolados sem tocar o fim.');
  const fake = (text) => ({ text, getAttribute: () => '', querySelectorAll: () => [] });
  for (const [index, value] of [
    [0,'A+25'],[0,'A−25'],[1,'B ± 2'],[3,'D÷4'],[4,'E = E'],
    [0,'A√25'],[1,'B∑x'],[2,'C%5'],[3,'D^2'],[4,'E·x'],[0,'A²'],[1,'B(x+1)']
  ]) assert(mathOptionAlreadyHasLetter(fake(value), null, index), `Caso matemático ambíguo deve ser preservado sem nova edição: “${value}”.`);

  const mathematicalLetters = [
    ['A', '𝐀𝐴𝑨𝘈𝙰𝓐'], ['B', '𝐁𝐵𝑩𝘉𝙱𝓑'], ['C', '𝐂𝐶𝑪𝘊𝙲𝓒'],
    ['D', '𝐃𝐷𝑫𝘋𝙳𝓓'], ['E', '𝐄𝐸𝑬𝘌𝙴𝓔']
  ];
  for (const [index, [ascii, variants]] of mathematicalLetters.entries()) {
    for (const variant of variants) {
      assert(asciiMathLetters(variant) === ascii, `A conversão Unicode deve ler o caractere completo: ${variant}.`);
      for (const suffix of ['+5', '-2', '√25', '²', '(x+1)']) {
        assert(mathOptionAlreadyHasLetter(fake(variant + suffix), null, index), `Prefixo Unicode não pode gerar inserção duplicada: ${variant + suffix}.`);
      }
    }
  }
  assert(asciiMathLetters('𝑥 + 𝛼 + ação') === '𝑥 + 𝛼 + ação', 'Caracteres fora do mapa não podem ser reescritos.');

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
    uniqueStudentMatch: (items, predicate) => { const hits = items.filter(predicate); return hits.length === 1 ? hits[0] : null; }
  };
  vm.createContext(context);
  vm.runInContext(functionSource + '\nthis.__match=automaticHistoricalStudent;', context);
  const current = { className: '6º ANO A', roll: '7', name: 'João da Silva' };
  const exact = { name: 'JOAO DA SILVA', roll: '7' };
  const differentMiddle = { name: 'João Pedro Silva', roll: '7' };
  const batchExact = { classes: [{ name: '6º ANO A', students: [exact] }], students: [exact] };
  const batchDifferent = { classes: [{ name: '6º ANO A', students: [differentMiddle] }], students: [differentMiddle] };
  assert(context.__match(current, batchExact) === exact, 'Nome completo normalizado + turma + número devem associar automaticamente.');
  assert(context.__match(current, batchDifferent) === null, 'Mesmo número e nome apenas parecido não podem virar vínculo exato.');
  assert(context.__match({ ...current, roll: '' }, batchExact) === null, 'Ausência de número não pode produzir vínculo automático.');
  assert(context.__match(current, { classes: [{ name: '7º ANO A', students: [exact] }], students: [exact] }) === null, 'Transferência de turma não pode virar vínculo exato sem revisão.');
  const duplicate = { ...exact, id: 'duplicado' };
  assert(context.__match(current, { classes: [{ name: '6º ANO A', students: [exact, duplicate] }], students: [exact, duplicate] }) === null, 'Vínculo automático deve ser único; duplicidade é conflito.');
  for (const mode of ['class_roll_name','class_roll','class_name','name']) {
    context.state.matchMode = mode;
    assert(context.__match(current, batchDifferent) === null, `Modo ${mode} não pode relaxar a identidade automática.`);
  }
}

async function testSpreadsheetLimits() {
  const source = await read('src/content/spreadsheet-adapter/index.js');
  const context = { globalThis: { XLSX: { read(){}, utils: { decode_range: () => ({ s:{r:0,c:0}, e:{r:0,c:0} }) } } } };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.__sheet={GSSF_SPREADSHEET_LIMITS,gssfAssertSpreadsheetFile,gssfAssertZipArchive,gssfAssertZipArchiveActual,gssfAssertWorkbookShape,gssfAssertQuestionCount,gssfReadSpreadsheetBuffer};', context);
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
  assert(rejected, 'Entrada ZIP declaradamente excessiva deve ser rejeitada antes da descompactação.');

  const fakeStreamEntry = (name, lengths) => ({
    dir:false, name, _data:{ uncompressedSize:1 },
    internalStream(){
      const handlers={};
      return {
        on(event,handler){handlers[event]=handler;return this;},
        pause(){},
        resume(){for(const length of lengths)handlers.data?.({length});handlers.end?.();}
      };
    }
  });
  rejected = false;
  try {
    await x.gssfAssertZipArchiveActual({ files:{ bomb:fakeStreamEntry('xl/bomb.xml',[x.GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes + 1]) } });
  } catch (_) { rejected = true; }
  assert(rejected, 'Entrada ZIP que expande além do teto real deve ser interrompida em stream.');

  const decode = (ref) => ref === 'A1:A100001'
    ? {s:{r:0,c:0},e:{r:100000,c:0}}
    : {s:{r:0,c:0},e:{r:9,c:0}};
  const lib = { utils:{ decode_range:decode } };
  rejected = false;
  try { x.gssfAssertWorkbookShape({SheetNames:['Reports'],Sheets:{Reports:{'!ref':'A1:A10','!fullref':'A1:A100001'}}}, lib); } catch (_) { rejected = true; }
  assert(rejected, 'Workbook truncado pelo parser ainda deve ser rejeitado quando !fullref revela linhas acima do teto.');

  let readOptions=null;
  const cappedLib = {
    read(_buffer, options){readOptions=options;return {SheetNames:['Reports'],Sheets:{Reports:{'!ref':'A1:A10'}}};},
    utils:{decode_range:decode}
  };
  x.gssfReadSpreadsheetBuffer(new ArrayBuffer(0),cappedLib,{sheetRows:999999});
  assert(readOptions.sheetRows === x.GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet + 1, 'SheetJS deve receber sheetRows limitado, mesmo se o chamador pedir valor maior.');

  x.gssfAssertQuestionCount(x.GSSF_SPREADSHEET_LIMITS.maxQuestions,'teste');
  rejected = false;
  try { x.gssfAssertQuestionCount(x.GSSF_SPREADSHEET_LIMITS.maxQuestions + 1,'teste'); } catch (_) { rejected = true; }
  assert(rejected, 'Quantidade de questões acima do teto deve ser rejeitada antes de loops proporcionais ao maior número de questão.');
}

async function testPedagogicalStorageBoundary() {
  const printing = await read('src/content/printing/01-state/start-printing-runtime/02-detect-header-and-mapping.js');
  const diagnostic = await read('src/content/diagnostic/01-state/start-diagnostic-runtime/01-state-modules/12-demo-student.js');
  const background = await read('src/background/04-pedagogical-data.js');
  const bridge = await read('src/content/pedagogical-storage/index.js');
  assert(!/indexedDB\.open/.test(printing), 'Impressão não deve abrir IndexedDB no origin do Forms.');
  assert(!/indexedDB\.open/.test(diagnostic), 'Diagnóstico não deve abrir IndexedDB no origin do Forms.');
  assert(/GSSF_PEDAGOGICAL_DATA/.test(background) && /gssfAllowedSender/.test(background), 'Service worker deve validar a origem nas operações pedagógicas.');
  assert(/await ensureLotDbMigrated\(\)/.test(printing), 'Leituras e escritas da Impressão devem aguardar a migração.');
  assert(/await ensureDiagnosticDbMigrated\(\)/.test(diagnostic), 'Leituras e escritas do Diagnóstico devem aguardar a migração.');
  assert(/gssfPedagogicalRecordsEqual/.test(bridge), 'Migração deve verificar conteúdo, não apenas presença do ID.');
  assert(/cleanupPending/.test(bridge) && /legacyFingerprint/.test(bridge), 'Migração bloqueada deve registrar limpeza pendente sem recopiá-la.');
  assert(/expectedRevision/.test(background) && /CONFLICT/.test(background), 'Service worker deve rejeitar gravação obsoleta de outra aba.');
}

async function testPedagogicalMigrationConflict() {
  const source = await read('src/content/pedagogical-storage/index.js');
  const markerStore = new Map();
  const context = {
    indexedDB:{},
    location:{hostname:'forms.office.com'},
    GSSF_STORAGE:{
      getItem:(key)=>markerStore.get(key)||null,
      setItem:(key,value)=>markerStore.set(key,value),
      flush:async()=>{}
    }
  };
  vm.createContext(context);
  vm.runInContext(source + `
    this.__equal=gssfPedagogicalRecordsEqual;
    this.__runMigrationTest = async function(deps){
      gssfLegacyDatabaseExists=deps.exists;
      gssfReadLegacyIndexedDb=deps.readLegacy;
      gssfDeleteLegacyIndexedDb=deps.deleteLegacy;
      gssfPedagogicalDataGetAll=deps.getAll;
      gssfPedagogicalDataPut=deps.put;
      return gssfMigrateLegacyPedagogicalDb('printingLots','legacy-db','lots');
    };
  `, context);

  assert(context.__equal(
    {id:'x',a:1,b:{z:2,y:3},_gssfRevision:1},
    {b:{y:3,z:2},a:1,id:'x',_gssfRevision:9}
  ), 'Comparação de migração deve ignorar ordem de propriedades e revisão interna.');

  let puts=0,deletes=0;
  let rejected=false;
  try {
    await context.__runMigrationTest({
      exists:async()=>true,
      readLegacy:async()=>[{id:'lot-1',value:'legado'}],
      getAll:async()=>[{id:'lot-1',value:'novo',_gssfRevision:2}],
      put:async()=>{puts++;},
      deleteLegacy:async()=>{deletes++;return true;}
    });
  } catch (_) { rejected=true; }
  assert(rejected && puts===0 && deletes===0, 'Conflito real de mesmo ID deve preservar os dois lados.');

  markerStore.clear();puts=0;deletes=0;
  const legacy=[{id:'lot-2',name:'Simulado',manualMatches:{}}];
  const extension=[];
  const clone=(value)=>JSON.parse(JSON.stringify(value));
  const deleteResults=[false,true];
  const deps={
    exists:async()=>true,
    readLegacy:async()=>clone(legacy),
    getAll:async()=>clone(extension),
    put:async(_namespace,value)=>{
      puts++;
      const next=clone(value);
      const index=extension.findIndex(item=>item.id===next.id);
      if(index>=0)extension[index]=next;else extension.push(next);
    },
    deleteLegacy:async()=>{deletes++;return deleteResults.shift()??true;}
  };
  await context.__runMigrationTest(deps);
  assert(puts===1 && deletes===1, 'Primeira migração deve copiar uma vez mesmo se a limpeza ficar bloqueada.');
  extension[0].manualMatches.aluno={status:'matched'};
  await context.__runMigrationTest(deps);
  assert(puts===1 && deletes===2, 'Retry de limpeza não pode recopiar o legado sobre dados já editados.');
  const marker=[...markerStore.values()].map(value=>JSON.parse(value)).at(-1);
  assert(marker && marker.cleanupPending===false, 'Marcador deve concluir a limpeza pendente após o desbloqueio.');
}

async function assertDatabaseClearPropagatesFailure(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf('/* @include', start);
  assert(start >= 0 && end > start, `Função de limpeza não localizada: ${name}.`);
  const expectedError = new Error('Falha de armazenamento controlada.');
  let clearCalls = 0;
  const context = {
    GSSF_PEDAGOGICAL_NAMESPACES: { printingLots: 'printingLots', diagnosticBatches: 'diagnosticBatches' },
    PRINT_LOT_DB_NAME: 'legacy-print',
    DIAGNOSTIC_DB_NAME: 'legacy-diagnostic',
    gssfDeleteLegacyIndexedDb: async () => true,
    gssfLegacyDatabaseExists: async () => false,
    gssfPedagogicalDataClear: async () => { clearCalls += 1; throw expectedError; }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + `\nthis.__clear=${name};`, context);
  let actualError = null;
  try { await context.__clear(); } catch (error) { actualError = error; }
  assert(clearCalls === 1 && actualError === expectedError, `${name} deve propagar a falha real do banco.`);
}

async function testAuditHardeningRegressions() {
  const printingParser = await read('src/content/printing/01-state/start-printing-runtime/03-update-lot-form-state.js');
  const printingApi = await read('src/content/printing/01-state/start-printing-runtime/11-save-settings.js');
  const printingIndex = await read('src/content/printing/01-state/index.js');
  const diagnosticIndex = await read('src/content/diagnostic/01-state/index.js');
  const printingMatches = await read('src/content/printing/01-state/start-printing-runtime/05-summarize-matches.js');
  const diagnosticMatches = await read('src/content/diagnostic/01-state/start-diagnostic-runtime/01-state-modules/10-open-match-review.js');

  assert(/colunas incompletas nas questões/.test(printingParser) && /sequência de questões incompleta/.test(printingParser), 'Impressão deve rejeitar EvalBee com questões incompletas ou puladas.');
  assert(!/\blotDbPromise\b/.test(printingApi) && /lotDbMigrationPromise=null/.test(printingApi), 'Destroy da Impressão não pode referenciar o IndexedDB antigo.');
  await assertDatabaseClearPropagatesFailure(printingIndex, 'deletePrintLotDatabase');
  await assertDatabaseClearPropagatesFailure(diagnosticIndex, 'deleteDiagnosticDatabase');
  assert(/cloneLotManualMatches/.test(printingMatches), 'Impressão deve reverter vínculo manual que falhou ao persistir.');
  assert(/cloneDiagnosticManualMatches/.test(diagnosticMatches), 'Diagnóstico deve reverter vínculo manual que falhou ao persistir.');
  assert(!/lotDbDelete\(conflict\.id\)/.test(printingParser), 'Substituição de lote não pode apagar o mesmo ID recém-gravado.');
}

await testAlternativeInsertionIntegrity();
await testMathInsertionIntegrity();
await testHistoricalMatchingIsStrict();
await testSpreadsheetLimits();
await testPedagogicalStorageBoundary();
await testPedagogicalMigrationConflict();
await testAuditHardeningRegressions();
console.log(`${passed} verificações comportamentais aprovadas.`);
