

  function settingsKey() {
    return GSSF_SETTINGS_KEY;
  }

  function normalizeStandardOptionCounts(value, fallback = [4]) {
    const source = Array.isArray(value) ? value.join(',') : String(value ?? '');
    const counts = [];
    for (const token of source.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean)) {
      if (!/^\d{1,2}$/.test(token)) continue;
      const number = Number(token);
      if (Number.isInteger(number) && number >= 1 && number <= 12 && !counts.includes(number)) counts.push(number);
    }
    return counts.length ? counts : [...fallback];
  }

  function formatStandardOptionCounts(counts) {
    return normalizeStandardOptionCounts(counts).join(', ');
  }

  function normalizeStandardOptionInput(value, fallback = 4) {
    return normalizeStandardOptionCounts(value, [fallback])[0] || fallback;
  }

  function normalizeExpectedQuestionCount(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const number = Math.round(Number(raw.replace(/[^\d]/g, '')));
    return Number.isFinite(number) && number > 0 ? Math.min(999, number) : null;
  }

  function readSettings() {
    try {
      let raw = GSSF_STORAGE.getItem(settingsKey()) || '';
      if (!raw) {
        for (const legacyKey of GSSF_SETTINGS_LEGACY_KEYS) {
          raw = GSSF_STORAGE.getItem(legacyKey) || '';
          if (raw) {
            GSSF_STORAGE.setItem(settingsKey(), raw);
            GSSF_STORAGE.removeItem(legacyKey);
            break;
          }
        }
      }
      const saved = JSON.parse(raw || '{}');
      const standardOptionCounts = normalizeStandardOptionCounts(saved.standardOptionCounts ?? saved.standardOptions ?? 4);
      return {
        standardOptions: standardOptionCounts[0],
        standardOptionCounts,
        expectedQuestionCount: normalizeExpectedQuestionCount(saved.expectedQuestionCount),
        mapBySections: Boolean(saved.mapBySections)
      };
    } catch (error) {
      reportNonFatalError('configuracao:ler', error);
      return { standardOptions: 4, standardOptionCounts: [4], expectedQuestionCount: null, mapBySections: false };
    }
  }

  function readStandardOptionCounts() {
    const input = document.getElementById('gssf-standard-options');
    const saved = readSettings();
    return normalizeStandardOptionCounts(input?.value, saved.standardOptionCounts || [4]);
  }

  function readStandardOptionCount() {
    return readStandardOptionCounts()[0] || 4;
  }

  function readExpectedQuestionCount() {
    const input = document.getElementById('gssf-expected-questions');
    if (input) return normalizeExpectedQuestionCount(input.value);
    return readSettings().expectedQuestionCount;
  }

  function applySettingsToUi() {
    const saved = readSettings();
    const optionInput = document.getElementById('gssf-standard-options');
    const questionInput = document.getElementById('gssf-expected-questions');
    const mapSections = document.getElementById('gssf-map-by-sections');
    if (optionInput) optionInput.value = formatStandardOptionCounts(saved.standardOptionCounts || [4]);
    if (questionInput) questionInput.value = saved.expectedQuestionCount == null ? '' : String(saved.expectedQuestionCount);
    if (mapSections) mapSections.checked = Boolean(saved.mapBySections);
  }

  function handleStandardOptionTyping() {
    const input = document.getElementById('gssf-standard-options');
    if (!input) return;
    const cleaned = String(input.value || '').replace(/[^\d,;\s]/g, '').slice(0, 60);
    if (input.value !== cleaned) input.value = cleaned;
    if (normalizeStandardOptionCounts(cleaned, []).length) scheduleAutoAnalysis(450);
  }

  function saveStandardOptionSetting() {
    const input = document.getElementById('gssf-standard-options');
    const saved = readSettings();
    const counts = normalizeStandardOptionCounts(input?.value, saved.standardOptionCounts || [4]);
    try {
      GSSF_STORAGE.setItem(settingsKey(), JSON.stringify({
        ...saved,
        standardOptions: counts[0],
        standardOptionCounts: counts
      }));
      GSSF_SETTINGS_LEGACY_KEYS.forEach((legacyKey) => GSSF_STORAGE.removeItem(legacyKey));
    } catch (error) {
      reportNonFatalError('configuracao:salvar-opcoes', error);
    }
    if (input) input.value = formatStandardOptionCounts(counts);
    scheduleAutoAnalysis(250);
  }

  function handleExpectedQuestionTyping() {
    const input = document.getElementById('gssf-expected-questions');
    if (!input) return;
    const cleaned = String(input.value || '').replace(/[^\d]/g, '').slice(0, 3);
    if (input.value !== cleaned) input.value = cleaned;
    scheduleAutoAnalysis(450);
  }

  function saveExpectedQuestionSetting() {
    const input = document.getElementById('gssf-expected-questions');
    const saved = readSettings();
    const expectedQuestionCount = normalizeExpectedQuestionCount(input?.value);
    try {
      GSSF_STORAGE.setItem(settingsKey(), JSON.stringify({ ...saved, expectedQuestionCount }));
      GSSF_SETTINGS_LEGACY_KEYS.forEach((legacyKey) => GSSF_STORAGE.removeItem(legacyKey));
    } catch (error) {
      reportNonFatalError('configuracao:salvar-questoes', error);
    }
    if (input) input.value = expectedQuestionCount == null ? '' : String(expectedQuestionCount);
    scheduleAutoAnalysis(250);
  }

  function saveMapSectionSetting() {
    const saved = readSettings();
    const enabled = Boolean(document.getElementById('gssf-map-by-sections')?.checked);
    try {
      GSSF_STORAGE.setItem(settingsKey(), JSON.stringify({ ...saved, mapBySections: enabled }));
      GSSF_SETTINGS_LEGACY_KEYS.forEach((legacyKey) => GSSF_STORAGE.removeItem(legacyKey));
    } catch (error) {
      reportNonFatalError('configuracao:salvar-mapa', error);
    }
    if (APP.lastAudit) updateQuestionMap(APP.lastAudit);
  }

  function resetLetterCapitalizeForNewForm(audit) {
    if (!audit) return;
    const formId = getFormUniqueId(audit);
    if (!formId || APP.letterCapitalizeFormId === formId) return;
    if (!APP.letterCapitalizeFormId) {
      APP.letterCapitalizeFormId = formId;
      return;
    }
    APP.letterCapitalizeFormId = formId;
    const checkbox = document.getElementById('gssf-letter-capitalize');
    if (checkbox) checkbox.checked = false;
  }

  async function cleanAllAppSavedData() {
    const historyWasActive = GSSF_HISTORY_STATE.active;
    GSSF_HISTORY_STATE.active = false;
    try {
      clearTimeout(APP.autoTimer);
      clearTimeout(APP.mutationTimer);
      APP.autoTimer = null;
      APP.mutationTimer = null;
      GSSF_STORAGE.suspendWrites();
      await questionHistoryRequest('clearAll', 'all');
      await globalThis.GSSFAnswerCard?.clearStoredData?.({ resetRuntime: true });
      await globalThis.GSSFPrinting?.clearStoredData?.({ resetRuntime: true });
      await globalThis.GSSFDiagnostic?.clearStoredData?.({ resetRuntime: true });
      await globalThis.GSSFOrganizer?.clearStoredData?.({ resetRuntime: true });
      const removed = await GSSF_STORAGE.clearManaged();
      const out = document.getElementById('gssf-log');
      if (out) out.textContent = '';
      APP.lastAudit = auditPage();
      updateDashboardFromAudit(APP.lastAudit);
      await GSSF_STORAGE.flush();
      if (GSSF_STORAGE.entries().length) throw new Error('A pós-condição da limpeza não foi atendida.');
      log(`Limpeza total concluída. Dados apagados: ${removed.length}.`, false);
      toast('Dados do app limpos.');
      notifyFormsBankChanged('dados do app limpos');
    } catch (error) {
      console.warn('Falha na limpeza total do assistente:', error);
      toast('Não foi possível limpar todos os dados.');
    } finally {
      GSSF_STORAGE.resumeWrites();
      GSSF_HISTORY_STATE.active = historyWasActive;
    }
  }

  async function runClearSavedData() {
    const ok = await askConfirm({
      title: 'Limpar todo o app?',
      message: 'Isso apaga todos os dados salvos pelo assistente: histórico de questões e suas imagens, backups, gabaritos, registros, configurações, alunos, imagens do Cartão-resposta, lotes da Impressão, avaliações do Diagnóstico e dados salvos do Organizador. Para confirmar, digite limpar.',
      confirmText: 'Limpar tudo',
      cancelText: 'Cancelar',
      danger: true,
      requireText: 'limpar'
    });
    if (ok) await cleanAllAppSavedData();
  }
