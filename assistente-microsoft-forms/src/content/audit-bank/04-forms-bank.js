

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

  const gssfFormsBankSnapshots = new WeakMap();

  function readFormsBank() {
    try {
      const canonicalRaw = GSSF_STORAGE.getItem(formsBankKey());
      const raw = canonicalRaw || GSSF_STORAGE.getItem('gssf_forms_bank_v27') || GSSF_STORAGE.getItem('gssf_forms_bank_v26') || GSSF_STORAGE.getItem('gssf_forms_bank_v25') || GSSF_STORAGE.getItem('gssf_forms_bank_v24') || GSSF_STORAGE.getItem('gssf_forms_bank_v23') || GSSF_STORAGE.getItem('gssf_forms_bank_v22');
      const bank = raw ? JSON.parse(raw) : emptyFormsBank();
      if (!bank || typeof bank !== 'object' || Array.isArray(bank)) throw new Error('Banco de gabaritos inválido.');
      if (!bank.forms || typeof bank.forms !== 'object') bank.forms = {};
      if (!bank.version) bank.version = 1;
      if (!bank.format) bank.format = 'formsBank';
      gssfFormsBankSnapshots.set(bank, canonicalRaw ? JSON.parse(JSON.stringify(bank)) : { forms: {} });
      return bank;
    } catch (error) {
      reportNonFatalError('banco:ler', error);
      const bank = emptyFormsBank();
      gssfFormsBankSnapshots.set(bank, { forms: {} });
      return bank;
    }
  }

  function formRecordFingerprint(record) {
    const questions = {};
    Object.keys(record?.questions || {}).sort((a, b) => Number(a) - Number(b)).forEach((key) => {
      const q = record.questions[key] || {};
      questions[key] = {
        questionSignature: q.questionSignature || '',
        importEvidence: q.importEvidence || null,
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

  function formsBankPatch(bank) {
    const previous = gssfFormsBankSnapshots.get(bank) || { forms: {} };
    const changes = {};
    const nextForms = bank.forms || {};
    for (const formId of new Set([...Object.keys(previous.forms || {}), ...Object.keys(nextForms)])) {
      const before = previous.forms?.[formId];
      const after = nextForms[formId];
      if (after == null) { changes[formId] = null; continue; }
      const fields = {};
      for (const [key, value] of Object.entries(after)) {
        if (key !== 'questions' && JSON.stringify(value) !== JSON.stringify(before?.[key])) fields[key] = value;
      }
      const questions = {};
      for (const number of new Set([...Object.keys(before?.questions || {}), ...Object.keys(after.questions || {})])) {
        const oldQuestion = before?.questions?.[number];
        const newQuestion = after.questions?.[number];
        if (newQuestion == null) { questions[number] = null; continue; }
        if (oldQuestion == null) { questions[number] = newQuestion; continue; }
        const questionFields = {};
        for (const [key, value] of Object.entries(newQuestion)) {
          if (JSON.stringify(value) !== JSON.stringify(oldQuestion?.[key])) questionFields[key] = value;
        }
        if (Object.keys(questionFields).length) questions[number] = questionFields;
      }
      if (Object.keys(fields).length || Object.keys(questions).length) changes[formId] = { fields, questions };
    }
    return { forms: changes };
  }

  function requestFormsBankPatch(patch) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GSSF_FORMS_BANK_PATCH', patch }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Falha ao salvar banco de gabaritos.'));
        resolve(response.value);
      });
    });
  }

  function saveFormsBank(bank, reason = 'banco atualizado') {
    try {
      const next = bank && typeof bank === 'object' ? bank : emptyFormsBank();
      if (!next.forms || typeof next.forms !== 'object') next.forms = {};
      next.version = 1;
      next.format = 'formsBank';
      next.updatedAt = new Date().toISOString();
      const patch = formsBankPatch(next);
      if (!Object.keys(patch.forms).length) return true;
      const key = formsBankKey();
      GSSF_STORAGE.setCachedItem(key, JSON.stringify(next));
      GSSF_STORAGE.trackWrite(async () => {
        try {
          const saved = await requestFormsBankPatch(patch);
          GSSF_STORAGE.setCachedItem(key, saved, true);
          notifyFormsBankChanged('banco sincronizado');
        } catch (error) {
          GSSF_STORAGE.restoreConfirmedItem(key);
          console.warn('Falha ao salvar banco de gabaritos:', error);
          throw error;
        }
      });
      notifyFormsBankChanged(reason);
      return true;
    } catch (error) {
      console.warn('Falha ao salvar banco de gabaritos:', error);
      return false;
    }
  }

  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    const key = GSSF_STORAGE.canonicalKey(formsBankKey());
    const change = changes?.[key];
    if (!change) return;
    const currentRevision = (() => { try { return Number(JSON.parse(GSSF_STORAGE.getItem(key) || '{}')._gssfBankRevision) || 0; } catch (_) { return 0; } })();
    const nextRevision = (() => { try { return Number(JSON.parse(change.newValue || '{}')._gssfBankRevision) || 0; } catch (_) { return 0; } })();
    if (nextRevision < currentRevision) return;
    GSSF_STORAGE.setCachedItem(key, change.newValue ?? null, true);
    notifyFormsBankChanged('banco atualizado em outra aba');
  });

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

  function originalAnswerForQuestion(q, previous, audit) {
    if (audit?.nativeAnswerKey === false) {
      return previous?.questionSignature === questionSignature(q) ? (previous.originalAnswer || '') : '';
    }
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
    if (isReadOnlyAnswerAudit(audit)) return previous;
    const formId = getFormUniqueId(audit);
    const now = new Date().toISOString();
    const manual = readManualOverrides(audit);
    const previousQuestions = previous?.questions || {};
    const questions = {};
    (audit?.questions || []).forEach((q) => {
      const key = String(q.number);
      const prev = previousQuestions[key] || {};
      const currentSignature = questionSignature(q);
      const originalAnswer = originalAnswerForQuestion(q, prev, audit);
      const manualAnswer = Object.prototype.hasOwnProperty.call(manual, key) ? String(manual[key] || '') : (prev.manualAnswer || '');
      const importedAnswer = prev.importedAnswer || '';
      const hasCarryover = Boolean(manualAnswer || importedAnswer);
      const shiftRisk = prev.questionSignature && prev.questionSignature !== currentSignature && hasCarryover
        ? { type: 'question-shift', previousSignature: prev.questionSignature, detectedAt: now }
        : null;
      questions[key] = {
        questionNumber: q.number,
        questionSignature: currentSignature,
        importEvidence: q.importEvidence || null,
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
    // Ausência de questões na aba Respostas ou durante navegação não é exclusão.
    if (!audit || !audit.questions?.length) return null;
    if (isReadOnlyAnswerAudit(audit)) return null;
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
    if (isReadOnlyAnswerAudit()) return false;
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

  function isReadOnlyAnswerAudit(audit) {
    return Boolean(audit?.mode && audit.mode !== 'edição')
      || (typeof pageMode === 'function' && pageMode() !== 'edição');
  }
