import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (relative) => fs.readFile(new URL(relative, root), 'utf8');

// Backend controlado para testar a representação dos registros, não a concorrência
// nativa do IndexedDB nem o comportamento do editor autenticado do Microsoft Forms.
async function testSessionOnlyBoundary() {
  const records = new Map([
    ['legacy', { id: 'legacy', sessionOnly: true, _gssfRevision: 3, questions: { 1: { correct: true } } }]
  ]);
  const revisions = new Map();
  const database = {
    transaction() {
      let pending = 0;
      const transaction = { abort() {}, objectStore: (name) => name === 'recordRevisions' ? revisionStore : store };
      const request = (operation) => {
        const result = {};
        pending += 1;
        queueMicrotask(() => {
          result.result = operation();
          result.onsuccess?.();
          pending -= 1;
          if (!pending) queueMicrotask(() => transaction.oncomplete?.());
        });
        return result;
      };
      const store = {
        get: (id) => request(() => structuredClone(records.get(id))),
        getAll: () => request(() => structuredClone([...records.values()])),
        put: (value) => request(() => { records.set(value.id, structuredClone(value)); return value.id; }),
        delete: (id) => request(() => records.delete(id)),
        clear: () => request(() => records.clear())
      };
      const revisionStore = {
        get: (key) => request(() => revisions.get(key)),
        put: (value, key) => request(() => { revisions.set(key, value); return key; })
      };
      return transaction;
    }
  };
  const context = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } } }, database });
  vm.runInContext(await read('src/background/04-pedagogical-data.js') + `
    gssfOpenPedagogicalDataDb = async () => database;
    this.api = { getAll: gssfPedagogicalDataGetAll, put: gssfPedagogicalDataPut,
      delete: gssfPedagogicalDataDelete, clear: gssfPedagogicalDataClear };
  `, context);
  const [loaded] = await context.api.getAll('printingLots');
  assert.equal(Object.hasOwn(loaded, 'sessionOnly'), false);
  assert.equal(loaded._gssfRevision, 3);
  assert.equal(loaded.questions[1].correct, true);
  assert.equal(records.get('legacy').sessionOnly, true, 'Leitura não deve regravar o banco sem controle de revisão.');

  const draft = { id: 'new', sessionOnly: true, name: 'Registro de teste', questions: { 1: { correct: false } } };
  const revision = await context.api.put('printingLots', draft, null, false);
  assert.equal(revision, 1);
  assert.equal(Object.hasOwn(records.get('new'), 'sessionOnly'), false);
  assert.equal(draft.sessionOnly, true, 'O service worker não deve mutar o objeto recebido.');
  assert.equal(records.get('new').questions[1].correct, false);
  await context.api.put('printingLots', loaded, loaded._gssfRevision, false);
  assert.equal(Object.hasOwn(records.get('legacy'), 'sessionOnly'), false, 'A próxima escrita confirmada deve limpar registros antigos.');
  assert.equal(records.get('legacy')._gssfRevision, 4);

  const stale = { ...records.get('new') };
  await context.api.delete('printingLots', 'new', 1);
  assert.equal(await context.api.put('printingLots', { id: 'new', name: 'recreated' }, null, false), 2);
  await assert.rejects(context.api.put('printingLots', stale, stale._gssfRevision, false),
    (error) => error.code === 'CONFLICT');
  await context.api.clear('printingLots');
  assert.equal(await context.api.put('printingLots', { id: 'new', name: 'after clear' }, null, false), 3);
  await assert.rejects(context.api.put('printingLots', stale, stale._gssfRevision, false),
    (error) => error.code === 'CONFLICT');
  console.log('Issue #2 / 06: revisão não é reutilizada após excluir, recriar e limpar.');

  let reply = { ok: true, revision: 1 };
  const bridge = vm.createContext({ chrome: { runtime: {
    sendMessage(_message, callback) { callback(reply); }
  } } });
  vm.runInContext(await read('src/content/pedagogical-storage/index.js') + `
    this.api = { put: gssfPedagogicalDataPut, equal: gssfPedagogicalRecordsEqual, fingerprint: gssfPedagogicalRecordsFingerprint };
  `, bridge);
  await bridge.api.put('printingLots', draft);
  assert.equal(Object.hasOwn(draft, 'sessionOnly'), false, 'A interface só perde a marca temporária após confirmação.');
  assert.equal(draft._gssfRevision, 1);
  reply = { ok: false, code: 'CONFLICT', error: 'Alterado em outra aba.' };
  const rejectedDraft = { id: 'conflict', sessionOnly: true };
  await assert.rejects(bridge.api.put('printingLots', rejectedDraft), (error) => error.code === 'CONFLICT');
  assert.equal(rejectedDraft.sessionOnly, true);
  assert.equal(Object.hasOwn(rejectedDraft, '_gssfRevision'), false);
  assert.equal(bridge.api.equal({ id: 'legacy', sessionOnly: true }, { id: 'legacy', _gssfRevision: 3 }), true);
  assert.equal(bridge.api.equal({ id: 'legacy', name: 'A' }, { id: 'legacy', name: 'B' }), false);
  assert.equal(bridge.api.equal({ id: 'legacy', child: { sessionOnly: true } }, { id: 'legacy', child: {} }), false);
  assert.equal(bridge.api.fingerprint([{ id: 'legacy', sessionOnly: true }]), '1:cfff087f', 'Não invalidar fingerprints legados já gravados.');

  const legacy = [{ id: 'legacy', sessionOnly: true }];
  const migrated = [];
  const markers = new Map();
  let deletionRequests = 0;
  const migration = vm.createContext({
    legacy,
    indexedDB: {},
    location: { hostname: 'forms.office.com' },
    GSSF_STORAGE: { getItem: (key) => markers.get(key), setItem: (key, value) => markers.set(key, value), flush: async () => {} },
    chrome: { runtime: { sendMessage(message, callback) {
      if (message.action === 'getAll') return callback({ ok: true, values: structuredClone(migrated) });
      const value = { ...message.value, _gssfRevision: 1 };
      delete value.sessionOnly;
      migrated.push(value);
      callback({ ok: true, revision: 1 });
    } } }
  });
  vm.runInContext(await read('src/content/pedagogical-storage/index.js') + `
    gssfLegacyDatabaseExists = async () => true;
    gssfReadLegacyIndexedDb = async () => legacy;
    gssfDeleteLegacyIndexedDb = async () => { deletionRequests += 1; return false; };
    this.migrate = () => gssfMigrateLegacyPedagogicalDb('printingLots', 'legacy', 'lots');
  `, migration);
  await migration.migrate();
  assert.equal(legacy[0].sessionOnly, true, 'Migrar não deve alterar a fotografia usada no fingerprint do legado.');
  assert.equal(Object.hasOwn(migrated[0], 'sessionOnly'), false);
  assert.equal(JSON.parse([...markers.values()][0]).legacyFingerprint, '1:cfff087f');
  assert.equal(JSON.parse([...markers.values()][0]).legacyRetained, true);
  assert.equal(deletionRequests, 0, 'A migração não pode iniciar exclusão nativa pendente.');
  await migration.migrate();
  assert.equal(deletionRequests, 0);
  legacy.push({ id: 'new-from-old-tab' });
  await migration.migrate();
  assert.equal(migrated.length, 2, 'Novos registros do legado devem ser copiados na próxima abertura.');
  assert.equal(deletionRequests, 0);
  legacy[0].name = 'Alterado na aba antiga';
  await assert.rejects(migration.migrate(), /conflito/);
  assert.equal(deletionRequests, 0);
  assert.equal(migrated[0].name, undefined, 'Conflito não deve sobrescrever a cópia no service worker.');
  console.log('Issue #2 / 09: representação persistida, leitura legada, confirmação e falha aprovadas.');
  console.log('Issue #2 / 05: legado retido, reexaminado e nunca excluído automaticamente.');
}

await testSessionOnlyBoundary();

async function testPortableBackupKeys() {
  const canonicalKey = (key) => String(key).replace(/^gssf[_-]/, 'gssf:');
  const stored = [
    ['gssf:storage_migration_v14:forms.office.com', '{"migrated":1}'],
    ['gssf_printingLots_idb_migrated_v1:forms.office.com', '{"count":1}'],
    ['gssf:diagnosticBatches_idb_migrated_v1:forms.office.com', '{"count":1}'],
    ['gssf:pedagogical:card:settings', '{"layout":"A","selectedClass":"6A"}'],
    ['gssf:custom_setting', 'keep']
  ];
  const context = vm.createContext({
    GSSF_STORAGE: {
      NAMESPACE: 'gssf:', canonicalKey,
      isManagedKey: (key) => /^gssf[:_-]/.test(String(key)),
      entries: () => stored, flush: async () => {}
    },
    APP: { name: 'test', version: '15.9.2' },
    exportQuestionHistory: async () => [{ form: 'test', question: 'id:QuestionId_test', content: { prompt: 'Teste' } }],
    questionHistoryRequest: async () => ({ valid: true }),
    location: { href: 'https://forms.office.com/test' },
    document: { title: 'Test' },
    getFormTitle: () => 'Test', formsBankKey: () => 'gssf:forms_bank',
    readFormsBank: () => ({ forms: {} }), answerCountFromQuestions: () => 0,
    parseDateMs: () => 0, storedValueTime: (_value, fallback) => fallback,
    reportNonFatalError: (scope, error) => { throw new Error(`${scope}: ${error}`); }
  });
  vm.runInContext(await read('src/content/backup-observer/01-base.js') +
    await read('src/content/backup-observer/03-restore.js') + `
    this.api = { collect: collectAllSavedData, read: readBackupFile };
  `, context);
  const backup = await context.api.collect();
  assert.equal(backup.questionHistory[0].question, 'id:QuestionId_test');
  assert.equal(backup.backupScope.questionHistory, true);
  const newRestored = await context.api.read({ name: 'new.json', text: async () => JSON.stringify(backup) });
  assert.equal(newRestored.questionHistory.length, 1);
  assert.equal(backup.backupScope.excludedMigrationMarkers, true);
  assert.equal(Object.keys(backup.storage).some((key) => key.includes('migrat')), false);
  assert.equal(backup.storage['gssf:custom_setting'], 'keep');
  assert.equal(JSON.parse(backup.storage['gssf:pedagogical:card:settings']).selectedClass, undefined);

  const oldBackup = { exportedAt: '2026-09-29T00:00:00Z', storage: Object.fromEntries(stored) };
  const restored = await context.api.read({ name: 'old.json', text: async () => JSON.stringify(oldBackup) });
  assert.equal(restored.entries.length, 2);
  assert.deepEqual(Array.from(restored.entries, (entry) => entry.key).sort(),
    ['gssf:custom_setting', 'gssf:pedagogical:card:settings']);
  console.log('Issue #2 / 10: exportação e leitura de backup antigo excluem marcadores de migração.');
}

await testPortableBackupKeys();

async function testStorageFlushFailure() {
  const values = new Map([['gssf:existing', 'old']]);
  let failNextSet = false;
  let failNextRemove = false;
  const backend = {
    getAll: async () => Object.fromEntries(values),
    set: async (entries) => {
      if (failNextSet) { failNextSet = false; throw new Error('set failed'); }
      Object.entries(entries).forEach(([key, value]) => values.set(key, value));
    },
    remove: async (keys) => {
      if (failNextRemove) { failNextRemove = false; throw new Error('remove failed'); }
      keys.forEach((key) => values.delete(key));
    }
  };
  const context = vm.createContext({ console });
  vm.runInContext(await read('src/storage/00-index-start.js') +
    await read('src/storage/03-adapter.js') + `
    global.createAdapter = createGssfStorageAdapter;
    })(this);
  `, context);
  const adapter = context.createAdapter({ backend });
  await adapter.init();

  failNextSet = true;
  adapter.setItem('gssf:first', 'lost');
  adapter.setItem('gssf:second', 'saved');
  await assert.rejects(adapter.flush(), /gravações.*falharam/);
  assert.equal(adapter.getItem('gssf:first'), null);
  assert.equal(adapter.getItem('gssf:second'), 'saved');
  assert.equal(values.has('gssf:first'), false);
  assert.equal(values.get('gssf:second'), 'saved');

  failNextSet = true;
  adapter.setItem('gssf:existing', 'new');
  await assert.rejects(adapter.flush());
  assert.equal(adapter.getItem('gssf:existing'), 'old');
  failNextRemove = true;
  adapter.removeItem('gssf:existing');
  await assert.rejects(adapter.flush());
  assert.equal(adapter.getItem('gssf:existing'), 'old');
  assert.equal(values.get('gssf:existing'), 'old');
  await adapter.flush();
  console.log('Issue #2 / 08: flush propaga falhas anteriores e reverte o cache afetado.');
}

await testStorageFlushFailure();

async function testMixedClassFiles() {
  let created = 0;
  const rows = [
    ['Roll No', 'Name', 'Exam', 'Q1 Options', 'Q1 Key'],
    ['1', 'Aluno A', '6º ANO A', 'A', 'A'],
    ['2', 'Aluno B', '6º ANO B', 'B', 'B']
  ];
  const workbook = { SheetNames: ['Reports'], Sheets: { Reports: {} } };
  const common = {
    XLSX: { utils: { sheet_to_json: () => rows } },
    gssfReadSpreadsheetWorkbook: async () => workbook,
    gssfAssertQuestionCount: () => {},
    clean: (value) => String(value ?? '').trim(),
    normalizeClass: (value) => String(value ?? '').trim(),
    normalizeAnswerOption: (value) => String(value ?? '').trim(),
    normalizeOption: (value) => String(value ?? '').trim(),
    toNumeric: (value) => Number(value) || 0,
    toNum: (value) => Number(value) || 0,
    lotUid: () => { created += 1; return 'id'; },
    uid: () => { created += 1; return 'id'; },
    natural: (a, b) => a.localeCompare(b),
    localDateInputValue: () => '2026-09-29',
    auditLotIdentities: () => ({ blockingRecords: 0 }),
    stableLotId: () => 'lot',
    detectHeaderAndMapping: () => ({ headerRow: 1, mapping: { rollCol: 0, nameCol: 1, classCol: 2 } }),
    state: { columns: { roll: 'Roll No', name: 'Name', exam: 'Exam' } },
    findHeader: (headers, label) => headers.indexOf(label)
  };
  const printing = vm.createContext({ ...common });
  vm.runInContext(await read('src/content/printing/01-state/start-printing-runtime/03-update-lot-form-state.js') + `
    this.api = { parse: parseLotFile, build: buildLot };
  `, printing);
  const diagnostic = vm.createContext({ ...common });
  vm.runInContext(await read('src/content/diagnostic/01-state/start-diagnostic-runtime/01-state-modules/09-report-export-selected-pdfs.js') + `
    this.api = { parse: parseEvalbeeFile, build: buildBatch };
  `, diagnostic);
  const file = { name: 'turma.xlsx' };
  await assert.rejects(printing.api.parse(file), /turmas diferentes/);
  await assert.rejects(diagnostic.api.parse(file), /turmas diferentes/);
  const mixed = { fileName: file.name, className: '6º ANO A', classCode: '6º ANO A', questionCount: 1,
    students: [{ className: '6º ANO A' }, { className: '6º ANO B' }] };
  assert.throws(() => printing.api.build('Teste', '2026-09-29', [mixed]), /turmas diferentes/);
  assert.throws(() => diagnostic.api.build('Teste', '2026-09-29', [mixed]), /turmas diferentes/);
  rows[2][2] = '6º ANO A';
  assert.equal((await printing.api.parse(file)).students.length, 2);
  assert.equal((await diagnostic.api.parse(file)).students.length, 2);
  console.log('Issue #2 / 11: arquivos mistos rejeitados nas duas importações; turma única aceita.');

  const validHeaders = rows[0];
  for (const invalidHeaders of [
    ['Roll No', 'Name', 'Exam', 'Q0 Options', 'Q0 Key'],
    ['Roll No', 'Name', 'Exam', 'Q-1 Options', 'Q1 Options', 'Q1 Key'],
    ['Roll No', 'Name', 'Exam', 'Q1.5 Options', 'Q1 Options', 'Q1 Key'],
    ['Roll No', 'Name', 'Exam', 'Q1 Options', 'Q1 Key', 'Q1 Options'],
    ['Roll No', 'Name', 'Exam', 'Q1 Options', 'Q1 Key', 'Q01 Key']
  ]) {
    rows[0] = invalidHeaders;
    const before = created;
    await assert.rejects(printing.api.parse(file), /inválido|repetido/);
    await assert.rejects(diagnostic.api.parse(file), /inválido|repetido/);
    assert.equal(created, before, 'Cabeçalho inválido deve ser rejeitado antes de criar alunos.');
  }
  rows[0] = validHeaders;
  console.log('Issue #2 / 12: números inválidos e cabeçalhos repetidos rejeitados antes dos alunos.');
}

await testMixedClassFiles();

async function testSpreadsheetBudgets() {
  const library = { utils: {
    decode_range: (ref) => {
      const [rows, columns] = ref.split(',').map(Number);
      return { s: { r: 0, c: 0 }, e: { r: rows - 1, c: columns - 1 } };
    },
    sheet_to_json: () => { throw new Error('Materialização não deveria começar.'); }
  } };
  const context = vm.createContext({ XLSX: library });
  vm.runInContext(await read('src/content/spreadsheet-adapter/index.js') +
    await read('src/content/diagnostic/01-state/start-diagnostic-runtime/01-state-modules/07-report-update-draft-controls.js') + `
    this.api = { shape: gssfAssertWorkbookShape, rows: reportWorksheetRows };
  `, context);
  const workbook = (...sheets) => ({
    SheetNames: sheets.map((_, index) => `Sheet${index}`),
    Sheets: Object.fromEntries(sheets.map((sheet, index) => [`Sheet${index}`, sheet]))
  });
  const sheet = (ref, merges = []) => ({ '!ref': ref, '!merges': merges });
  const merge = (endRow, endColumn) => ({ s: { r: 0, c: 0 }, e: { r: endRow, c: endColumn } });
  assert.throws(() => context.api.shape(workbook(sheet('100000,1024')), library), /limite de células/);
  assert.throws(() => context.api.shape(workbook(sheet('2000,1000'), sheet('2000,1000'), sheet('1,1')), library), /limite agregado/);
  assert.throws(() => context.api.shape(workbook(sheet('1000,100', [merge(999, 99)])), library), /área mesclada grande/);
  assert.throws(() => context.api.shape(workbook(...Array.from({ length: 5 }, () => sheet('500,100', [merge(499, 99)]))), library), /limite agregado de células mescladas/);
  assert.throws(() => context.api.shape(workbook(sheet('10,10', Array(10001).fill(merge(0, 0)))), library), /áreas mescladas demais/);
  assert.throws(() => context.api.shape(workbook(sheet('10,10', [merge(100000, 1)])), library), /área mesclada inválida/);
  assert.throws(() => context.api.rows(sheet('10,10', [merge(100000, 1)])), /área mesclada inválida/);
  assert.equal(context.api.shape(workbook(sheet('1000,1000')), library).SheetNames.length, 1);
  console.log('Issue #2 / 13: orçamentos de células e mesclagens validados antes da materialização.');
}

await testSpreadsheetBudgets();

async function testFormsBankAcrossTabs() {
  const listeners = [];
  const storage = new Map();
  let messageListener;
  const serviceChrome = {
    runtime: { onMessage: { addListener(listener) { messageListener = listener; } } },
    storage: { local: {
      get: async (key) => ({ [key]: storage.get(key) }),
      set: async (entries) => {
        for (const [key, value] of Object.entries(entries)) {
          const oldValue = storage.get(key);
          storage.set(key, value);
          listeners.forEach(listener => listener({ [key]: { oldValue, newValue: value } }, 'local'));
        }
      }
    } }
  };
  const worker = vm.createContext({ chrome: serviceChrome, gssfAllowedSender: () => true });
  vm.runInContext(await read('src/background/05-forms-bank.js'), worker);

  const tab = async () => {
    const cache = new Map();
    const confirmed = new Map();
    let queue = Promise.resolve();
    const adapter = {
      canonicalKey: key => String(key).replace(/^gssf_/, 'gssf:'),
      getItem: key => cache.get(adapter.canonicalKey(key)) ?? null,
      setCachedItem: (key, value, isConfirmed = false) => {
        const canonical = adapter.canonicalKey(key);
        if (value == null) cache.delete(canonical); else cache.set(canonical, value);
        if (isConfirmed) {
          if (value == null) confirmed.delete(canonical); else confirmed.set(canonical, value);
        }
      },
      restoreConfirmedItem: key => {
        const canonical = adapter.canonicalKey(key);
        if (confirmed.has(canonical)) cache.set(canonical, confirmed.get(canonical));
        else cache.delete(canonical);
      },
      trackWrite: operation => { queue = queue.then(operation); return queue; },
      flush: () => queue
    };
    const chrome = {
      runtime: { sendMessage: (message, callback) => messageListener(message, {}, callback), lastError: null },
      storage: { onChanged: { addListener: listener => listeners.push(listener) } }
    };
    const context = vm.createContext({ chrome, GSSF_STORAGE: adapter,
      window: { dispatchEvent() {} }, CustomEvent: class { constructor() {} },
      reportNonFatalError: (_scope, error) => { throw error; } });
    vm.runInContext(await read('src/content/audit-bank/04-forms-bank.js') + `
      this.api = { read: readFormsBank, save: saveFormsBank };
    `, context);
    return { api: context.api, adapter };
  };
  const first = await tab();
  const second = await tab();
  const a = first.api.read();
  a.forms.A = { title: 'A', questions: { 1: { originalAnswer: 'A' }, 2: {} } };
  const b = second.api.read();
  b.forms.B = { title: 'B', questions: { 1: { originalAnswer: 'B' } } };
  first.api.save(a);
  second.api.save(b);
  await Promise.all([first.adapter.flush(), second.adapter.flush()]);
  const key = 'gssf:forms_bank_v1';
  let saved = JSON.parse(storage.get(key));
  assert.deepEqual(Object.keys(saved.forms).sort(), ['A', 'B']);
  assert.deepEqual(Object.keys(first.api.read().forms).sort(), ['A', 'B']);
  assert.deepEqual(Object.keys(second.api.read().forms).sort(), ['A', 'B']);

  const left = first.api.read();
  const right = second.api.read();
  left.forms.A.questions[1].manualAnswer = 'C';
  right.forms.A.questions[2].importedAnswer = 'D';
  first.api.save(left);
  second.api.save(right);
  await Promise.all([first.adapter.flush(), second.adapter.flush()]);
  saved = JSON.parse(storage.get(key));
  assert.equal(saved.forms.A.questions[1].manualAnswer, 'C');
  assert.equal(saved.forms.A.questions[2].importedAnswer, 'D');
  assert.equal(saved.forms.A.answerCount, 2);
  const sameQuestionLeft = first.api.read();
  const sameQuestionRight = second.api.read();
  sameQuestionLeft.forms.A.questions[1].manualAnswer = 'E';
  sameQuestionRight.forms.A.questions[1].importedAnswer = 'B';
  first.api.save(sameQuestionLeft);
  second.api.save(sameQuestionRight);
  await Promise.all([first.adapter.flush(), second.adapter.flush()]);
  saved = JSON.parse(storage.get(key));
  assert.equal(saved.forms.A.questions[1].manualAnswer, 'E');
  assert.equal(saved.forms.A.questions[1].importedAnswer, 'B');
  assert.equal(saved.forms.A.questions[1].effectiveAnswer, 'E');
  console.log('Issue #2 / 07: gravações de duas abas mescladas pelo service worker e caches sincronizados.');
}

await testFormsBankAcrossTabs();

async function testRichTextPrefixInsertion() {
  class FakeEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  const context = vm.createContext({
    InputEvent: FakeEvent, FocusEvent: FakeEvent, KeyboardEvent: FakeEvent, Event: FakeEvent,
    document: { createTextNode: value => ({ textContent: value, html: value }) },
    reportNonFatalError: (_scope, error) => { throw error; }
  });
  vm.runInContext(await read('src/content/forms-dom/03-editing.js') + `
    this.write = setTextLikeUser;
  `, context);
  const rich = (first, element, last) => {
    const original = [
      { textContent: first, html: first },
      { textContent: element.text, html: `<${element.tag}>${element.text}</${element.tag}>` },
      { textContent: last, html: last }
    ];
    return {
      isContentEditable: true,
      children: [...original],
      get firstChild() { return this.children[0] || null; },
      get innerHTML() { return this.children.map(node => node.html).join(''); },
      get textContent() { return this.children.map(node => node.textContent).join(''); },
      focus() {}, dispatchEvent() { return true; },
      querySelector: () => element.tag,
      insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
    };
  };
  for (const [field, expected] of [
    [rich('x', { tag: 'sup', text: '2' }, ''), 'A x2'],
    [rich('H', { tag: 'sub', text: '2' }, 'O'), 'A H2O'],
    [rich('', { tag: 'strong', text: 'texto' }, ''), 'A texto']
  ]) {
    const originalNodes = field.children.slice();
    const originalHtml = field.innerHTML;
    assert.equal(context.write(field, expected), true);
    assert.equal(field.textContent, expected);
    assert.equal(field.innerHTML, `A ${originalHtml}`);
    assert.equal(field.children.slice(1).every((node, index) => node === originalNodes[index]), true);
  }
  const unsafe = rich('x', { tag: 'sup', text: '2' }, '');
  assert.equal(context.write(unsafe, 'A x3'), false);
  assert.equal(unsafe.innerHTML, 'x<sup>2</sup>');
  console.log('Issue #2 / 01: prefixo em campo rico preserva sup, sub e formatação.');
}

await testRichTextPrefixInsertion();

async function testCompleteMathBodyVerification() {
  const context = vm.createContext({
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    normalizeText: value => String(value ?? '').toLowerCase().trim(),
    textOf: element => element?.text || '',
    escapeRegExp: value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    letter: index => 'ABCDE'[index]
  });
  vm.runInContext(await read('src/content/math-audit/03-normalization.js') +
    await read('src/content/math-audit/05-prefix-editing.js') + `
    this.api = { collapse: collapseRepeatedMathText, fingerprint: mathBodyFingerprint,
      compatible: mathFingerprintsCompatible, preserved: mathBodyWasPreservedAfterInsertion };
  `, context);
  const field = text => ({ text, getAttribute: () => '', querySelectorAll: () => [] });
  for (const [before, after, expected] of [
    ['-5', 'A 5', false], ['-5', 'A -5', true],
    ['125', 'A 25', false], ['x+2', 'A x', false],
    ['5', 'A 500', false], ['x<2 e x>-2', 'A x<2 e x>-2', true],
    ['x<2 e x>-2', 'A x-2', false], ['x x', 'A x', false]
  ]) {
    const beforeFingerprint = context.api.fingerprint(before);
    assert.equal(context.api.preserved([beforeFingerprint], null, field(after), 0), expected,
      `${before} → ${after}`);
  }
  assert.equal(context.api.collapse('x < 2 e x > -2'), 'x < 2 e x > -2');
  assert.equal(context.api.compatible('5', '500'), false);
  console.log('Issue #2 / 02: corpo matemático completo exigido, inclusive sinais e desigualdades.');
}

await testCompleteMathBodyVerification();

async function testProvenPrefixRemoval() {
  const context = vm.createContext({
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    normalizeText: value => String(value ?? '').toLowerCase().trim(),
    letter: index => 'ABCDE'[index],
    globalThis: { location: { href: 'https://forms.office.com/test' } }
  });
  vm.runInContext(await read('src/content/alternatives/01-base.js') + `
    this.api = { remove: withoutAlternativeLetter, record: recordAlternativePrefixOrigin,
      proof: provenAlternativePrefixOrigin, forget: forgetAlternativePrefixOrigin };
  `, context);
  for (const [index, text] of [[0, 'A x + 5'], [1, 'B y - 3'], [0, 'A']]) {
    assert.equal(context.api.remove(text, index), text, `Sem prova: ${text}`);
  }
  context.api.record(1, 0, 'x + 5', 'A x + 5');
  const proof = context.api.proof(1, 0, 'A x + 5');
  assert.ok(proof);
  assert.equal(context.api.remove('A x + 5', 0, false, null, proof), 'x + 5');
  assert.equal(context.api.proof(1, 0, 'A x + 6'), null, 'Alteração posterior invalida a prova.');
  context.api.forget(1, 0);
  assert.equal(context.api.proof(1, 0, 'A x + 5'), null);
  context.api.record(2, 0, '', 'A');
  assert.equal(context.api.remove('A', 0, false, null, context.api.proof(2, 0, 'A')), '');
  context.api.record(3, 0, 'x+5', 'A x+5', ['x+5'], ['Ax+5']);
  assert.ok(context.api.proof(3, 0, 'texto renderizado', ['Ax+5']));
  assert.equal(context.api.proof(3, 0, 'texto renderizado', ['Ax+6']), null);
  console.log('Issue #2 / 04: remoção ambígua exige origem comprovada e texto inalterado.');
}

await testProvenPrefixRemoval();
