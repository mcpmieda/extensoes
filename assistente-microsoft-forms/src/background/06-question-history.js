// Histórico privado de questões, isolado no origin da extensão.
const GSSF_HISTORY_DB = 'gssf-question-history-v1';
let gssfHistoryDatabasePromise = null;
let gssfHistoryQueue = Promise.resolve();

async function gssfHistoryHash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return 'sha256:' + Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function gssfHistoryTombstone(meta) {
  return { id: meta.id, form: meta.form, question: meta.question, nextSequence: meta.nextSequence, fingerprint: meta.fingerprint, count: 0 };
}

function gssfQueuedQuestionHistory(message) {
  const task = gssfHistoryQueue.then(() => gssfQuestionHistory(message));
  gssfHistoryQueue = task.catch(() => {});
  return task;
}

async function gssfMigrateHistoryMetadata(db) {
  const rows = await gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
    const request = questions.getAll(); request.onsuccess = () => done(request.result || []);
  });
  const changes = [];
  for (const row of rows) {
    if (!String(row.fingerprint || '').startsWith('sha256:')) {
      row.fingerprint = await gssfHistoryHash(row.fingerprint || '');
      changes.push(row.count ? row : gssfHistoryTombstone(row));
    } else if (!row.count && row.lastPrompt !== undefined) changes.push(gssfHistoryTombstone(row));
  }
  if (changes.length) await gssfHistoryTransaction(db, 'readwrite', (questions) => changes.forEach((row) => questions.put(row)));
}
let gssfHistoryMigratedDatabase = null;

function gssfValidateHistoryBackup(rows) {
  if (!Array.isArray(rows) || rows.length > 10000 || JSON.stringify(rows).length > 32_000_000) throw new Error('Histórico de backup inválido ou maior que 32 MB.');
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Versão inválida no backup.');
    gssfHistoryIdentity(row);
    const c = row.content;
    if (!Number.isFinite(Date.parse(row.capturedAt)) || !c || typeof c !== 'object' || JSON.stringify(c).length > 1_000_000
      || (c.options !== undefined && (!Array.isArray(c.options) || c.options.some((v) => !v || typeof v.text !== 'string')))
      || (c.images !== undefined && (!Array.isArray(c.images) || c.images.some((v) => !v || typeof v.src !== 'string')))
      || (c.math !== undefined && (!Array.isArray(c.math) || c.math.some((v) => typeof v !== 'string')))) throw new Error('Conteúdo inválido no histórico do backup.');
    if (row.media && (typeof row.media !== 'object' || Array.isArray(row.media)
      || Object.values(row.media).some((v) => typeof v !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)))) throw new Error('Imagem inválida no histórico do backup.');
  }
  return true;
}

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
  if (gssfHistoryMigratedDatabase !== db) {
    await gssfMigrateHistoryMetadata(db);
    gssfHistoryMigratedDatabase = db;
  }
  if (action === 'clearAll') {
    return gssfHistoryTransaction(db, 'readwrite', (questions, versions, done) => {
      versions.clear();
      const request = questions.getAll();
      request.onsuccess = () => (request.result || []).forEach((row) => questions.put(gssfHistoryTombstone(row)));
      done({ deleted: true });
    });
  }
  if (action === 'exportPage') {
    return gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const range = message.after ? IDBKeyRange.lowerBound(message.after, true) : null;
      const request = versions.openCursor(range);
      request.onsuccess = () => {
        const row = request.result?.value;
        if (!row) { done(null); return; }
        const meta = questions.get(row.id);
        meta.onsuccess = () => done({ after: [row.id, row.sequence], row: { form: meta.result.form, question: meta.result.question, capturedAt: row.capturedAt, content: row.content, media: row.media } });
      };
    });
  }
  if (action === 'validateImport' || action === 'import') {
    gssfValidateHistoryBackup(message.rows);
    if (action === 'validateImport') return { valid: true };
    const prepared = [];
    for (const row of message.rows) prepared.push({ ...row, id: gssfHistoryIdentity(row), fingerprint: await gssfHistoryHash(JSON.stringify(row.content)) });
    const existing = await gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const request = questions.getAll(); request.onsuccess = () => done(request.result || []);
    });
    const metas = new Map(existing.map((row) => [row.id, row]));
    const additions = [];
    for (const id of new Set(prepared.map((row) => row.id))) {
      const saved = await gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
        const request = versions.getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
        request.onsuccess = () => done(request.result || []);
      });
      const seen = new Set();
      for (const row of saved) seen.add(`${row.capturedAt}:${await gssfHistoryHash(JSON.stringify(row.content))}`);
      const meta = metas.get(id) || { id, count: 0, nextSequence: 1 };
      for (const row of prepared.filter((item) => item.id === id).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))) {
        const key = `${row.capturedAt}:${row.fingerprint}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (meta.count >= 100) throw new Error('Importação excederia 100 versões de uma questão. Nenhuma versão foi importada.');
        additions.push({ id, sequence: meta.nextSequence++, capturedAt: row.capturedAt, content: row.content, media: row.media || {} });
        meta.count++;
        Object.assign(meta, { form: row.form, question: row.question, number: row.content.number });
        // Uma mesclagem não altera a assinatura da captura local atual.
        if (!metas.has(id)) { meta.fingerprint = row.fingerprint; meta.lastPrompt = String(row.content.prompt || '').slice(0, 160); }
      }
      metas.set(id, meta);
    }
    return gssfHistoryTransaction(db, 'readwrite', (questions, versions, done) => {
      additions.forEach((row) => versions.put(row));
      metas.forEach((row) => questions.put(row));
      done({ imported: additions.length });
    });
  }
  if (action === 'listPage') {
    return gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const before = Number.isSafeInteger(message.before) && message.before > 0 ? message.before - 1 : Number.MAX_SAFE_INTEGER;
      const rows = [];
      let bytes = 0;
      const request = versions.openCursor(IDBKeyRange.bound([id, 0], [id, before]), 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        const size = cursor ? JSON.stringify(cursor.value).length : 0;
        if (cursor && rows.length < 5 && (!rows.length || bytes + size <= 28_000_000)) { rows.push(cursor.value); bytes += size; cursor.continue(); }
        else done({ versions: rows, more: Boolean(cursor), before: rows.at(-1)?.sequence });
      };
    });
  }
  if (action === 'listForm') {
    return gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const request = questions.getAll();
      request.onsuccess = () => done((request.result || []).filter((item) => item.form === message.form && item.count > 0).map(({ question, count, lastPrompt, number }) => ({ question, count, lastPrompt, number })));
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
    const fingerprint = await gssfHistoryHash(serialized);
    const previous = await gssfHistoryTransaction(db, 'readonly', (questions, versions, done) => {
      const request = questions.get(id);
      request.onsuccess = () => done(request.result || null);
    });
    if (previous?.fingerprint === fingerprint) return { saved: false };
    if (previous?.count >= 100) throw new Error('Limite de 100 versões atingido. Exporte um backup e apague versões para continuar salvando.');
    const media = content.images?.length ? await gssfHistoryMedia(content) : {};
    // A assinatura não conserva o conteúdo de uma versão que o usuário apagou.
    return gssfHistoryTransaction(db, 'readwrite', (questions, versions, done) => {
      const request = questions.get(id);
      request.onsuccess = () => {
        const previous = request.result || { id, nextSequence: 1, fingerprint: '', count: 0 };
        if (previous.fingerprint === fingerprint) { done({ saved: false }); return; }
        const sequence = previous.nextSequence;
        const capturedAt = new Date().toISOString();
        versions.put({ id, sequence, capturedAt, content, media });
        questions.put({ id, form: message.form, question: message.question, number: content.number, nextSequence: sequence + 1, fingerprint, count: previous.count + 1, lastPrompt: String(content.prompt || content.text || '').slice(0, 160) });
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
          meta.onsuccess = () => {
            if (!meta.result) return;
            // O resumo pode pertencer à versão apagada; não conservar seu enunciado.
            const { lastPrompt, ...safe } = meta.result;
            const count = Math.max(0, safe.count - 1);
            questions.put(count ? { ...safe, count } : gssfHistoryTombstone(safe));
          };
        };
      } else {
        const request = versions.openKeyCursor(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { versions.delete(cursor.primaryKey); cursor.continue(); }
        };
        const meta = questions.get(id);
        meta.onsuccess = () => { if (meta.result) questions.put(gssfHistoryTombstone(meta.result)); };
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
      sendResponse({ ok: true, result: await gssfQueuedQuestionHistory(message) });
    } catch (error) { sendResponse({ ok: false, error: String(error?.message || error) }); }
  })();
  return true;
});
