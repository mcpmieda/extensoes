  // ===== 90-backup-observer.js =====
// Fonte modular: backup observer.
  function rectInfo(el) {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + scrollY), left: Math.round(r.left + scrollX), width: Math.round(r.width), height: Math.round(r.height) };
  }

  async function flushBackupState() {
    const modules = [
      globalThis.GSSFAnswerCard,
      globalThis.GSSFPrinting,
      globalThis.GSSFDiagnostic,
      globalThis.GSSFOrganizer
    ].filter(Boolean);
    for (const moduleApi of modules) {
      try { await moduleApi.flushBackupState?.(); }
      catch (error) { reportNonFatalError('backup:sincronizar-modulo', error); }
    }
    await GSSF_STORAGE.flush();
  }

  function pedagogicalMediaRequest(action, key = '', value = '') {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve({ ok: true, values: {} });
        return;
      }
      chrome.runtime.sendMessage({ type: 'GSSF_PEDAGOGICAL_MEDIA', action, key, value }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) { reject(new Error(runtimeError.message)); return; }
        if (!response?.ok) { reject(new Error(response?.error || 'Falha no armazenamento de mídia.')); return; }
        resolve(response);
      });
    });
  }

  async function collectPedagogicalMediaForBackup() {
    try {
      const response = await pedagogicalMediaRequest('getAll');
      return Object.fromEntries(
        Object.entries(response.values || {})
          .filter(([key, value]) => ['logo','omr','customFront','customBack'].includes(key) && /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(value || '')))
      );
    } catch (error) {
      reportNonFatalError('backup:ler-midias-cartao', error);
      return {};
    }
  }

  function sanitizeBackupStorageValue(key, value) {
    const canonical = GSSF_STORAGE.canonicalKey(key);
    const excludedFields = {
      'gssf:pedagogical:card:settings': ['selectedClass', 'selectedStudentNumber'],
      'gssf:impressao_notas_v1': ['hiddenLotIds', 'activeLotId', 'compareLotId', 'savedDatasetKey', 'savedRoll'],
      'gssf:pedagogico_settings_v1': ['activeBatchId', 'compareBatchId', 'hiddenBatchIds', 'selectedClass', 'selectedStudent', 'excludedStudents']
    }[canonical];
    if (!excludedFields) return String(value ?? '');
    try {
      const parsed = JSON.parse(String(value || 'null'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return String(value ?? '');
      const sanitized = { ...parsed };
      excludedFields.forEach((field) => { delete sanitized[field]; });
      return JSON.stringify(sanitized);
    } catch (_) {
      return String(value ?? '');
    }
  }

  function isPortableBackupStorageKey(key) {
    if (!GSSF_STORAGE.isManagedKey(key)) return false;
    const canonical = GSSF_STORAGE.canonicalKey(key);
    return !/^gssf:(?:storage_migration_v\d+|(?:printingLots|diagnosticBatches)_idb_migrated_v\d+)(?::|$)/.test(canonical);
  }

  async function collectAllSavedData() {
    await flushBackupState();
    const values = {};
    GSSF_STORAGE.entries().forEach(([key, value]) => {
      if (isPortableBackupStorageKey(key)) values[GSSF_STORAGE.canonicalKey(key)] = sanitizeBackupStorageValue(key, value);
    });
    try {
      values[GSSF_STORAGE.canonicalKey(formsBankKey())] = JSON.stringify(readFormsBank());
    } catch (error) {
      reportNonFatalError('backup:serializar-banco', error);
    }
    const bank = readFormsBank();
    const pedagogicalMedia = await collectPedagogicalMediaForBackup();
    return {
      app: APP.name,
      version: APP.version,
      backupFormat: 'gssf-backup-v4',
      storageNamespace: GSSF_STORAGE.NAMESPACE,
      exportedAt: new Date().toISOString(),
      exportedAtText: new Date().toLocaleString('pt-BR'),
      url: location.href,
      title: getFormTitle() || document.title,
      formsBankSummary: {
        forms: Object.keys(bank.forms || {}).length,
        answers: Object.values(bank.forms || {}).reduce((sum, form) => sum + answerCountFromQuestions(form?.questions || {}), 0),
        updatedAt: bank.updatedAt || ''
      },
      backupScope: {
        managedStorage: true,
        answerCardMedia: true,
        answerCardWorkbook: false,
        printingSourceFiles: false,
        printingEvalbeeRecords: false,
        diagnosticEvalbeeRecords: false,
        organizerSourceFiles: false,
        excludedDatabases: ['gssf_impressao_lotes_db_v1', 'gssf_pedagogico_db_v1'],
        excludedDatasetReferences: true,
        excludedMigrationMarkers: true,
        note: 'O backup inclui dados persistentes e preferências do sistema, além das imagens personalizadas do Cartão-resposta e das edições salvas do Organizador. As planilhas originais do Cartão-resposta e do Organizador, os arquivos Excel da Impressão e os registros importados do EvalBee não são incluídos.'
      },
      moduleCoverage: {
        gabarito: 'banco de formulários, respostas e configurações gerenciadas',
        cartaoResposta: 'configurações, textos, layout e imagens personalizadas; sem planilha de alunos',
        impressao: 'preferências, layout, componentes e configurações pedagógicas; sem arquivos ou lotes importados do EvalBee',
        diagnostico: 'preferências, disciplinas, meta, filtros e cadastros de relatórios; sem avaliações importadas do EvalBee',
        organizador: 'preferências, cabeçalho personalizado e edições salvas por planilha; sem o arquivo XLSX original'
      },
      pedagogicalMedia,
      storage: values
    };
  }

  async function exportAllSavedData() {
    const button = document.getElementById('gssf-export-data');
    const previousText = button?.textContent || 'Baixar backup';
    if (button) { button.disabled = true; button.textContent = 'Preparando backup…'; }
    try {
      const payload = await collectAllSavedData();
      const safeTitle = normalizeText(payload.title || 'simulado').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'simulado';
      downloadFile(`simulados-forms-backup-${safeTitle}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      log('Backup consolidado exportado.');
      toast('Backup baixado.');
    } catch (error) {
      reportNonFatalError('backup:exportar', error);
      log(`Erro ao baixar backup: ${error.message || error}`);
      toast('Não foi possível gerar o backup.');
    } finally {
      if (button) { button.disabled = false; button.textContent = previousText; }
    }
  }
