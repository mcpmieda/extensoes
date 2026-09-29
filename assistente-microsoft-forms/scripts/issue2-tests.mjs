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
  const database = {
    transaction() {
      const transaction = { abort() {}, objectStore: () => store };
      const request = (operation) => {
        const result = {};
        queueMicrotask(() => {
          result.result = operation();
          result.onsuccess?.();
          queueMicrotask(() => transaction.oncomplete?.());
        });
        return result;
      };
      const store = {
        get: (id) => request(() => structuredClone(records.get(id))),
        getAll: () => request(() => structuredClone([...records.values()])),
        put: (value) => request(() => { records.set(value.id, structuredClone(value)); return value.id; })
      };
      return transaction;
    }
  };
  const context = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } } }, database });
  vm.runInContext(await read('src/background/04-pedagogical-data.js') + `
    gssfOpenPedagogicalDataDb = async () => database;
    this.api = { getAll: gssfPedagogicalDataGetAll, put: gssfPedagogicalDataPut };
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
    gssfDeleteLegacyIndexedDb = async () => false;
    this.migrate = () => gssfMigrateLegacyPedagogicalDb('printingLots', 'legacy', 'lots');
  `, migration);
  await migration.migrate();
  assert.equal(legacy[0].sessionOnly, true, 'Migrar não deve alterar a fotografia usada no fingerprint do legado.');
  assert.equal(Object.hasOwn(migrated[0], 'sessionOnly'), false);
  assert.equal(JSON.parse([...markers.values()][0]).legacyFingerprint, '1:cfff087f');
  console.log('Issue #2 / 09: representação persistida, leitura legada, confirmação e falha aprovadas.');
}

await testSessionOnlyBoundary();
