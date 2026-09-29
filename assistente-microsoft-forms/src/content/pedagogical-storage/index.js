  // Persistência de lotes no origin da extensão, com migração dos antigos bancos do Forms.
  const GSSF_PEDAGOGICAL_NAMESPACES = Object.freeze({
    printingLots: 'printingLots',
    diagnosticBatches: 'diagnosticBatches'
  });

  function gssfRuntimeRequest(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) return reject(new Error(lastError.message || 'Falha de comunicação com a extensão.'));
          if (!response?.ok) return reject(new Error(response?.error || 'Operação não concluída.'));
          resolve(response);
        });
      } catch (error) { reject(error); }
    });
  }

  async function gssfPedagogicalDataGetAll(namespace) {
    const response = await gssfRuntimeRequest({ type: 'GSSF_PEDAGOGICAL_DATA', namespace, action: 'getAll' });
    return Array.isArray(response.values) ? response.values : [];
  }
  function gssfPedagogicalDataPut(namespace, value) {
    return gssfRuntimeRequest({ type: 'GSSF_PEDAGOGICAL_DATA', namespace, action: 'put', value }).then(() => undefined);
  }
  function gssfPedagogicalDataDelete(namespace, id) {
    return gssfRuntimeRequest({ type: 'GSSF_PEDAGOGICAL_DATA', namespace, action: 'delete', id }).then(() => undefined);
  }
  function gssfPedagogicalDataClear(namespace) {
    return gssfRuntimeRequest({ type: 'GSSF_PEDAGOGICAL_DATA', namespace, action: 'clear' }).then(() => undefined);
  }

  async function gssfLegacyDatabaseExists(databaseName) {
    try {
      if (typeof indexedDB?.databases !== 'function') return true;
      const databases = await indexedDB.databases();
      return databases.some((entry) => entry?.name === databaseName);
    } catch (_) { return true; }
  }

  function gssfReadLegacyIndexedDb(databaseName, storeName) {
    return new Promise((resolve, reject) => {
      let createdEmpty = false;
      const request = indexedDB.open(databaseName);
      request.onupgradeneeded = () => { createdEmpty = true; };
      request.onerror = () => reject(request.error || new Error('Falha ao abrir armazenamento legado.'));
      request.onsuccess = () => {
        const database = request.result;
        if (createdEmpty || !database.objectStoreNames.contains(storeName)) {
          database.close();
          return resolve([]);
        }
        try {
          const transaction = database.transaction(storeName, 'readonly');
          const getAll = transaction.objectStore(storeName).getAll();
          getAll.onsuccess = () => { const values = getAll.result || []; database.close(); resolve(values); };
          getAll.onerror = () => { database.close(); reject(getAll.error || new Error('Falha ao ler armazenamento legado.')); };
        } catch (error) { database.close(); reject(error); }
      };
    });
  }

  function gssfDeleteLegacyIndexedDb(databaseName) {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve(true);
        request.onerror = request.onblocked = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function gssfPedagogicalRecordsEqual(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
  }

  async function gssfMigrateLegacyPedagogicalDb(namespace, databaseName, storeName) {
    if (!globalThis.indexedDB || !databaseName || !storeName) return 0;
    const host = String(globalThis.location?.hostname || 'unknown').replace(/[^a-z0-9.-]/gi, '_');
    const markerKey = `gssf_${namespace}_idb_migrated_v1:${host}`;
    try { if (globalThis.GSSF_STORAGE?.getItem?.(markerKey)) return 0; } catch (_) {}
    const exists = await gssfLegacyDatabaseExists(databaseName);
    if (!exists) {
      try { globalThis.GSSF_STORAGE?.setItem?.(markerKey, JSON.stringify({ migratedAt: new Date().toISOString(), count: 0, host })); } catch (_) {}
      return 0;
    }
    const records = await gssfReadLegacyIndexedDb(databaseName, storeName);
    if (records.length) {
      const existing = await gssfPedagogicalDataGetAll(namespace);
      const existingById = new Map(existing.map((record) => [String(record?.id || ''), record]));
      const conflicts = records.filter((record) => {
        const id = String(record?.id || '');
        return existingById.has(id) && !gssfPedagogicalRecordsEqual(existingById.get(id), record);
      });
      if (conflicts.length) {
        throw new Error(`Migração pedagógica encontrou ${conflicts.length} conflito(s) de ID; nenhum dado foi sobrescrito e o banco legado foi preservado.`);
      }
      for (const record of records) {
        const id = String(record?.id || '');
        if (!existingById.has(id)) await gssfPedagogicalDataPut(namespace, record);
      }
      const stored = await gssfPedagogicalDataGetAll(namespace);
      const storedById = new Map(stored.map((record) => [String(record?.id || ''), record]));
      if (records.some((record) => !gssfPedagogicalRecordsEqual(storedById.get(String(record?.id || '')), record))) {
        throw new Error('Migração pedagógica não pôde ser verificada; banco legado preservado.');
      }
    }
    const legacyRemoved = await gssfDeleteLegacyIndexedDb(databaseName);
    // Se outro tab ainda mantiver o banco aberto, os dados já copiados continuam
    // disponíveis no origin da extensão, mas não gravamos o marcador. Assim a limpeza
    // do legado é tentada novamente numa próxima abertura, sem bloquear o recurso.
    if (legacyRemoved) {
      try { globalThis.GSSF_STORAGE?.setItem?.(markerKey, JSON.stringify({ migratedAt: new Date().toISOString(), count: records.length, host })); } catch (_) {}
    }
    return records.length;
  }
