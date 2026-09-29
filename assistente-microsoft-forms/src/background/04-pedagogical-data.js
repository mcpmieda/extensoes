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

async function gssfPedagogicalDataGetAll(namespace) {
  const values = await gssfPedagogicalDataRun(namespace, 'readonly', (store) => store.getAll());
  return (values || []).map((value) => {
    const record = { ...value, _gssfRevision: Math.max(0, Number(value?._gssfRevision) || 0) };
    // Registros antigos podem ter salvo uma marca que pertence apenas à interface.
    delete record.sessionOnly;
    return record;
  });
}

function gssfPedagogicalConflict(message) {
  const error = new Error(message);
  error.code = 'CONFLICT';
  return error;
}

async function gssfPedagogicalDataPut(namespace, value, expectedRevision = null, allowReplace = false) {
  const validated = gssfValidatePedagogicalRecord(value);
  const database = await gssfOpenPedagogicalDataDb();
  const storeName = gssfPedagogicalStoreName(namespace);
  const id = String(validated.id || '');
  const normalizedExpected = expectedRevision == null ? null : Math.max(0, Number(expectedRevision) || 0);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    let nextRevision = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { transaction.abort(); } catch (_) {}
      reject(error);
    };
    transaction.onerror = () => fail(transaction.error || new Error('Falha ao salvar registro pedagógico.'));
    transaction.onabort = () => {
      if (!settled) fail(transaction.error || new Error('Gravação pedagógica cancelada.'));
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(nextRevision);
    };
    const getRequest = store.get(id);
    getRequest.onerror = () => fail(getRequest.error || new Error('Falha ao verificar versão do registro pedagógico.'));
    getRequest.onsuccess = () => {
      const current = getRequest.result || null;
      const currentRevision = Math.max(0, Number(current?._gssfRevision) || 0);
      if (current) {
        if (normalizedExpected == null && !allowReplace) return fail(gssfPedagogicalConflict('Este registro já existe e precisa ser recarregado antes de ser substituído.'));
        if (normalizedExpected != null && currentRevision !== normalizedExpected) return fail(gssfPedagogicalConflict('Este registro foi alterado em outra aba. Recarregue os dados antes de salvar novamente.'));
      } else if (normalizedExpected != null && normalizedExpected > 0) {
        return fail(gssfPedagogicalConflict('O registro esperado não existe mais. Recarregue os dados antes de salvar novamente.'));
      }
      nextRevision = currentRevision + 1;
      const next = { ...validated, _gssfRevision: nextRevision };
      delete next.sessionOnly;
      const putRequest = store.put(next);
      putRequest.onerror = () => fail(putRequest.error || new Error('Falha ao gravar registro pedagógico.'));
    };
  });
}

async function gssfPedagogicalDataDelete(namespace, id, expectedRevision = null) {
  const database = await gssfOpenPedagogicalDataDb();
  const storeName = gssfPedagogicalStoreName(namespace);
  const key = String(id || '');
  const normalizedExpected = expectedRevision == null ? null : Math.max(0, Number(expectedRevision) || 0);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { transaction.abort(); } catch (_) {}
      reject(error);
    };
    transaction.onerror = () => fail(transaction.error || new Error('Falha ao excluir registro pedagógico.'));
    transaction.onabort = () => { if (!settled) fail(transaction.error || new Error('Exclusão pedagógica cancelada.')); };
    transaction.oncomplete = () => { if (!settled) { settled = true; resolve(); } };
    const getRequest = store.get(key);
    getRequest.onerror = () => fail(getRequest.error || new Error('Falha ao verificar versão antes da exclusão.'));
    getRequest.onsuccess = () => {
      const current = getRequest.result || null;
      if (!current) return;
      const currentRevision = Math.max(0, Number(current?._gssfRevision) || 0);
      if (normalizedExpected != null && currentRevision !== normalizedExpected) return fail(gssfPedagogicalConflict('Este registro foi alterado em outra aba e não foi excluído.'));
      const deleteRequest = store.delete(key);
      deleteRequest.onerror = () => fail(deleteRequest.error || new Error('Falha ao excluir registro pedagógico.'));
    };
  });
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
      else if (action === 'put') {
        const revision = await gssfPedagogicalDataPut(namespace, message.value, message.expectedRevision, Boolean(message.allowReplace));
        sendResponse({ ok: true, revision });
      }
      else if (action === 'delete') { await gssfPedagogicalDataDelete(namespace, message.id, message.expectedRevision); sendResponse({ ok: true }); }
      else if (action === 'clear') { await gssfPedagogicalDataClear(namespace); sendResponse({ ok: true }); }
      else throw new Error('Ação pedagógica não suportada.');
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error), code: error?.code || undefined });
    }
  })();
  return true;
});
