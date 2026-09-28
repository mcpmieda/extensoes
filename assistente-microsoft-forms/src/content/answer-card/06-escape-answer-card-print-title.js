

  function escapeAnswerCardPrintTitle(value) {
    return String(value || 'Cartão-resposta').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function openAnswerCardPrintWindow() {
    try { if (activeAnswerCardPrintWindow && !activeAnswerCardPrintWindow.closed) activeAnswerCardPrintWindow.close(); } catch (_) {}
    const printWindow = globalThis.open('', '_blank', 'popup,width=920,height=760');
    if (!printWindow) throw new Error('O navegador bloqueou a janela de impressão. Permita pop-ups para o Microsoft Forms e tente novamente.');
    activeAnswerCardPrintWindow = printWindow;
    const printDocument = printWindow.document;
    printDocument.open();
    printDocument.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Preparando impressão…</title></head><body></body></html>');
    printDocument.close();
    try { printWindow.opener = null; } catch (_) {}
    return printWindow;
  }

  function writeAnswerCardPrintDocument(printWindow, queueHtml, title) {
    const stylesheetUrl = globalThis.chrome?.runtime?.getURL?.('assets/answer-card-print.css') || '';
    if (!stylesheetUrl) throw new Error('A folha de estilos da impressão não está disponível.');
    const printDocument = printWindow.document;
    printDocument.open();
    printDocument.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeAnswerCardPrintTitle(title)}</title><link rel="stylesheet" href="${stylesheetUrl}"></head><body><main id="crPrintQueue">${queueHtml}</main></body></html>`);
    printDocument.close();
  }

  function waitForPrintStyles(printWindow) {
    const link = printWindow.document.querySelector('link[rel="stylesheet"]');
    if (!link || link.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => resolve();
      link.addEventListener('load', finish, { once: true });
      link.addEventListener('error', finish, { once: true });
      setTimeout(finish, 4000);
    });
  }

  function monitorAnswerCardPrintWindow(printWindow) {
    let finished = false;
    let monitor = 0;
    let fallback = 0;
    const listeners = [];
    const add = (target, type, handler, options) => {
      try { target?.addEventListener?.(type, handler, options); listeners.push([target, type, handler, options]); } catch (_) {}
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(monitor);
      clearTimeout(fallback);
      listeners.forEach(([target, type, handler, options]) => { try { target?.removeEventListener?.(type, handler, options); } catch (_) {} });
      if (els.printQueue) els.printQueue.innerHTML = '';
      hideToast();
      try { if (printWindow && !printWindow.closed) printWindow.close(); } catch (_) {}
      if (activeAnswerCardPrintWindow === printWindow) activeAnswerCardPrintWindow = null;
      if (activeAnswerCardPrintSession?.finish === finish) activeAnswerCardPrintSession = null;
      updateActionButtons();
    };
    add(printWindow, 'afterprint', finish, { once: true });
    add(printWindow, 'beforeunload', finish, { once: true });
    add(printWindow, 'pagehide', finish, { once: true });
    monitor = setInterval(() => { try { if (printWindow.closed) finish(); } catch (_) { finish(); } }, 400);
    fallback = setTimeout(finish, 300000);
    return { finish, get finished() { return finished; } };
  }

  async function printStudents(students) {
    const valid = (students || []).filter(Boolean);
    if (!valid.length) return;
    const over99 = valid.filter((student) => student.number > 99);
    if (over99.length && !confirm(`${over99.length} aluno(s) possuem número acima de 99. O Roll No usará os dois últimos dígitos. Continuar?`)) return;

    try { activeAnswerCardPrintSession?.finish?.(); } catch (_) {}
    activeAnswerCardPrintSession = null;
    let printWindow;
    try { printWindow = openAnswerCardPrintWindow(); } catch (error) { showToast(error?.message || 'Não foi possível abrir a impressão.'); return; }

    els.printQueue.innerHTML = valid.map((student) => frontPageHtml(student) + backPageHtml()).join('');
    showToast(`Preparando ${valid.length} aluno(s), frente e verso…`);
    try {
      await waitForImages(els.printQueue);
      if (document.fonts?.ready) await document.fonts.ready;
      fitStudentNames(els.printQueue);
      const queueHtml = els.printQueue.innerHTML;
      els.printQueue.innerHTML = '';
      const classLabel = state.selectedClass || valid[0]?.className || 'Turma';
      writeAnswerCardPrintDocument(printWindow, queueHtml, `Cartão-resposta — ${classLabel}`);
      await waitForPrintStyles(printWindow);
      await waitForImages(printWindow.document);
      if (printWindow.document.fonts?.ready) await printWindow.document.fonts.ready;
      fitStudentNames(printWindow.document);
      const session = monitorAnswerCardPrintWindow(printWindow);
      activeAnswerCardPrintSession = session;
      hideToast();
      setTimeout(() => {
        if (session.finished) return;
        try {
          printWindow.focus();
          printWindow.print();
        } catch (_) {
          showToast('Não foi possível abrir a caixa de impressão.');
        } finally {
          setTimeout(session.finish, 180);
        }
      }, 160);
    } catch (error) {
      els.printQueue.innerHTML = '';
      try { activeAnswerCardPrintSession?.finish?.(); } catch (_) {}
      activeAnswerCardPrintSession = null;
      try { if (!printWindow.closed) printWindow.close(); } catch (_) {}
      if (activeAnswerCardPrintWindow === printWindow) activeAnswerCardPrintWindow = null;
      showToast(error?.message || 'Não foi possível preparar as folhas para impressão.');
    }
  }

  function waitForImages(container) {
    return Promise.all([...container.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = image.onerror = resolve; })));
  }

  function removeLegacyPhraseInstruction(html) {
    return String(html || '').replace(/<br>\s*<b>\s*6\.\s*<\/b>\s*Transcreva a frase que está na\s*<b>\s*CAPA DO CADERNO DE QUESTÕES\s*<\/b>\s*no quadro abaixo indicado\.\s*(?=<\/p>)/i, '');
  }

  function updateStorageStatus(mode, text) {
    if (!els.storageStatus) return;
    els.storageStatus.classList.remove('ready','warn');
    if (mode) els.storageStatus.classList.add(mode);
    const span = els.storageStatus.querySelector('span'); if (span) span.textContent = text;
  }
  function mediaRequest(action, key = '', value = '') {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) { reject(new Error('Armazenamento da extensão indisponível.')); return; }
      chrome.runtime.sendMessage({ type: 'GSSF_PEDAGOGICAL_MEDIA', action, key, value }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) { reject(new Error(runtimeError.message)); return; }
        if (!response?.ok) { reject(new Error(response?.error || 'Falha no armazenamento de mídia.')); return; }
        resolve(response);
      });
    });
  }

  async function restoreStoredMedia() {
    updateStorageStatus('', 'Verificando armazenamento permanente da extensão…');
    try {
      const response = await mediaRequest('getAll');
      const values = response.values || {};
      MEDIA_KEYS.forEach((key) => {
        const value = values[key];
        if (typeof value === 'string' && value.startsWith('data:image/')) state[key] = value;
      });
      state.mediaStorageAvailable = true;
      updateStorageStatus('ready', 'Imagens personalizadas salvas no armazenamento nativo da extensão.');
    } catch (error) {
      console.warn('Armazenamento de imagens indisponível:', error);
      state.mediaStorageAvailable = false;
      updateStorageStatus('warn', 'As imagens personalizadas permanecerão somente nesta sessão.');
    }
  }

  function mediaValue(key) {
    if (key === 'logo') return state.logo === DEFAULTS.logo ? '' : state.logo;
    if (key === 'omr') return state.omr === DEFAULTS.omr ? '' : state.omr;
    return state[key] || '';
  }

  function markMediaDirty(...keys) { keys.filter((key) => MEDIA_KEYS.includes(key)).forEach((key) => state.mediaDirty.add(key)); }

  function enqueueMediaWrite(task) {
    mediaWriteQueue = mediaWriteQueue.then(task, task);
    return mediaWriteQueue;
  }

  function persistDirtyMedia() {
    if (!state.mediaStorageAvailable || !state.mediaDirty.size) return mediaWriteQueue;
    const dirty = [...state.mediaDirty];
    state.mediaDirty.clear();
    return enqueueMediaWrite(async () => {
      try {
        for (const key of dirty) {
          const value = mediaValue(key);
          await mediaRequest(value ? 'set' : 'delete', key, value);
        }
        updateStorageStatus('ready', 'Imagens personalizadas salvas no armazenamento nativo da extensão.');
      } catch (error) {
        console.warn('Falha ao salvar imagens:', error);
        dirty.forEach((key) => state.mediaDirty.add(key));
        updateStorageStatus('warn', 'Não foi possível salvar as imagens permanentemente.');
      }
    });
  }

  async function clearStoredMedia({ strict = false } = {}) {
    state.mediaDirty.clear();
    try {
      await mediaWriteQueue.catch(() => {});
      await mediaRequest('clear');
      const verification = await mediaRequest('getAll');
      if (Object.keys(verification.values || {}).length) throw new Error('A pós-condição da limpeza das imagens não foi atendida.');
      updateStorageStatus('ready', 'Imagens personalizadas removidas; modelos originais ativos.');
    } catch (error) {
      console.warn('Não foi possível limpar as imagens persistidas:', error);
      updateStorageStatus('warn', 'Não foi possível confirmar a limpeza das imagens.');
      if (strict) throw error;
    }
  }
  async function optimizeImageDataUri(uri, kind) {
    const image=await loadImage(uri);
    const limits = kind==='logo' ? {w:1600,h:900,q:.9,type:'image/webp'} : kind==='omr' ? {w:2600,h:1800,q:.94,type:'image/png'} : {w:2200,h:3200,q:.9,type:'image/webp'};
    const scale=Math.min(1,limits.w/Math.max(1,image.naturalWidth),limits.h/Math.max(1,image.naturalHeight));
    if (scale>=.999 && uri.length<1_800_000) return uri;
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d',{alpha:true}); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const optimized=canvas.toDataURL(limits.type,limits.q); return optimized.startsWith('data:image/')?optimized:canvas.toDataURL('image/png');
  }

  function restoreStoredSettings() {
    try {
      const raw = globalThis.GSSF_STORAGE?.getItem?.(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.mapping) state.mapping = {
        name: clampInt(saved.mapping.name, 0, 701, 3),
        label: clampInt(saved.mapping.label, 0, 701, 0),
        number: clampInt(saved.mapping.number, 0, 701, 2),
        className: clampInt(saved.mapping.className, 0, 701, 4)
      };
      state.headerRow = clampInt(saved.headerRow, 1, 100, 1);
      state.startRow = clampInt(saved.startRow, 1, 500, 2);
      state.endRow = clampInt(saved.endRow, state.startRow, 500, 47);
      state.omrFit = ['contain','width','stretch'].includes(saved.omrFit) ? saved.omrFit : 'contain';
      const savedOmrScale = Number(saved.omrScale);
      const savedOmrOffsetX = Number(saved.omrOffsetX);
      const savedOmrOffsetY = Number(saved.omrOffsetY);
      const legacyOmrWasUntouched = Number(saved.omrAdjustmentVersion) !== OMR_ADJUSTMENT_VERSION &&
        (!Number.isFinite(savedOmrScale) || Math.abs(savedOmrScale - 1) < .0001) &&
        (!Number.isFinite(savedOmrOffsetX) || Math.abs(savedOmrOffsetX) < .0001) &&
        (!Number.isFinite(savedOmrOffsetY) || Math.abs(savedOmrOffsetY) < .0001);
      const previousDefaultWasUntouched = Number(saved.omrAdjustmentVersion) === 2 &&
        Math.abs((Number.isFinite(savedOmrScale) ? savedOmrScale : 1) - 1) < .0001 &&
        Math.abs(Number.isFinite(savedOmrOffsetX) ? savedOmrOffsetX : 0) < .0001 &&
        Math.abs((Number.isFinite(savedOmrOffsetY) ? savedOmrOffsetY : .06) - .06) < .0001;
      const useCurrentOmrDefaults = legacyOmrWasUntouched || previousDefaultWasUntouched;
      state.omrScale = useCurrentOmrDefaults ? DEFAULT_OMR_ADJUSTMENT.scale : Math.min(1.2, Math.max(.7, Number.isFinite(savedOmrScale) ? savedOmrScale : DEFAULT_OMR_ADJUSTMENT.scale));
      state.omrOffsetX = useCurrentOmrDefaults ? DEFAULT_OMR_ADJUSTMENT.offsetX : Math.min(.2, Math.max(-.2, Number.isFinite(savedOmrOffsetX) ? savedOmrOffsetX : DEFAULT_OMR_ADJUSTMENT.offsetX));
      state.omrOffsetY = useCurrentOmrDefaults ? DEFAULT_OMR_ADJUSTMENT.offsetY : Math.min(.24, Math.max(-.16, Number.isFinite(savedOmrOffsetY) ? savedOmrOffsetY : DEFAULT_OMR_ADJUSTMENT.offsetY));
      state.classBarOffsetY = Math.min(12, Math.max(-12, Number(saved.classBarOffsetY) || DEFAULT_CLASS_BAR_OFFSET_Y));
      state.zoom = Math.min(1.8, Math.max(.5, Number(saved.zoom) || 1));
      state.instructionLeft = saved.instructionLeft || DEFAULTS.instructionLeft;
      state.instructionRight = removeLegacyPhraseInstruction(saved.instructionRight || DEFAULTS.instructionRight);
      state.cardTitle = saved.cardTitle || DEFAULTS.cardTitle;
      state.cardSubtitle = saved.cardSubtitle || DEFAULTS.cardSubtitle;
      state.instructionSectionOpen = saved.instructionSectionOpen !== undefined ? Boolean(saved.instructionSectionOpen) : false;
      state.frontContentMode = saved.frontContentMode === 'performance' ? 'performance' : 'instructions';
      state.savedClass = cleanCell(saved.selectedClass);
      state.savedStudentNumber = Number.isFinite(Number(saved.selectedStudentNumber)) ? Number(saved.selectedStudentNumber) : null;
      state.customFrontName = cleanCell(saved.customFrontName);
      state.customBackName = cleanCell(saved.customBackName);
    } catch (error) {
      console.warn('Configurações não restauradas:', error);
      state.storageAvailable = false;
    }
  }

  function syncSettingsControls() {
    els.headerRow.value = String(state.headerRow);
    els.startRow.value = String(state.startRow);
    els.endRow.value = String(state.endRow);
    els.omrFit.value = state.omrFit;
    syncChoiceSwitch('crOmrFit', state.omrFit);
    syncChoiceSwitch('crCustomPageSide', els.customPageSide.value);
    els.omrScale.value = String(Math.round(state.omrScale * 100));
    els.omrScaleValue.textContent = `${Math.round(state.omrScale * 100)}%`;
    els.omrScaleX.value = String(Math.round(state.omrOffsetX * 100));
    els.omrScaleXValue.textContent = `${Math.round(state.omrOffsetX * 100)}%`;
    const visibleOmrOffsetY = Math.round((state.omrOffsetY - OMR_VERTICAL_CALIBRATION) * 100);
    const clampedVisibleOmrOffsetY = Math.min(20, Math.max(-20, visibleOmrOffsetY));
    els.omrScaleY.value = String(clampedVisibleOmrOffsetY);
    els.omrScaleYValue.textContent = `${clampedVisibleOmrOffsetY}%`;
    if (els.classBarY) els.classBarY.value = String(state.classBarOffsetY);
    if (els.classBarYValue) els.classBarYValue.textContent = `${formatCompactNumber(state.classBarOffsetY)} mm`;
    els.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    els.zoomOut.disabled = state.zoom <= .5;
    els.zoomIn.disabled = state.zoom >= 1.8;
    if (els.instructionSection) els.instructionSection.open = state.instructionSectionOpen;
    if (els.studentsRangeHint) els.studentsRangeHint.textContent = `Linhas ${state.startRow} a ${state.endRow}; linhas vazias não são exibidas.`;
    if (els.frontContentMode) els.frontContentMode.value = state.frontContentMode;
    syncChoiceSwitch('crFrontContentMode', state.frontContentMode);
    updateFrontContentStatus();
    updateCustomPageStatus();
  }