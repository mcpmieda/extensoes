

  function getManualStorageKey(audit) {
    return `gssf_omr_manual_v10:${getFormUniqueId(audit)}:${getFormSignature(audit)}`;
  }

  function readManualOverrides(audit) {
    try {
      const raw = GSSF_STORAGE.getItem(getManualStorageKey(audit));
      if (!raw) return {};
      const saved = JSON.parse(raw);
      if (!saved || saved.formId !== getFormUniqueId(audit) || saved.signature !== getFormSignature(audit)) return {};
      return saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {};
    } catch (error) {
      reportNonFatalError('marcacoes-manuais:ler', error);
      return {};
    }
  }

  function saveManualOverrides(audit, data) {
    if (isReadOnlyAnswerAudit(audit)) return 0;
    const overrides = {};
    (data || []).forEach((item) => {
      const number = String(item.number);
      if (item.current !== item.original) overrides[number] = item.current || '';
    });
    const key = getManualStorageKey(audit);
    try {
      if (!Object.keys(overrides).length) {
        GSSF_STORAGE.removeItem(key);
        return 0;
      }
      const payload = {
        version: APP.version,
        formId: getFormUniqueId(audit),
        signature: getFormSignature(audit),
        title: cleanText(audit?.title || getFormTitle() || ''),
        updatedAt: new Date().toISOString(),
        overrides
      };
      GSSF_STORAGE.setItem(key, JSON.stringify(payload));
      return Object.keys(overrides).length;
    } catch (error) {
      console.warn('Falha ao salvar marcações manuais:', error);
      return -1;
    }
  }
