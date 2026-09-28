// Armazenamento de lotes pedagógicos no origin da própria extensão.
const GSSF_PEDAGOGICAL_DATA_DB = 'gssf-pedagogical-data-v1';
const GSSF_PEDAGOGICAL_DATA_VERSION = 1;
const GSSF_PEDAGOGICAL_DATA_STORES = Object.freeze({
  printingLots: 'printingLots',
  diagnosticBatches: 'diagnosticBatches'
});
const GSSF_PEDAGOGICAL_RECORD_MAX_CHARS = 8_000_000;
let gssfPedagogicalDataDbPromise = null;

function gssfOpenPedagogicalDataDb() {
  if (gssfPedagogicalDataDbPromise) return gssfPedagogicalDataDbPromise;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB indisponível no service worker.'));
  gssfPedagogicalDataDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(GSSF_PEDAGOGICAL_DATA_DB, GSSF_PEDAGOGICAL_DATA_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      Object.values(GSSF_PEDAGOGICAL_DATA_STORES).forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id' });
      });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      gssfPedagogicalDataDbPromise = null;
      reject(request.error || new Error('Falha ao abrir o armazenamento pedagógico.'));
    };
  });
  return gssfPedagogicalDataDbPromise;
}

function gssfPedagogicalStoreName(namespace) {
  const storeName = GSSF_PEDAGOGICAL_DATA_STORES[String(namespace || '')];
  if (!storeName) throw new Error('Namespace pedagógico não permitido.');
  return storeName;
}

function gssfValidatePedagogicalRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registro pedagógico inválido.');
  const id = String(value.id || '');
  if (!id || id.length > 240) throw new Error('Identificador pedagógico inválido.');
  let serialized = '';
  try { serialized = JSON.stringify(value); } catch (_) { throw new Error('Registro pedagógico não serializável.'); }
  if (serialized.length > GSSF_PEDAGOGICAL_RECORD_MAX_CHARS) throw new Error('Registro pedagógico excede o limite seguro de armazenamento.');
  return value;
}

async function gssfPedagogicalDataRun(namespace, mode, operation) {
  const database = await gssfOpenPedagogicalDataDb();
  const storeName = gssfPedagogicalStoreName(namespace);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Falha no armazenamento pedagógico.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transação pedagógica cancelada.'));
    try {
      const request = operation(store);
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('Falha na operação pedagógica.'));
      }
    } catch (error) {
      try { transaction.abort(); } catch (_) {}
      reject(error);
    }
  });
}

function gssfPedagogicalDataGetAll(namespace) {
  return gssfPedagogicalDataRun(namespace, 'readonly', (store) => store.getAll());
}
function gssfPedagogicalDataPut(namespace, value) {
  return gssfPedagogicalDataRun(namespace, 'readwrite', (store) => store.put(gssfValidatePedagogicalRecord(value)));
}
function gssfPedagogicalDataDelete(namespace, id) {
  return gssfPedagogicalDataRun(namespace, 'readwrite', (store) => store.delete(String(id || '')));
}
function gssfPedagogicalDataClear(namespace) {
  return gssfPedagogicalDataRun(namespace, 'readwrite', (store) => store.clear());
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GSSF_PEDAGOGICAL_DATA') return false;
  (async () => {
    try {
      if (!gssfAllowedSender(sender)) throw new Error('Origem da solicitação não permitida.');
      const namespace = String(message.namespace || '');
      const action = String(message.action || '');
      gssfPedagogicalStoreName(namespace);
      if (action === 'getAll') sendResponse({ ok: true, values: await gssfPedagogicalDataGetAll(namespace) });
      else if (action === 'put') { await gssfPedagogicalDataPut(namespace, message.value); sendResponse({ ok: true }); }
      else if (action === 'delete') { await gssfPedagogicalDataDelete(namespace, message.id); sendResponse({ ok: true }); }
      else if (action === 'clear') { await gssfPedagogicalDataClear(namespace); sendResponse({ ok: true }); }
      else throw new Error('Ação pedagógica não suportada.');
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true;
});
