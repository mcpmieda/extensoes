

  function importedItemsForAudit(audit) {
    const bank = readFormsBank();
    const form = bank.forms?.[getFormUniqueId(audit)];
    const data = reportAnswerData(audit).filter((item) => item.imported || item.importSource);
    return data.map((item) => {
      const q = form?.questions?.[String(item.number)] || {};
      const auditQuestion = audit.questions.find((question) => Number(question.number) === Number(item.number));
      return {
        ...item,
        preview: cleanQuestionPreview(q.textPreview || auditQuestion?.prompt || '', item.number),
        sourceTitle: item.importSource?.title || q.importSource?.title || 'Forms salvo'
      };
    }).sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  }

  function renderClearImportedList(audit) {
    const modal = document.getElementById('gssf-modal');
    const currentPane = modal?.querySelector('#gssf-omr-current');
    if (!currentPane) return;
    currentPane.querySelector('#gssf-clear-imported-panel')?.remove();
    const imported = importedItemsForAudit(audit);
    const rows = imported.length ? imported.map((item) => `<label class="gssf-clear-imported-row">
        <input type="checkbox" data-q="${escapeHtml(item.number)}" checked>
        <b>Questão ${escapeHtml(item.number)}</b>
        <span>Importada: ${escapeHtml(item.imported || item.current || '')}</span>
        <em>${escapeHtml(item.preview || `Importada de ${item.sourceTitle}`)}</em>
      </label>`).join('') : '<p class="gssf-muted">Este Forms atual não tem respostas importadas para limpar.</p>';
    const panel = document.createElement('section');
    panel.id = 'gssf-clear-imported-panel';
    panel.className = 'gssf-clear-imported-panel';
    panel.innerHTML = `<div class="gssf-clear-imported-head">
      <div><strong>Limpar respostas importadas</strong><span>Escolha somente as questões que deseja limpar.</span></div>
      <button type="button" class="gssf-icon" id="gssf-clear-imported-close" title="Fechar lista" aria-label="Fechar lista">×</button>
    </div>
    <div class="gssf-clear-imported-actions"><button type="button" class="gssf-btn" id="gssf-clear-imported-toggle">Desmarcar todas</button><button type="button" class="gssf-btn ok" id="gssf-clear-imported-selected" ${imported.length ? '' : 'disabled'}>Limpar selecionadas</button></div>
    <div class="gssf-clear-imported-list">${rows}</div>`;
    currentPane.prepend(panel);
    currentPane.scrollTop = 0;
    panel.querySelector('#gssf-clear-imported-close')?.addEventListener('click', () => panel.remove());
    const syncToggle = () => {
      const boxes = Array.from(panel.querySelectorAll('.gssf-clear-imported-row input'));
      const allChecked = boxes.length && boxes.every((input) => input.checked);
      const toggle = panel.querySelector('#gssf-clear-imported-toggle');
      const clear = panel.querySelector('#gssf-clear-imported-selected');
      if (toggle) toggle.textContent = allChecked ? 'Desmarcar todas' : 'Marcar todas';
      if (clear) clear.disabled = !boxes.some((input) => input.checked);
    };
    panel.querySelector('#gssf-clear-imported-toggle')?.addEventListener('click', () => {
      const boxes = Array.from(panel.querySelectorAll('.gssf-clear-imported-row input'));
      const allChecked = boxes.length && boxes.every((input) => input.checked);
      boxes.forEach((input) => { input.checked = !allChecked; });
      syncToggle();
    });
    panel.querySelectorAll('.gssf-clear-imported-row input').forEach((input) => input.addEventListener('change', syncToggle));
    panel.querySelector('#gssf-clear-imported-selected')?.addEventListener('click', async () => {
      const selected = Array.from(panel.querySelectorAll('.gssf-clear-imported-row input:checked')).map((input) => Number(input.dataset.q)).filter(Boolean);
      if (!selected.length) { toast('Selecione ao menos uma questão.'); return; }
      const count = clearImportedAnswersForAudit(audit, selected);
      log(`Respostas importadas removidas deste Forms: ${count}.`);
      toast(`Importadas removidas: ${count}`);
      updateInlineReport(audit);
      renderOmrMainIntoModal(audit);
      renderImportSourceList(audit, { sourceFormId: APP.omrImportState.sourceFormId, message: '' });
    });
    syncToggle();
  }

  function clearImportedAnswersForAudit(audit, questionNumbers = null) {
    const formId = getFormUniqueId(audit);
    const bank = readFormsBank();
    const form = bank.forms?.[formId];
    if (!form?.questions) return 0;
    const allowed = Array.isArray(questionNumbers) && questionNumbers.length ? new Set(questionNumbers.map((n) => Number(n))) : null;
    let count = 0;
    Object.entries(form.questions).forEach(([key, q]) => {
      const number = Number(q.questionNumber || key);
      if (allowed && !allowed.has(number)) return;
      if (q.importedAnswer || q.importSource) {
        q.importedAnswer = '';
        q.importSource = null;
        q.effectiveAnswer = q.manualAnswer || q.originalAnswer || '';
        q.source = answerSourceOfRecord(q);
        q.updatedAt = new Date().toISOString();
        count += 1;
      }
    });
    form.answerCount = answerCountFromQuestions(form.questions);
    form.lastReadAt = new Date().toISOString();
    saveFormsBank(bank);
    return count;
  }

  function clearManualAnswersForAudit(audit) {
    const key = getManualStorageKey(audit);
    try { GSSF_STORAGE.removeItem(key); } catch (_) {}
    const formId = getFormUniqueId(audit);
    const bank = readFormsBank();
    const form = bank.forms?.[formId];
    let count = 0;
    if (form?.questions) {
      Object.values(form.questions).forEach((q) => {
        if (q.manualAnswer) {
          q.manualAnswer = '';
          q.effectiveAnswer = q.importedAnswer || q.originalAnswer || '';
          q.source = answerSourceOfRecord(q);
          q.updatedAt = new Date().toISOString();
          count += 1;
        }
      });
      form.answerCount = answerCountFromQuestions(form.questions);
      form.lastReadAt = new Date().toISOString();
      saveFormsBank(bank);
    }
    return count;
  }

  function attachReportInteractivity(targetWindow, audit) {
    if (!targetWindow || targetWindow.closed) return;
    let doc;
    try { doc = targetWindow.document; } catch (_) { return; }
    const root = doc.getElementById('omr-sheet');
    if (!root) return;
    const isMainDocument = doc === document;
    const data = reportAnswerData(audit);

    function updateAuditSummary() {
      const auditBox = doc.querySelector('.gssf-omr-audit');
      if (auditBox) auditBox.outerHTML = buildOmrAuditHtml(audit, data);
      const bankSummary = doc.querySelector('.gssf-omr-bank-summary');
      if (bankSummary) bankSummary.outerHTML = omrBankSummaryHtml(audit);
      bindAuditActionButtons();
    }

    function updateChangedInfo() {
      updateAuditSummary();
      const panel = doc.getElementById('omr-change-panel');
      if (panel) panel.innerHTML = buildChangePanelHtml(data);
    }

    function refreshSourceColumn(message = '') {
      if (!isMainDocument) return;
      renderImportSourceList(audit, { sourceFormId: APP.omrImportState.sourceFormId, message });
    }

    function bindAuditActionButtons() {
      const resetBtn = doc.getElementById('gssf-omr-reset');
      if (resetBtn && resetBtn.dataset.bound !== '1') {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          clearImportedAnswersForAudit(audit);
          clearManualAnswersForAudit(audit);
          data.forEach((item) => {
            item.manual = '';
            item.imported = '';
            item.current = item.original || '';
            item.conflict = false;
          });
          data.forEach((item) => paint(item.number));
          updateChangedInfo();
          updateInlineReport(audit);
          APP.omrImportState.sourceFormId = '';
          APP.omrImportState.message = '';
          APP.omrImportState.questionListScrollTop = 0;
          APP.omrImportState.launchedSectionKeys = {};
          refreshSourceColumn();
          toast('Gabarito redefinido para as respostas do Forms atual.');
        });
      }

      const clearImportedBtn = doc.getElementById('gssf-omr-clear-imported');
      if (clearImportedBtn && clearImportedBtn.dataset.bound !== '1') {
        clearImportedBtn.dataset.bound = '1';
        clearImportedBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (isMainDocument) renderClearImportedList(audit);
        });
      }

      const clearManualBtn = doc.getElementById('gssf-omr-clear-manual');
      if (clearManualBtn && clearManualBtn.dataset.bound !== '1') {
        clearManualBtn.dataset.bound = '1';
        clearManualBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const count = clearManualAnswersForAudit(audit);
          data.forEach((item) => {
            item.manual = '';
            item.current = item.imported || item.original || '';
            item.conflict = Boolean(item.imported && item.original && item.imported !== item.original);
            paint(item.number);
          });
          updateChangedInfo();
          updateInlineReport(audit);
          refreshSourceColumn();
          log(`Alterações manuais removidas deste Forms: ${count}.`);
          toast(`Alterações manuais removidas: ${count}`);
        });
      }
    }

    function paint(q) {
      const item = data.find((x) => x.number === q);
      if (!item) return;
      const changed = item.current !== item.original;
      root.querySelectorAll(`.omr-bubble[data-q="${q}"]`).forEach((btn) => {
        const selected = btn.dataset.letter === item.current;
        const originalMuted = changed && item.original && btn.dataset.letter === item.original && !selected;
        btn.classList.toggle('selected', selected);
        btn.classList.toggle('changed-answer', changed && selected && (!item.imported || btn.dataset.letter !== item.imported));
        btn.classList.toggle('original-muted', originalMuted);
        btn.classList.toggle('changed-empty', changed && !item.current && btn.dataset.letter === item.original);
        btn.classList.toggle('imported-answer', item.imported && btn.dataset.letter === item.imported);
        btn.classList.toggle('conflict-answer', false);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.setAttribute('data-original', item.original || '');
        btn.setAttribute('data-current', item.current || '');
      });
    }

    root.querySelectorAll('.omr-bubble').forEach((btn) => {
      btn.style.pointerEvents = 'auto';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const q = Number(btn.dataset.q);
        const answer = btn.dataset.letter;
        const item = data.find((x) => x.number === q);
        if (!item) return;
        item.current = item.current === answer ? '' : answer;
        item.manual = item.current !== item.original ? item.current : '';
        item.conflict = false;
        paint(q);
        saveManualOverrides(audit, data);
        updateBankQuestion(getFormUniqueId(audit), q, { manualAnswer: item.manual || '', originalAnswer: item.original || '' });
        updateChangedInfo();
        updateInlineReport(audit);
        refreshSourceColumn();
      });
    });

    root.addEventListener('click', (ev) => {
      const btn = ev.target?.closest?.('.omr-bubble');
      if (!btn) return;
      ev.preventDefault();
    }, true);

    data.forEach((item) => paint(item.number));
    updateChangedInfo();
  }