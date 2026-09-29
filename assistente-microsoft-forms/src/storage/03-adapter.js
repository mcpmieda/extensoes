  function createGssfStorageAdapter({ backend, legacyStorage = null, origin = '' } = {}) {
    if (!backend) throw new Error('Backend de armazenamento obrigatório.');
    const cache = new Map();
    const confirmed = new Map();
    const latestWrite = new Map();
    const pendingErrors = [];
    let initialized = false;
    let suspended = false;
    let writeQueue = Promise.resolve();

    function enqueue(operation) {
      writeQueue = writeQueue.then(operation).catch((error) => {
        pendingErrors.push(error);
      });
      return writeQueue;
    }

    async function migrateLegacyStorage() {
      if (!legacyStorage) return { migrated: 0, removed: 0 };
      const migrationKey = `${NAMESPACE}storage_migration_v${MIGRATION_VERSION}:${String(origin || 'unknown').replace(/[^a-z0-9.-]+/gi, '_')}`;
      if (cache.has(migrationKey)) return { migrated: 0, removed: 0 };
      const migratedValues = {};
      const legacyKeys = [];
      try {
        for (let index = 0; index < legacyStorage.length; index += 1) {
          const oldKey = legacyStorage.key(index);
          if (!isManagedKey(oldKey)) continue;
          legacyKeys.push(oldKey);
          const nextKey = canonicalKey(oldKey);
          const value = legacyStorage.getItem(oldKey);
          if (value !== null) {
            const currentValue = nextKey in migratedValues ? migratedValues[nextKey] : cache.get(nextKey);
            const mergedValue = mergeMigrationValue(nextKey, currentValue, String(value));
            if (mergedValue !== currentValue) migratedValues[nextKey] = mergedValue;
          }
        }
      } catch (error) {
        reportStorageError('ler-legado', error);
      }

      Object.entries(migratedValues).forEach(([key, value]) => cache.set(key, value));
      const marker = JSON.stringify({ migratedAt: new Date().toISOString(), migrated: Object.keys(migratedValues).length, origin: origin || '' });
      cache.set(migrationKey, marker);
      await backend.set({ ...migratedValues, [migrationKey]: marker });

      let removed = 0;
      legacyKeys.forEach((key) => {
        try {
          legacyStorage.removeItem(key);
          removed += 1;
        } catch (error) {
          reportStorageError('remover-legado', error);
        }
      });
      return { migrated: Object.keys(migratedValues).length, removed };
    }

    async function init() {
      if (initialized) return;
      const stored = await backend.getAll();
      const canonicalUpdates = {};
      const obsoleteKeys = [];
      Object.entries(stored || {}).forEach(([key, value]) => {
        if (!isManagedKey(key)) return;
        const nextKey = canonicalKey(key);
        if (!cache.has(nextKey) || key === nextKey) cache.set(nextKey, String(value ?? ''));
        if (nextKey !== key) {
          if (!(nextKey in stored)) canonicalUpdates[nextKey] = String(value ?? '');
          obsoleteKeys.push(key);
        }
      });
      if (Object.keys(canonicalUpdates).length) await backend.set(canonicalUpdates);
      if (obsoleteKeys.length) await backend.remove(obsoleteKeys);
      await migrateLegacyStorage();
      confirmed.clear();
      cache.forEach((value, key) => confirmed.set(key, value));
      initialized = true;
    }

    function getItem(key) {
      const value = cache.get(canonicalKey(key));
      return value === undefined ? null : value;
    }

    function setCachedItem(key, value, confirmedWrite = false) {
      const nextKey = canonicalKey(key);
      if (!isManagedKey(nextKey)) throw new Error(`Chave fora do namespace GSSF: ${key}`);
      if (value == null) cache.delete(nextKey);
      else cache.set(nextKey, String(value));
      if (confirmedWrite) {
        if (value == null) confirmed.delete(nextKey);
        else confirmed.set(nextKey, String(value));
      }
    }

    function restoreConfirmedItem(key) {
      const nextKey = canonicalKey(key);
      if (confirmed.has(nextKey)) cache.set(nextKey, confirmed.get(nextKey));
      else cache.delete(nextKey);
    }

    function trackWrite(operation) {
      return enqueue(operation);
    }

    function setItem(key, value) {
      if (suspended) return;
      const nextKey = canonicalKey(key);
      if (!isManagedKey(nextKey)) throw new Error(`Chave fora do namespace GSSF: ${key}`);
      const nextValue = String(value ?? '');
      const token = {};
      latestWrite.set(nextKey, token);
      cache.set(nextKey, nextValue);
      enqueue(async () => {
        try {
          await backend.set({ [nextKey]: nextValue });
          confirmed.set(nextKey, nextValue);
          if (latestWrite.get(nextKey) === token) latestWrite.delete(nextKey);
        } catch (error) {
          if (latestWrite.get(nextKey) === token) {
            if (confirmed.has(nextKey)) cache.set(nextKey, confirmed.get(nextKey));
            else cache.delete(nextKey);
            latestWrite.delete(nextKey);
          }
          throw error;
        }
      });
    }

    function removeItem(key) {
      if (suspended) return;
      const nextKey = canonicalKey(key);
      const token = {};
      latestWrite.set(nextKey, token);
      cache.delete(nextKey);
      enqueue(async () => {
        try {
          await backend.remove([nextKey]);
          confirmed.delete(nextKey);
          if (latestWrite.get(nextKey) === token) latestWrite.delete(nextKey);
        } catch (error) {
          if (latestWrite.get(nextKey) === token) {
            if (confirmed.has(nextKey)) cache.set(nextKey, confirmed.get(nextKey));
            latestWrite.delete(nextKey);
          }
          throw error;
        }
      });
    }

    function key(index) {
      return Array.from(cache.keys()).sort()[Number(index)] ?? null;
    }

    function entries() {
      return Array.from(cache.entries()).filter(([key]) => isManagedKey(key)).sort(([a], [b]) => a.localeCompare(b));
    }

    async function clearManaged() {
      await flush();
      const keys = entries().map(([key]) => key);
      if (keys.length) await backend.remove(keys);
      cache.clear();
      confirmed.clear();
      latestWrite.clear();
      return keys;
    }

    async function flush() {
      await writeQueue;
      if (pendingErrors.length) {
        const errors = pendingErrors.splice(0);
        throw new AggregateError(errors, 'Uma ou mais gravações do armazenamento falharam.');
      }
    }

    return {
      NAMESPACE,
      canonicalKey,
      isManagedKey,
      init,
      getItem,
      setCachedItem,
      restoreConfirmedItem,
      trackWrite,
      setItem,
      removeItem,
      key,
      entries,
      clearManaged,
      flush,
      suspendWrites() { suspended = true; },
      resumeWrites() { suspended = false; },
      get writesSuspended() { return suspended; },
      get length() { return cache.size; }
    };
  }
