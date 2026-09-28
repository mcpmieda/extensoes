(function initGssfStorage(global) {
  'use strict';

  const NAMESPACE = 'gssf:';
  const LEGACY_PREFIXES = ['gssf_', 'gssf-'];
  const MIGRATION_VERSION = 14;
  const warnedStorageErrors = new Set();

  function reportStorageError(operation, error) {
    const message = error instanceof Error ? (error.message || error.name) : String(error || 'erro sem detalhes');
    const key = `${operation}|${message}`;
    if (warnedStorageErrors.has(key)) return;
    warnedStorageErrors.add(key);
    console.warn(`[GSSF:storage:${operation}] ${message}`, error);
  }

  function canonicalKey(key) {
    const value = String(key || '');
    if (value.startsWith(NAMESPACE)) return value;
    for (const prefix of LEGACY_PREFIXES) {
      if (value.startsWith(prefix)) return `${NAMESPACE}${value.slice(prefix.length)}`;
    }
    return value;
  }

  function isManagedKey(key) {
    const value = String(key || '');
    return value.startsWith(NAMESPACE) || LEGACY_PREFIXES.some((prefix) => value.startsWith(prefix));
  }


