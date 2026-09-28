// Armazenamento binário nativo das ferramentas pedagógicas.
const GSSF_PEDAGOGICAL_MEDIA_DB = 'gssf-pedagogical-media-v1';
const GSSF_PEDAGOGICAL_MEDIA_STORE = 'assets';
const GSSF_PEDAGOGICAL_MEDIA_PREFIX = 'card:';
const GSSF_PEDAGOGICAL_MEDIA_KEYS = new Set(['logo', 'omr', 'customFront', 'customBack']);
const GSSF_PEDAGOGICAL_MEDIA_MAX_CHARS = 5_500_000;
let gssfPedagogicalMediaDbPromise = null;

function gssfOpenPedagogicalMediaDb() {
  if (gssfPedagogicalMediaDbPromise) return gssfPedagogicalMediaDbPromise;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB indisponível no service worker.'));
  gssfPedagogicalMediaDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(GSSF_PEDAGOGICAL_MEDIA_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(GSSF_PEDAGOGICAL_MEDIA_STORE)) database.createObjectStore(GSSF_PEDAGOGICAL_MEDIA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir o banco pedagógico.'));
  });
  return gssfPedagogicalMediaDbPromise;
}

function gssfMediaTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falha na transação pedagógica.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transação pedagógica cancelada.'));
  });
}

async function gssfPedagogicalMediaGetAll() {
  const database = await gssfOpenPedagogicalMediaDb();
  const transaction = database.transaction(GSSF_PEDAGOGICAL_MEDIA_STORE, 'readonly');
  const done = gssfMediaTransactionDone(transaction);
  const store = transaction.objectStore(GSSF_PEDAGOGICAL_MEDIA_STORE);
  const values = {};
  await Promise.all([...GSSF_PEDAGOGICAL_MEDIA_KEYS].map((key) => new Promise((resolve) => {
    const request = store.get(`${GSSF_PEDAGOGICAL_MEDIA_PREFIX}${key}`);
    request.onsuccess = () => { if (typeof request.result === 'string') values[key] = request.result; resolve(); };
    request.onerror = () => resolve();
  })));
  await done;
  return values;
}

function gssfValidatePedagogicalMedia(key, value) {
  if (!GSSF_PEDAGOGICAL_MEDIA_KEYS.has(key)) throw new Error('Chave de mídia não permitida.');
  const text = String(value || '');
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(text)) throw new Error('Somente imagens PNG, JPG ou WebP locais são permitidas.');
  if (text.length > GSSF_PEDAGOGICAL_MEDIA_MAX_CHARS) throw new Error('Imagem maior que o limite de armazenamento.');
  return text;
}

async function gssfPedagogicalMediaSet(key, value) {
  const text = gssfValidatePedagogicalMedia(key, value);
  const database = await gssfOpenPedagogicalMediaDb();
  const transaction = database.transaction(GSSF_PEDAGOGICAL_MEDIA_STORE, 'readwrite');
  const done = gssfMediaTransactionDone(transaction);
  transaction.objectStore(GSSF_PEDAGOGICAL_MEDIA_STORE).put(text, `${GSSF_PEDAGOGICAL_MEDIA_PREFIX}${key}`);
  await done;
}

async function gssfPedagogicalMediaDelete(key) {
  if (!GSSF_PEDAGOGICAL_MEDIA_KEYS.has(key)) throw new Error('Chave de mídia não permitida.');
  const database = await gssfOpenPedagogicalMediaDb();
  const transaction = database.transaction(GSSF_PEDAGOGICAL_MEDIA_STORE, 'readwrite');
  const done = gssfMediaTransactionDone(transaction);
  transaction.objectStore(GSSF_PEDAGOGICAL_MEDIA_STORE).delete(`${GSSF_PEDAGOGICAL_MEDIA_PREFIX}${key}`);
  await done;
}

async function gssfPedagogicalMediaClear() {
  const database = await gssfOpenPedagogicalMediaDb();
  const transaction = database.transaction(GSSF_PEDAGOGICAL_MEDIA_STORE, 'readwrite');
  const done = gssfMediaTransactionDone(transaction);
  const store = transaction.objectStore(GSSF_PEDAGOGICAL_MEDIA_STORE);
  [...GSSF_PEDAGOGICAL_MEDIA_KEYS].forEach((key) => store.delete(`${GSSF_PEDAGOGICAL_MEDIA_PREFIX}${key}`));
  await done;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GSSF_PEDAGOGICAL_MEDIA') return false;
  (async () => {
    try {
      if (!gssfAllowedSender(sender)) throw new Error('Origem da solicitação não permitida.');
      const action = String(message.action || '');
      if (action === 'getAll') sendResponse({ ok: true, values: await gssfPedagogicalMediaGetAll() });
      else if (action === 'set') { await gssfPedagogicalMediaSet(String(message.key || ''), message.value); sendResponse({ ok: true }); }
      else if (action === 'delete') { await gssfPedagogicalMediaDelete(String(message.key || '')); sendResponse({ ok: true }); }
      else if (action === 'clear') { await gssfPedagogicalMediaClear(); sendResponse({ ok: true }); }
      else throw new Error('Ação de mídia não suportada.');
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true;
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GSSF_MAX_IMAGE_BYTES, gssfAllowedImageUrl, gssfAllowedSender, responseToLimitedImageBlob, GSSF_PEDAGOGICAL_MEDIA_KEYS, GSSF_PEDAGOGICAL_MEDIA_MAX_CHARS, gssfValidatePedagogicalMedia, gssfPedagogicalMediaSet, gssfPedagogicalMediaDelete, gssfPedagogicalMediaClear };
}
