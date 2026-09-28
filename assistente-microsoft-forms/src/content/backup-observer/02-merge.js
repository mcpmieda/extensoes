

  function parseDateMs(value) {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
  }

  function storedValueTime(value, fallback = 0) {
    try {
      const obj = JSON.parse(String(value || ''));
      return parseDateMs(obj.updatedAt || obj.exportedAt || obj.capturedAt || obj.generatedAt) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function mergeItemId(item, index) {
    if (!item || typeof item !== 'object') return `idx:${index}`;
    return String(item.id || item.key || item.formId && `${item.formId}:${item.signature || ''}` || item.number || item.beforeQuestion || item.title || `idx:${index}`);
  }

  function itemTimeMs(item, fallback = 0) {
    if (!item || typeof item !== 'object') return fallback;
    return parseDateMs(item.updatedAt || item.exportedAt || item.capturedAt || item.generatedAt || item.time || item.date) || fallback;
  }

  function mergeArraysByItem(existing, incoming, existingFallback, incomingFallback) {
    const map = new Map();
    existing.forEach((item, index) => map.set(mergeItemId(item, index), { item, time: itemTimeMs(item, existingFallback) }));
    incoming.forEach((item, index) => {
      const id = mergeItemId(item, index);
      const time = itemTimeMs(item, incomingFallback);
      const current = map.get(id);
      if (!current || time >= current.time) map.set(id, { item, time });
    });
    return Array.from(map.values()).map((entry) => entry.item);
  }

  function preferNewestNonEmpty(existingValue, incomingValue, existingTime, incomingTime) {
    const hasExisting = existingValue !== undefined && existingValue !== null && String(existingValue) !== '';
    const hasIncoming = incomingValue !== undefined && incomingValue !== null && String(incomingValue) !== '';
    if (hasExisting && hasIncoming) return incomingTime >= existingTime ? incomingValue : existingValue;
    if (hasIncoming) return incomingValue;
    if (hasExisting) return existingValue;
    return incomingTime >= existingTime ? incomingValue : existingValue;
  }

  function mergeBankQuestionRecord(existingQuestion, incomingQuestion, existingTime, incomingTime) {
    const base = incomingTime >= existingTime ? { ...(existingQuestion || {}), ...(incomingQuestion || {}) } : { ...(incomingQuestion || {}), ...(existingQuestion || {}) };
    ['originalAnswer', 'manualAnswer', 'importedAnswer'].forEach((field) => {
      base[field] = preferNewestNonEmpty(existingQuestion?.[field], incomingQuestion?.[field], existingTime, incomingTime) || '';
    });
    const existingSourceTime = existingQuestion?.importSource ? existingTime : 0;
    const incomingSourceTime = incomingQuestion?.importSource ? incomingTime : 0;
    base.importSource = preferNewestNonEmpty(existingQuestion?.importSource, incomingQuestion?.importSource, existingSourceTime, incomingSourceTime) || null;
    base.effectiveAnswer = base.manualAnswer || base.importedAnswer || base.originalAnswer || '';
    base.source = base.manualAnswer ? 'manual' : base.importedAnswer ? 'imported' : base.originalAnswer ? 'original' : '';
    base.updatedAt = new Date(Math.max(existingTime || 0, incomingTime || 0, Date.now())).toISOString();
    return base;
  }

  function mergePlainRecords(existing, incoming, existingFallback, incomingFallback) {
    if (Array.isArray(existing) && Array.isArray(incoming)) return mergeArraysByItem(existing, incoming, existingFallback, incomingFallback);
    if (!existing || !incoming || typeof existing !== 'object' || typeof incoming !== 'object' || Array.isArray(existing) || Array.isArray(incoming)) {
      return incomingFallback >= existingFallback ? incoming : existing;
    }
    if (existing.forms && incoming.forms && typeof existing.forms === 'object' && typeof incoming.forms === 'object') {
      const mergedBank = incomingFallback >= existingFallback ? { ...existing, ...incoming } : { ...incoming, ...existing };
      mergedBank.forms = { ...(existing.forms || {}) };
      Object.entries(incoming.forms || {}).forEach(([formId, incomingForm]) => {
        const existingForm = mergedBank.forms[formId];
        if (!existingForm) {
          mergedBank.forms[formId] = incomingForm;
          return;
        }
        const existingTime = parseDateMs(existingForm.lastReadAt || existingForm.updatedAt) || existingFallback;
        const incomingTime = parseDateMs(incomingForm.lastReadAt || incomingForm.updatedAt) || incomingFallback;
        const base = incomingTime >= existingTime ? { ...existingForm, ...incomingForm } : { ...incomingForm, ...existingForm };
        base.questions = { ...(existingForm.questions || {}) };
        Object.entries(incomingForm.questions || {}).forEach(([qNum, incomingQuestion]) => {
          const existingQuestion = base.questions[qNum];
          if (!existingQuestion) {
            base.questions[qNum] = incomingQuestion;
            return;
          }
          const eqTime = parseDateMs(existingQuestion.updatedAt) || existingTime;
          const iqTime = parseDateMs(incomingQuestion.updatedAt) || incomingTime;
          base.questions[qNum] = mergeBankQuestionRecord(existingQuestion, incomingQuestion, eqTime, iqTime);
        });
        base.answerCount = answerCountFromQuestions(base.questions);
        mergedBank.forms[formId] = base;
      });
      mergedBank.updatedAt = new Date(Math.max(existingFallback, incomingFallback, Date.now())).toISOString();
      return mergedBank;
    }
    const sameStructure = (!existing.formId || !incoming.formId || existing.formId === incoming.formId) && (!existing.signature || !incoming.signature || existing.signature === incoming.signature);
    if (!sameStructure) return incomingFallback >= existingFallback ? incoming : existing;
    const base = incomingFallback >= existingFallback ? { ...existing, ...incoming } : { ...incoming, ...existing };
    if (existing.overrides && incoming.overrides && typeof existing.overrides === 'object' && typeof incoming.overrides === 'object') {
      base.overrides = incomingFallback >= existingFallback ? { ...existing.overrides, ...incoming.overrides } : { ...incoming.overrides, ...existing.overrides };
    }
    if (Array.isArray(existing.sections) && Array.isArray(incoming.sections)) {
      base.sections = mergeArraysByItem(existing.sections, incoming.sections, existingFallback, incomingFallback)
        .sort((a, b) => Number(a.order || a.index || a.beforeQuestion || 0) - Number(b.order || b.index || b.beforeQuestion || 0));
    }
    return base;
  }

  function mergeStoredValues(existingValue, incomingValue, existingFallback = 0, incomingFallback = 0) {
    if (!existingValue) return incomingValue;
    try {
      const existing = JSON.parse(String(existingValue || 'null'));
      const incoming = JSON.parse(String(incomingValue || 'null'));
      const existingTime = storedValueTime(existingValue, existingFallback);
      const incomingTime = storedValueTime(incomingValue, incomingFallback);
      return JSON.stringify(mergePlainRecords(existing, incoming, existingTime, incomingTime));
    } catch (_) {
      return incomingFallback >= existingFallback ? incomingValue : existingValue;
    }
  }