  function storedRecordTime(value) {
    try {
      const parsed = JSON.parse(String(value || 'null'));
      const timestamp = parsed?.updatedAt || parsed?.lastReadAt || parsed?.exportedAt || '';
      const milliseconds = Date.parse(timestamp);
      return Number.isFinite(milliseconds) ? milliseconds : 0;
    } catch (_) {
      return 0;
    }
  }

  function mergeFormsBankValues(existingValue, incomingValue) {
    try {
      const existing = JSON.parse(String(existingValue || '{}'));
      const incoming = JSON.parse(String(incomingValue || '{}'));
      if (!existing?.forms || !incoming?.forms) return existingValue || incomingValue;
      const forms = { ...existing.forms };
      Object.entries(incoming.forms).forEach(([formId, incomingForm]) => {
        const current = forms[formId];
        if (!current) {
          forms[formId] = incomingForm;
          return;
        }
        const currentTime = Date.parse(current?.lastReadAt || current?.updatedAt || '') || 0;
        const incomingTime = Date.parse(incomingForm?.lastReadAt || incomingForm?.updatedAt || '') || 0;
        if (incomingTime >= currentTime) forms[formId] = incomingForm;
      });
      const currentUpdated = Date.parse(existing.updatedAt || '') || 0;
      const incomingUpdated = Date.parse(incoming.updatedAt || '') || 0;
      return JSON.stringify({
        ...existing,
        ...incoming,
        version: Math.max(Number(existing.version || 1), Number(incoming.version || 1)),
        format: incoming.format || existing.format || 'formsBank',
        updatedAt: new Date(Math.max(currentUpdated, incomingUpdated, Date.now())).toISOString(),
        forms
      });
    } catch (error) {
      reportStorageError('mesclar-banco', error);
      return existingValue || incomingValue;
    }
  }

  function mergeMigrationValue(key, existingValue, incomingValue) {
    if (existingValue == null) return incomingValue;
    if (incomingValue == null || incomingValue === existingValue) return existingValue;
    const canonical = canonicalKey(key);
    if (canonical.includes('forms_bank_')) return mergeFormsBankValues(existingValue, incomingValue);
    if (canonical.includes('omr_manual_')) {
      return storedRecordTime(incomingValue) >= storedRecordTime(existingValue) ? incomingValue : existingValue;
    }
    return existingValue;
  }

