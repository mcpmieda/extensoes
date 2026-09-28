

  async function readBackupFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    const fileTime = parseDateMs(payload?.exportedAt) || (file.lastModified || Date.now());
    const entries = [];
    if (payload?.storage && typeof payload.storage === 'object') {
      entries.push(...Object.entries(payload.storage)
        .filter(([key]) => GSSF_STORAGE.isManagedKey(key))
        .map(([key, value]) => {
          const canonicalKey = GSSF_STORAGE.canonicalKey(key);
          const sanitizedValue = sanitizeBackupStorageValue(canonicalKey, value);
          return { key: canonicalKey, value: sanitizedValue, time: storedValueTime(sanitizedValue, fileTime), file: file.name };
        }));
    } else if ((payload?.format === 'formsBank' || payload?.forms) && typeof payload === 'object') {
      const bank = { ...emptyFormsBank(), ...payload, format: 'formsBank', forms: payload.forms || {} };
      entries.push({ key: GSSF_STORAGE.canonicalKey(formsBankKey()), value: JSON.stringify(bank), time: storedValueTime(JSON.stringify(bank), fileTime), file: file.name });
    } else {
      throw new Error(`Arquivo inválido: ${file.name}`);
    }
    const media = {};
    Object.entries(payload?.pedagogicalMedia || {}).forEach(([key, value]) => {
      if (!['logo','omr','customFront','customBack'].includes(key)) return;
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(String(value || ''))) return;
      media[key] = { value: String(value), time: fileTime, file: file.name };
    });
    return { entries, media };
  }

  async function importAllSavedData(event) {
    const input = event?.target || document.getElementById('gssf-import-file');
    const files = Array.from(input?.files || []);
    if (!files.length) return;
    try {
      const allEntries = [];
      const mediaByKey = new Map();
      for (const file of files) {
        const parsed = await readBackupFile(file);
        allEntries.push(...parsed.entries);
        Object.entries(parsed.media).forEach(([key, entry]) => {
          const current = mediaByKey.get(key);
          if (!current || entry.time >= current.time) mediaByKey.set(key, entry);
        });
      }
      if (!allEntries.length && !mediaByKey.size) throw new Error('Nenhuma configuração do assistente foi encontrada nos arquivos.');
      const grouped = new Map();
      allEntries.forEach((entry) => {
        if (!grouped.has(entry.key)) grouped.set(entry.key, []);
        grouped.get(entry.key).push(entry);
      });
      const mediaText = mediaByKey.size ? ` e ${pluralPt(mediaByKey.size, 'imagem personalizada', 'imagens personalizadas')}` : '';
      const ok = await askConfirm({
        title: 'Importar backup?',
        message: `Vou importar ${pluralPt(allEntries.length, 'registro', 'registros')}${mediaText} de ${pluralPt(files.length, 'arquivo', 'arquivos')}. Dados atuais e backups serão mesclados; respostas manuais/importadas mais recentes serão preservadas. Planilhas originais do Cartão-resposta e do Organizador, arquivos Excel da Impressão e relatórios do EvalBee não fazem parte do backup.`,
        confirmText: 'Importar backup',
        cancelText: 'Cancelar'
      });
      if (!ok) return;
      let applied = 0;
      grouped.forEach((entries, key) => {
        try {
          let merged = GSSF_STORAGE.getItem(key) || '';
          const before = merged;
          entries.sort((a, b) => a.time - b.time).forEach((entry) => {
            merged = mergeStoredValues(merged, entry.value, storedValueTime(merged, 0), entry.time);
          });
          if (merged && merged !== before) {
            GSSF_STORAGE.setItem(key, merged);
            applied += entries.length;
          }
        } catch (error) {
          reportNonFatalError('backup:mesclar-registro', error, { key });
        }
      });
      for (const [key, entry] of mediaByKey) {
        try { await pedagogicalMediaRequest('set', key, entry.value); }
        catch (error) { reportNonFatalError('backup:restaurar-midia', error, { key }); }
      }
      await GSSF_STORAGE.flush();
      const modules = [globalThis.GSSFAnswerCard, globalThis.GSSFPrinting, globalThis.GSSFDiagnostic, globalThis.GSSFOrganizer].filter(Boolean);
      for (const moduleApi of modules) {
        try { await moduleApi.reloadBackupState?.(); }
        catch (error) { reportNonFatalError('backup:recarregar-modulo', error); }
      }
      log(`Backup importado. ${pluralPt(applied, 'registro aplicado ou mesclado', 'registros aplicados ou mesclados')}${mediaByKey.size ? `; ${pluralPt(mediaByKey.size, 'imagem restaurada', 'imagens restauradas')}` : ''}.`);
      toast('Backup importado.');
      notifyFormsBankChanged('backup importado');
      scheduleAutoAnalysis(150);
    } catch (error) {
      console.warn(error);
      log(`Erro ao importar backup: ${error.message || error}`);
      toast('Arquivo de backup inválido.');
    } finally {
      if (input) input.value = '';
    }
  }

  function downloadDiagnostic() {
    const diagnostic = buildDiagnostic();
    downloadFile(`diagnostico-tecnico-forms-v${GSSF_VERSION.replace(/\./g, '-')}.json`, JSON.stringify(diagnostic, null, 2), 'application/json;charset=utf-8');
    log('Dados técnicos baixados.');
    toast('Dados baixados.');
  }