import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await fs.readFile(new URL('../src/background/06-question-history.js', import.meta.url), 'utf8');
const contentSource = await fs.readFile(new URL('../src/content/question-history/index.js', import.meta.url), 'utf8');
const contentContext = vm.createContext({});
vm.runInContext(contentSource + '\nthis.looksTransient = questionHistoryLooksTransient;', contentContext);
const looksTransient = contentContext.looksTransient;
assert.equal(vm.runInContext(`questionHistoryIdentity({ querySelector: () => ({ id: 'QuestionId_stable' }) }, 46)`, contentContext), 'id:QuestionId_stable');
assert.equal(vm.runInContext(`questionHistoryIdentity({ querySelector: () => ({ id: 'QuestionId_stable' }) }, 45)`, contentContext), 'id:QuestionId_stable');
assert.equal(vm.runInContext(`questionHistoryIdentity({ querySelector: () => null }, 1)`, contentContext), null);
assert.equal(looksTransient({ options: [] }, true, false), true);
assert.equal(looksTransient({ options: [{ correct: true }, { correct: true }, { correct: true }] }, true, false), true);
assert.equal(looksTransient({ options: [{ correct: false }, { correct: true }, { correct: false }] }, true, false), false);
assert.equal(looksTransient({ options: [] }, false, false), false);
assert.equal(looksTransient({ options: [] }, false, true), true);
assert.equal(looksTransient({ options: [{ correct: true }, { correct: true }, { correct: true }] }, false, true), true);
vm.runInContext(`
  const blocksForHistoryTest = [1, 2, 3].map((n) => ({ n, querySelector: () => null, contains: (target) => target.n === n }));
  const capturedForHistoryTest = [];
  pageMode = () => 'edição';
  isActuallyEditingQuestion = () => false;
  collectQuestionBlocks = () => blocksForHistoryTest;
  getQuestionBlocksFromList = () => blocksForHistoryTest;
  refreshQuestionHistoryButtons = () => {};
  questionNumberFromBlock = (block) => block.n;
  questionHistorySnapshot = (block) => ({ number: block.n, options: [{ correct: false }] });
  questionHistoryIdentity = (block) => String(block.n);
  questionHistoryRequest = async (action, question) => { capturedForHistoryTest.push(question); };
  clearTimeout = () => {};
  setTimeout = () => 1;
  APP = { editingUntil: 0 };
  GSSF_HISTORY_STATE.active = true;
  GSSF_HISTORY_STATE.fullScan = true;
  this.historyCaptureTest = { capture: captureQuestionHistory, state: GSSF_HISTORY_STATE, captured: capturedForHistoryTest };
`, contentContext);
await contentContext.historyCaptureTest.capture();
assert.deepEqual([...contentContext.historyCaptureTest.captured], ['1', '2', '3']);
contentContext.historyCaptureTest.state.dirtyNumbers.add(2);
await contentContext.historyCaptureTest.capture();
assert.deepEqual([...contentContext.historyCaptureTest.captured], ['1', '2', '3', '2']);
vm.runInContext(`queueQuestionHistoryCapture({ nodeType: 1, n: 3, closest: () => null });`, contentContext);
assert.deepEqual([...contentContext.historyCaptureTest.state.dirtyNumbers], [3]);
await contentContext.historyCaptureTest.capture();
assert.deepEqual([...contentContext.historyCaptureTest.captured], ['1', '2', '3', '2', '3']);
vm.runInContext(`blocksForHistoryTest.splice(1, 1); collectQuestionBlocks = () => blocksForHistoryTest.slice(0, 1); isActuallyEditingQuestion = () => true;`, contentContext);
await contentContext.historyCaptureTest.capture();
assert.deepEqual([...contentContext.historyCaptureTest.captured], ['1', '2', '3', '2', '3', '1', '3']);
assert.equal(contentContext.historyCaptureTest.state.questionCount, 3);
vm.runInContext(`isActuallyEditingQuestion = () => false; GSSF_HISTORY_STATE.structural = true;`, contentContext);
await contentContext.historyCaptureTest.capture();
assert.equal(contentContext.historyCaptureTest.state.questionCount, 2);
contentContext.historyCaptureTest.captured.length = 0;
contentContext.historyCaptureTest.state.dirtyNumbers.add(1);
await contentContext.historyCaptureTest.capture();
assert.deepEqual([...contentContext.historyCaptureTest.captured], ['1']);
assert.equal(vm.runInContext(`questionHistoryEditedNumber({ n: 57, querySelector: () => ({ getAttribute: () => 'Título da pergunta 46 Insira o título da pergunta aqui' }) })`, contentContext), 46);
const records = new Map();
const versions = new Map();
const copy = (value) => value === undefined ? undefined : structuredClone(value);
const keyOf = (key) => JSON.stringify(key);
const database = {
  transaction() {
    let pending = 0;
    let completed = false;
    const finish = () => { if (!pending) queueMicrotask(() => { if (!pending && !completed) { completed = true; transaction.oncomplete?.(); } }); };
    const transaction = {
      abort() { completed = true; queueMicrotask(() => transaction.onabort?.()); },
      objectStore(name) { return name === 'questions' ? questions : history; }
    };
    const request = (operation) => {
      const result = {};
      pending += 1;
      queueMicrotask(() => {
        if (completed) return;
        result.result = operation();
        result.onsuccess?.();
        pending -= 1;
        finish();
      });
      return result;
    };
    const questions = {
      get: (id) => request(() => copy(records.get(id))),
      getAll: () => request(() => copy([...records.values()])),
      put: (value) => request(() => { records.set(value.id, copy(value)); return value.id; })
    };
    const history = {
      openCursor: (range, direction) => {
        let rows = [...versions.values()].sort((a, b) => a.id.localeCompare(b.id) || a.sequence - b.sequence);
        if (Array.isArray(range)) rows = rows.filter((row) => row.id === range[0][0] && row.sequence <= range[1][1]);
        else if (range?.after) rows = rows.filter((row) => row.id > range.after[0] || row.id === range.after[0] && row.sequence > range.after[1]);
        if (direction === 'prev') rows.reverse();
        const result = {};
        let index = 0;
        const advance = () => {
          pending++;
          queueMicrotask(() => {
            result.result = rows[index] ? { value: copy(rows[index]), continue() { index++; advance(); } } : null;
            result.onsuccess?.(); pending--; finish();
          });
        };
        advance(); return result;
      },
      clear: () => request(() => versions.clear()),
      get: (key) => request(() => copy(versions.get(keyOf(key)))),
      getAll: (range) => request(() => copy([...versions.values()].filter((item) => item.id === range[0][0]).sort((a, b) => a.sequence - b.sequence))),
      put: (value) => request(() => { versions.set(keyOf([value.id, value.sequence]), copy(value)); return value.sequence; }),
      delete: (key) => request(() => versions.delete(keyOf(key))),
      openKeyCursor: (range) => {
        const keys = [...versions.values()].filter((item) => item.id === range[0][0]).map((item) => [item.id, item.sequence]);
        const result = {};
        let index = 0;
        pending += 1;
        const advance = () => queueMicrotask(() => {
          result.result = index < keys.length ? { primaryKey: keys[index], continue() { index += 1; advance(); } } : null;
          result.onsuccess?.();
          if (!result.result) { pending -= 1; finish(); }
        });
        advance();
        return result;
      }
    };
    return transaction;
  }
};
const context = vm.createContext({
  crypto: webcrypto, TextEncoder,
  chrome: { runtime: { onMessage: { addListener() {} } } },
  IDBKeyRange: { bound: (a, b) => [a, b], lowerBound: (after) => ({ after }) },
  database
});
vm.runInContext(source + `
  gssfOpenHistoryDatabase = async () => database;
  this.historyApi = { run: gssfQueuedQuestionHistory, identity: gssfHistoryIdentity };
`, context);
const api = context.historyApi;
const base = { form: 'forms.office.com/Pages/DesignPageV2.aspx?form=abc', question: 'number:1' };
assert.notEqual(api.identity(base), api.identity({ ...base, question: 'number:2' }));
await assert.rejects(api.run({ ...base, question: '' }), /Identidade/);
await assert.rejects(api.run({ ...base, action: 'capture', content: { prompt: 'x'.repeat(1_000_001) } }), /muito grande/);
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'A', options: [] } })).saved, true);
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'A', options: [] } })).saved, false);
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'B', options: [] } })).sequence, 2);
assert.equal((await api.run({ ...base, action: 'list' })).length, 2);
await api.run({ ...base, action: 'deleteVersion', sequence: 2 });
assert.equal((await api.run({ ...base, action: 'list' })).length, 1);
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'B', options: [] } })).saved, false);
assert.equal((await api.run({ ...base, action: 'listForm' }))[0]?.count, 1);
await api.run({ ...base, action: 'clear' });
assert.equal((await api.run({ ...base, action: 'list' })).length, 0);
assert.equal((await api.run({ ...base, action: 'listForm' })).length, 0);
assert.equal(records.get(api.identity(base)).lastPrompt, undefined);
assert.match(records.get(api.identity(base)).fingerprint, /^sha256:[a-f0-9]{64}$/);
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'B', options: [] } })).saved, false);
await Promise.all([
  api.run({ ...base, action: 'capture', content: { prompt: 'C', options: [] } }),
  api.run({ ...base, action: 'clearAll' })
]);
assert.equal(versions.size, 0);
assert.equal(records.get(api.identity(base)).lastPrompt, undefined);
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'C', options: [] } })).saved, false);
for (let n = 0; n < 7; n++) await api.run({ ...base, action: 'capture', content: { prompt: `Versão ${n}`, options: [] } });
const firstPage = await api.run({ ...base, action: 'listPage' });
assert.equal(firstPage.versions.length, 5);
assert.equal(firstPage.more, true);
const secondPage = await api.run({ ...base, action: 'listPage', before: firstPage.before });
assert.equal(secondPage.versions.length, 2);
assert.equal(secondPage.more, false);
const exported = [];
let after = null;
for (;;) {
  const page = await api.run({ ...base, action: 'exportPage', after });
  if (!page) break;
  exported.push(page.row); after = page.after;
}
assert.equal(exported.length, 7);
assert.equal((await api.run({ ...base, action: 'import', rows: exported })).imported, 0);
await api.run({ ...base, action: 'clearAll' });
assert.equal((await api.run({ ...base, action: 'import', rows: exported })).imported, 7);
assert.equal((await api.run({ ...base, action: 'import', rows: exported })).imported, 0);
await assert.rejects(api.run({ ...base, action: 'import', rows: [{ ...exported[0], media: { x: 'data:text/html;base64,AAAA' } }] }), /Imagem inválida/);
assert.equal((await api.run({ ...base, action: 'list' })).length, 7);
const legacyId = api.identity({ ...base, question: 'number:old' });
records.set(legacyId, { id: legacyId, form: base.form, question: 'number:old', count: 0, nextSequence: 2, fingerprint: '{"prompt":"CONTEUDO APAGADO"}', lastPrompt: 'CONTEUDO APAGADO' });
vm.runInContext('gssfHistoryMigratedDatabase = null;', context);
await api.run({ ...base, action: 'listForm' });
assert.equal(JSON.stringify(records.get(legacyId)).includes('CONTEUDO APAGADO'), false);
const capped = { ...base, question: 'id:QuestionId_limit' };
for (let n = 0; n < 100; n++) await api.run({ ...capped, action: 'capture', content: { prompt: `Q${n}`, options: [] } });
await assert.rejects(api.run({ ...capped, action: 'capture', content: { prompt: 'Q100', options: [] } }), /100 versões/);
assert.equal((await api.run({ ...capped, action: 'list' })).length, 100);

// A checagem periódica e a rolagem não podem voltar a coletar toda a página.
const perf = vm.createContext({
  APP: {},
  document: { querySelectorAll: () => [], documentElement: { clientHeight: 800 } },
  window: { innerHeight: 800 },
  collectQuestionBlocks: () => { throw new Error('Varredura completa no caminho frequente'); }
});
vm.runInContext(await fs.readFile(new URL('../src/content/analysis-dashboard/02-auto-analysis.js', import.meta.url), 'utf8') +
  await fs.readFile(new URL('../src/content/audit-bank/03-map-interaction.js', import.meta.url), 'utf8') +
  '\nthis.checkSignature = currentQuestionDomSignature; this.visibleNumber = currentVisibleQuestionNumber;', perf);
assert.notEqual(perf.checkSignature(), '');
perf.APP.scrollQuestionBlocks = [{ number: 46, block: { isConnected: true, getBoundingClientRect: () => ({ top: 100, bottom: 500, height: 400 }) } }];
assert.equal(perf.visibleNumber(), 46);
const discovery = vm.createContext({ APP: {}, uniqueElements: (rows) => rows, byTop: () => 0 });
vm.runInContext(await fs.readFile(new URL('../src/content/forms-dom/02-question-discovery.js', import.meta.url), 'utf8') + `
  let reads = 0;
  getQuestionBlocksFromList = () => Array.from({length: 500}, (_, i) => ({ n: i + 1 }));
  questionNumberFromBlock = (block) => { reads++; return block.n; };
  this.collect = collectQuestionBlocks; this.reads = () => reads;
`, discovery);
assert.equal(discovery.collect().length, 500);
assert.ok(discovery.reads() <= 1000, 'A coleta deve ler números em quantidade linear, não quadrática.');

// A análise cooperativa deve permitir entrada entre etapas e descartar leitura obsoleta.
const auditContext = vm.createContext({ APP: { editingUntil: 0, quizDocumentKey: 'form', lifecycle: {} }, document: { hidden: false }, performance, setTimeout });
vm.runInContext(await fs.readFile(new URL('../src/content/audit-bank/01-base.js', import.meta.url), 'utf8') + `
  let processed = 0;
  let closed = 0;
  auditPageSteps = function* () { try { for (let i=0; i<4; i++) { processed++; yield; } return { questions: [1,2,3,4] }; } finally { closed++; } };
  this.cooperate = auditPageCooperatively; this.synchronous = auditPage;
  this.metrics = () => ({processed, closed});
`, auditContext);
const synchronousAudit = auditContext.synchronous();
assert.deepEqual(await auditContext.cooperate(), synchronousAudit);
const beforeCancel = auditContext.metrics().processed;
const cancelledAudit = auditContext.cooperate();
auditContext.APP.questionContentRevision = 1;
assert.equal(await cancelledAudit, null);
assert.equal(auditContext.metrics().processed, beforeCancel + 1, 'Mutação entre etapas deve impedir que a próxima questão seja lida.');
assert.equal(auditContext.metrics().closed, 3, 'Cancelar deve fechar o gerador e liberar referências.');
const editingAudit = auditContext.cooperate();
auditContext.APP.editingUntil = Date.now() + 3000;
assert.equal(await editingAudit, null);
console.log('Histórico de questões: identidade, limite, deduplicação e exclusões aprovados.');
