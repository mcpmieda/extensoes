import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/background/06-question-history.js', import.meta.url), 'utf8');
const contentSource = await fs.readFile(new URL('../src/content/question-history/index.js', import.meta.url), 'utf8');
const contentContext = vm.createContext({});
vm.runInContext(contentSource + '\nthis.looksTransient = questionHistoryLooksTransient;', contentContext);
const looksTransient = contentContext.looksTransient;
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
vm.runInContext(`blocksForHistoryTest.splice(1, 1); isActuallyEditingQuestion = () => true;`, contentContext);
await contentContext.historyCaptureTest.capture();
assert.deepEqual([...contentContext.historyCaptureTest.captured], ['1', '2', '3', '2', '3', '1', '3']);
assert.equal(contentContext.historyCaptureTest.state.questionCount, 3);
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
  chrome: { runtime: { onMessage: { addListener() {} } } },
  IDBKeyRange: { bound: (a, b) => [a, b] },
  database
});
vm.runInContext(source + `
  gssfOpenHistoryDatabase = async () => database;
  this.historyApi = { run: gssfQuestionHistory, identity: gssfHistoryIdentity };
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
assert.equal((await api.run({ ...base, action: 'capture', content: { prompt: 'B', options: [] } })).saved, false);
console.log('Histórico de questões: identidade, limite, deduplicação e exclusões aprovados.');
