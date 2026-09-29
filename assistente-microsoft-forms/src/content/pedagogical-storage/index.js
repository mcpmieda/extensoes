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
          if (!response?.ok) {
            const error = new Error(response?.error || 'Operação não concluída.');
            if (response?.code) error.code = response.code;
            return reject(error);
          }
          resolve(response);
        });
      } catch (error) { reject(error); }
    });
  }

  async function gssfPedagogicalDataGetAll(namespace) {
    const response = await gssfRuntimeRequest({ type: 'GSSF_PEDAGOGICAL_DATA', namespace, action: 'getAll' });
    return Array.isArray(response.values) ? response.values : [];
  }
  function gssfPedagogicalDataPut(namespace, value, options = {}) {
    const hasExpected = Object.prototype.hasOwnProperty.call(options, 'expectedRevision') || Object.prototype.hasOwnProperty.call(value || {}, '_gssfRevision');
    const expectedRevision = Object.prototype.hasOwnProperty.call(options, 'expectedRevision')
      ? options.expectedRevision
      : (hasExpected ? Number(value?._gssfRevision) || 0 : null);
    return gssfRuntimeRequest({
      type: 'GSSF_PEDAGOGICAL_DATA',
      namespace,
      action: 'put',
      value,
      expectedRevision: hasExpected ? expectedRevision : null,
      allowReplace: Boolean(options.allowReplace)
    }).then((response) => {
      if (value && typeof value === 'object' && Number.isInteger(response.revision)) value._gssfRevision = response.revision;
      return undefined;
    });
  }
  function gssfPedagogicalDataDelete(namespace, id, expectedRevision = null) {
    return gssfRuntimeRequest({ type: 'GSSF_PEDAGOGICAL_DATA', namespace, action: 'delete', id, expectedRevision }).then(() => undefined);
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

  function gssfStablePedagogicalValue(value) {
    if (Array.isArray(value)) return value.map(gssfStablePedagogicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value)
        .filter((key) => key !== '_gssfRevision')
        .sort()
        .map((key) => [key, gssfStablePedagogicalValue(value[key])]));
    }
    return value;
  }

  function gssfPedagogicalStableJson(value) {
    try { return JSON.stringify(gssfStablePedagogicalValue(value)); } catch (_) { return ''; }
  }

  function gssfPedagogicalRecordsEqual(a, b) {
    return gssfPedagogicalStableJson(a) === gssfPedagogicalStableJson(b);
  }

  function gssfPedagogicalRecordsFingerprint(records) {
    const source = (records || []).slice()
      .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
      .map(gssfPedagogicalStableJson)
      .join('\n');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${(records || []).length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  async function gssfWritePedagogicalMigrationMarker(markerKey, marker) {
    try {
      globalThis.GSSF_STORAGE?.setItem?.(markerKey, JSON.stringify(marker));
      await globalThis.GSSF_STORAGE?.flush?.();
    } catch (_) {}
  }

  async function gssfMigrateLegacyPedagogicalDb(namespace, databaseName, storeName) {
    if (!globalThis.indexedDB || !databaseName || !storeName) return 0;
    const host = String(globalThis.location?.hostname || 'unknown').replace(/[^a-z0-9.-]/gi, '_');
    const markerKey = `gssf_${namespace}_idb_migrated_v1:${host}`;
    let marker = null;
    try {
      const rawMarker = globalThis.GSSF_STORAGE?.getItem?.(markerKey);
      if (rawMarker) marker = JSON.parse(rawMarker);
    } catch (_) {}

    if (marker?.cleanupPending) {
      const exists = await gssfLegacyDatabaseExists(databaseName);
      if (!exists) {
        await gssfWritePedagogicalMigrationMarker(markerKey, { ...marker, cleanupPending: false, migratedAt: marker.migratedAt || new Date().toISOString(), cleanedAt: new Date().toISOString() });
        return 0;
      }
      const pendingRecords = await gssfReadLegacyIndexedDb(databaseName, storeName);
      const fingerprint = gssfPedagogicalRecordsFingerprint(pendingRecords);
      if (marker.legacyFingerprint && fingerprint !== marker.legacyFingerprint) {
        throw new Error('O banco legado mudou depois da cópia inicial; ele foi preservado para evitar perda de alterações feitas por outra aba.');
      }
      const removed = await gssfDeleteLegacyIndexedDb(databaseName);
      if (removed) {
        await gssfWritePedagogicalMigrationMarker(markerKey, { ...marker, cleanupPending: false, cleanedAt: new Date().toISOString() });
      }
      return 0;
    }
    if (marker) return 0;

    const exists = await gssfLegacyDatabaseExists(databaseName);
    if (!exists) {
      await gssfWritePedagogicalMigrationMarker(markerKey, { migratedAt: new Date().toISOString(), count: 0, host, cleanupPending: false });
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
    const legacyFingerprint = gssfPedagogicalRecordsFingerprint(records);
    const legacyRemoved = await gssfDeleteLegacyIndexedDb(databaseName);
    // A cópia verificada e a limpeza física são etapas diferentes. Se outra aba ainda
    // mantiver o banco aberto, registramos a impressão digital do legado copiado e,
    // na próxima abertura, tentamos somente a limpeza. Alterações novas no legado
    // são detectadas e preservadas, em vez de criarem conflito com dados já editados.
    await gssfWritePedagogicalMigrationMarker(markerKey, {
      migratedAt: new Date().toISOString(),
      count: records.length,
      host,
      cleanupPending: !legacyRemoved,
      legacyFingerprint,
      ...(legacyRemoved ? { cleanedAt: new Date().toISOString() } : {})
    });
    return records.length;
  }
