

  function getFormUniqueId(audit) {
    const urlText = String(audit?.url || location.href || '');
    try {
      const u = new URL(urlText, location.href);
      for (const key of ['id', 'formid', 'FormId', 'formId']) {
        const value = u.searchParams.get(key);
        if (value) return `id:${value}`;
      }
      const pathId = u.pathname.match(/\/([^/?#]{20,})$/);
      if (pathId) return `path:${pathId[1]}`;
    } catch (_) {}
    return `url:${simpleHash(urlText)}`;
  }

  function simpleHash(value) {
    const text = String(value || '');
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function getFormSignature(audit) {
    const parts = (audit?.questions || []).map((q) => [
      q.number,
      q.totalOptions || 0,
      normalizeText(q.prompt || '').slice(0, 140),
      q.emptyModel ? 'modelo' : 'ok'
    ].join('|'));
    return simpleHash(`${audit?.questions?.length || 0}::${parts.join('||')}`);
  }

  function formsBankKey() {
    return 'gssf_forms_bank_v1';
  }

  function emptyFormsBank() {
    return { version: 1, format: 'formsBank', updatedAt: new Date().toISOString(), forms: {} };
  }

  function readFormsBank() {
    try {
      const raw = GSSF_STORAGE.getItem(formsBankKey()) || GSSF_STORAGE.getItem('gssf_forms_bank_v27') || GSSF_STORAGE.getItem('gssf_forms_bank_v26') || GSSF_STORAGE.getItem('gssf_forms_bank_v25') || GSSF_STORAGE.getItem('gssf_forms_bank_v24') || GSSF_STORAGE.getItem('gssf_forms_bank_v23') || GSSF_STORAGE.getItem('gssf_forms_bank_v22');
      if (!raw) return emptyFormsBank();
      const bank = JSON.parse(raw);
      if (!bank || typeof bank !== 'object') return emptyFormsBank();
      if (!bank.forms || typeof bank.forms !== 'object') bank.forms = {};
      if (!bank.version) bank.version = 1;
      if (!bank.format) bank.format = 'formsBank';
      return bank;
    } catch (error) {
      reportNonFatalError('banco:ler', error);
      return emptyFormsBank();
    }
  }

  function formRecordFingerprint(record) {
    const questions = {};
    Object.keys(record?.questions || {}).sort((a, b) => Number(a) - Number(b)).forEach((key) => {
      const q = record.questions[key] || {};
      questions[key] = {
        questionSignature: q.questionSignature || '',
        promptNormalized: q.promptNormalized || '',
        optionCount: Number(q.optionCount || 0),
        originalAnswer: q.originalAnswer || '',
        manualAnswer: q.manualAnswer || '',
        importedAnswer: q.importedAnswer || '',
        sectionTitle: q.sectionTitle || '',
        sectionIndex: Number.isInteger(q.sectionIndex) ? q.sectionIndex : -1,
        sourceFormId: q.importSource?.formId || '',
        sourceQuestion: q.importSource?.sourceQuestion || ''
      };
    });
    return simpleHash(JSON.stringify({
      title: record?.title || '',
      signature: record?.signature || '',
      questionCount: Number(record?.questionCount || 0),
      answerCount: Number(record?.answerCount || 0),
      optionCount: Number(record?.optionCount || 0),
      imageCount: Number(record?.imageCount || 0),
      questions
    }));
  }

  function notifyFormsBankChanged(reason = 'banco atualizado') {
    try {
      window.dispatchEvent(new CustomEvent('gssf-forms-bank-changed', { detail: { reason } }));
    } catch (_) {}
  }

  function saveFormsBank(bank, reason = 'banco atualizado') {
    try {
      const next = bank && typeof bank === 'object' ? bank : emptyFormsBank();
      if (!next.forms || typeof next.forms !== 'object') next.forms = {};
      next.version = 1;
      next.format = 'formsBank';
      next.updatedAt = new Date().toISOString();
      GSSF_STORAGE.setItem(formsBankKey(), JSON.stringify(next));
      notifyFormsBankChanged(reason);
      return true;
    } catch (error) {
      console.warn('Falha ao salvar banco de gabaritos:', error);
      return false;
    }
  }

  function questionSignature(q) {
    const optionPart = (q?.optionTexts || []).map((text) => normalizeText(text).slice(0, 100)).join('|');
    return simpleHash(`${q?.number || 0}::${normalizeText(q?.prompt || '').slice(0, 220)}::${optionPart}`);
  }

  function cleanQuestionPreview(text, number = 0) {
    let value = cleanText(text)
      .replace(/\b(opção única|opcao unica|única opção|unica opcao|multiple choice|single choice)\b\.?/gi, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (number) value = value.replace(new RegExp(`^${number}\\s*\\.?\\s*`, 'i'), '').trim();
    return value.slice(0, 320);
  }

  function originalAnswerForQuestion(q) {
    return q?.correct?.length === 1 ? letter(q.correct[0]) : '';
  }

  function answerCountFromQuestions(questions) {
    return Object.values(questions || {}).filter((q) => q && (q.manualAnswer || q.importedAnswer || q.originalAnswer)).length;
  }

  function effectiveAnswerOfRecord(q) {
    if (!q) return '';
    return q.manualAnswer || q.importedAnswer || q.originalAnswer || '';
  }

  function answerSourceOfRecord(q) {
    if (!q) return '';
    if (q.manualAnswer) return 'manual';
    if (q.importedAnswer) return 'imported';
    if (q.originalAnswer) return 'original';
    return '';
  }

  function getCurrentFormRecord(audit) {
    const bank = readFormsBank();
    return bank.forms?.[getFormUniqueId(audit)] || null;
  }

  function buildFormBankRecord(audit, previous = null) {
    const formId = getFormUniqueId(audit);
    const now = new Date().toISOString();
    const manual = readManualOverrides(audit);
    const previousQuestions = previous?.questions || {};
    const questions = {};
    (audit?.questions || []).forEach((q) => {
      const key = String(q.number);
      const prev = previousQuestions[key] || {};
      const currentSignature = questionSignature(q);
      const originalAnswer = originalAnswerForQuestion(q);
      const manualAnswer = Object.prototype.hasOwnProperty.call(manual, key) ? String(manual[key] || '') : (prev.manualAnswer || '');
      const importedAnswer = prev.importedAnswer || '';
      const hasCarryover = Boolean(manualAnswer || importedAnswer);
      const shiftRisk = prev.questionSignature && prev.questionSignature !== currentSignature && hasCarryover
        ? { type: 'question-shift', previousSignature: prev.questionSignature, detectedAt: now }
        : null;
      questions[key] = {
        questionNumber: q.number,
        questionSignature: currentSignature,
        textPreview: cleanQuestionPreview(q.prompt || '', q.number),
        promptNormalized: normalizeText(q.prompt || ''),
        options: (q.optionTexts || []).map((text, index) => ({ letter: letter(index), text: cleanText(text).slice(0, 220), normalized: normalizeText(text) })),
        optionCount: q.totalOptions || 0,
        sectionTitle: cleanText(q.sectionTitle || ''),
        sectionIndex: Number.isInteger(q.sectionIndex) ? q.sectionIndex : -1,
        originalAnswer,
        manualAnswer,
        importedAnswer,
        effectiveAnswer: manualAnswer || importedAnswer || originalAnswer || '',
        source: manualAnswer ? 'manual' : importedAnswer ? 'imported' : originalAnswer ? 'original' : '',
        importSource: prev.importSource || null,
        shiftRisk,
        updatedAt: prev.updatedAt || now
      };
      if (prev.importedAnswer && prev.importedAnswer !== importedAnswer) questions[key].updatedAt = now;
      if (prev.manualAnswer !== manualAnswer || prev.originalAnswer !== originalAnswer) questions[key].updatedAt = now;
    });
    const record = {
      formId,
      title: cleanText(audit?.title || getFormTitle() || document.title || 'Forms sem titulo'),
      url: location.href,
      lastReadAt: now,
      questionCount: audit?.questions?.length || 0,
      answerCount: answerCountFromQuestions(questions),
      optionCount: audit?.options || Object.values(questions).reduce((sum, q) => sum + Number(q.optionCount || 0), 0),
      imageCount: audit?.images || 0,
      sectionCount: audit?.sections || 0,
      sectionTitles: Array.isArray(audit?.sectionTitles) ? audit.sectionTitles.map((title) => cleanText(title || '')) : [],
      signature: getFormSignature(audit),
      origin: 'auto',
      formatVersion: 1,
      questions
    };
    record.contentFingerprint = formRecordFingerprint(record);
    return record;
  }

  function saveCurrentFormToBank(audit, reason = 'leitura automática') {
    if (!audit || !audit.questions) return null;
    const bank = readFormsBank();
    const formId = getFormUniqueId(audit);
    const previous = bank.forms[formId] || null;
    const record = buildFormBankRecord(audit, previous);
    if (previous?.contentFingerprint && previous.contentFingerprint === record.contentFingerprint) {
      return previous;
    }
    bank.forms[formId] = record;
    if (saveFormsBank(bank)) {
      const key = `${formId}:${record.signature}:${record.answerCount}:${record.questionCount}`;
      if (APP.lastBankSaveKey !== key) {
        APP.lastBankSaveKey = key;
        log(`Banco de gabaritos atualizado (${reason}). ${record.questionCount} questões; ${record.answerCount} com resposta marcada.`);
      }
    }
    return record;
  }

  function updateBankQuestion(formId, number, updates) {
    const bank = readFormsBank();
    const form = bank.forms?.[formId];
    if (!form) return false;
    const key = String(number);
    form.questions = form.questions || {};
    form.questions[key] = { ...(form.questions[key] || { questionNumber: number }), ...updates, updatedAt: new Date().toISOString() };
    const q = form.questions[key];
    q.effectiveAnswer = q.manualAnswer || q.importedAnswer || q.originalAnswer || '';
    q.source = answerSourceOfRecord(q);
    if (!q.manualAnswer && !q.importedAnswer) q.shiftRisk = null;
    form.answerCount = answerCountFromQuestions(form.questions);
    form.lastReadAt = new Date().toISOString();
    bank.forms[formId] = form;
    return saveFormsBank(bank);
  }