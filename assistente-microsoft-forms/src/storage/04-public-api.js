  const api = { NAMESPACE, canonicalKey, isManagedKey, mergeMigrationValue, createChromeBackend, createGssfStorageAdapter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global?.chrome?.storage?.local) {
    let legacyStorage = null;
    try { legacyStorage = global.localStorage || null; } catch (error) { reportStorageError('acessar-local-storage-legado', error); }
    global.GSSF_STORAGE = createGssfStorageAdapter({
      backend: createChromeBackend(global.chrome),
      legacyStorage,
      origin: global.location?.origin || ''
    });
  }
  global.GSSF_STORAGE_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
