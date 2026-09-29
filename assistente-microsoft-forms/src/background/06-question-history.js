// Histórico privado de questões, isolado no origin da extensão.
const GSSF_HISTORY_DB = 'gssf-question-history-v1';
let gssfHistoryDatabasePromise = null;

function gssfOpenHistoryDatabase() {
  if (gssfHistoryDatabasePromise) return gssfHistoryDatabasePromise;
  gssfHistoryDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(GSSF_HISTORY_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('questions', { keyPath: 'id' });
      db.createObjectStore('versions', { keyPath: ['id', 'sequence'] });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); gssfHistoryDatabasePromise = null; };
      resolve(db);
    };
    request.onerror = () => { gssfHistoryDatabasePromise = null; reject(request.error || new Error('Falha ao abrir o histórico.')); };
  });
  return gssfHistoryDatabasePromise;
}

function gssfHistoryIdentity(message) {
  const form = String(message.form || '');
  const question = String(message.question || '');
  if (!form || form.length > 2000 || !question || question.length > 300) throw new Error('Identidade da questão inválida.');
  return `${form.length}:${form}${question}`;
}

function gssfHistoryTransaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['questions', 'versions'], mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Falha na transação do histórico.'));
    tx.onabort = () => reject(tx.error || new Error('Transação do histórico cancelada.'));
    try { work(tx.objectStore('questions'), tx.objectStore('versions'), (value) => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

async function gssfHistoryMedia(content) {
  const sources = [...new Set((content.images || []).map((image) => image.src).filter((url) => gssfAllowedImageUrl(url)))].slice(0, 20);
  const media = {};
  let total = 0;
  for (const url of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'force-cache', signal: controller.signal });
      if (!response.ok || !gssfAllowedImageUrl(response.url || url)) continue;
      const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) continue;
      if (Number(response.headers.get('content-length') || 0) > 5_000_000) continue;
      const blob = await responseToLimitedImageBlob(response);
      if (blob.size > 5_000_000 || total + blob.size > 20_000_000) continue;
      media[url] = await blobToDataUrl(blob);
      total += blob.size;
    } catch (_) { /* O texto e a referência da imagem ainda são salvos. */ }
    finally { clearTimeout(timeout); }
  }
  return media;
}

async function gssfQuestionHistory(message) {
  const id = gssfHistoryIdentity(message);
  const action = String(message.action || '');
  const db = await gssfOpenHistoryDatabase();
  if (action === 'listForm') {
    return gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const request = questions.getAll();
      request.onsuccess = () => done((request.result || []).filter((item) => item.form === message.form && item.count > 0).map(({ question, count, lastPrompt }) => ({ question, count, lastPrompt })));
    });
  }
  if (action === 'list') {
    return gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const request = versions.getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      request.onsuccess = () => done((request.result || []).reverse());
    });
  }
  if (action === 'capture') {
    const content = message.content;
    const serialized = JSON.stringify(content);
    if (!content || typeof content !== 'object' || !serialized || serialized.length > 1_000_000) throw new Error('Conteúdo da questão inválido ou muito grande.');
    const previous = await gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const request = questions.get(id);
      request.onsuccess = () => done(request.result || null);
    });
    if (previous?.fingerprint === serialized) return { saved: false };
    const media = content.images?.length ? await gssfHistoryMedia(content) : {};
    // O texto serializado é o fingerprint: evita colisões e preserva diferenças em fórmulas e mídias.
    return gssfHistoryTransaction(db, 'readwrite', (questions, versions, done) => {
      const request = questions.get(id);
      request.onsuccess = () => {
        const previous = request.result || { id, nextSequence: 1, fingerprint: '', count: 0 };
        if (previous.fingerprint === serialized) { done({ saved: false }); return; }
        const sequence = previous.nextSequence;
        const capturedAt = new Date().toISOString();
        versions.put({ id, sequence, capturedAt, content, media });
        questions.put({ id, form: message.form, question: message.question, nextSequence: sequence + 1, fingerprint: serialized, count: previous.count + 1, lastPrompt: String(content.prompt || content.text || '').slice(0, 160) });
        done({ saved: true, sequence });
      };
    });
  }
  if (action === 'deleteVersion' || action === 'clear') {
    return gssfHistoryTransaction(db, 'readwrite', (questions, versions, done) => {
      if (action === 'deleteVersion') {
        const sequence = Number(message.sequence);
        if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Versão inválida.');
        const found = versions.get([id, sequence]);
        found.onsuccess = () => {
          if (!found.result) return;
          versions.delete([id, sequence]);
          const meta = questions.get(id);
          meta.onsuccess = () => { if (meta.result) questions.put({ ...meta.result, count: Math.max(0, meta.result.count - 1) }); };
        };
      } else {
        const request = versions.openKeyCursor(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { versions.delete(cursor.primaryKey); cursor.continue(); }
        };
        const meta = questions.get(id);
        meta.onsuccess = () => { if (meta.result) questions.put({ ...meta.result, count: 0 }); };
      }
      // Manter o fingerprint evita recriar imediatamente uma versão apagada.
      done({ deleted: true });
    });
  }
  throw new Error('Ação de histórico não suportada.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GSSF_QUESTION_HISTORY') return false;
  (async () => {
    try {
      if (!gssfAllowedSender(sender)) throw new Error('Origem da solicitação não permitida.');
      sendResponse({ ok: true, result: await gssfQuestionHistory(message) });
    } catch (error) { sendResponse({ ok: false, error: String(error?.message || error) }); }
  })();
  return true;
});
