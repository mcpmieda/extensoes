

  function bindImportSourcePaneEvents(pane, audit, source) {
    pane.querySelectorAll('.gssf-bank-source[data-form-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        APP.omrImportState.message = '';
        APP.omrImportState.questionListScrollTop = 0;
        renderImportQuestionList(audit, btn.dataset.formId);
      });
    });
    const getBoxes = () => Array.from(pane.querySelectorAll('.gssf-import-question input[type="checkbox"]:not(:disabled)'));
    const syncSelection = () => {
      const boxes = getBoxes();
      const selected = boxes.filter((input) => input.checked);
      const count = pane.querySelector('#gssf-import-selection-count');
      const importButton = pane.querySelector('#gssf-bank-import-selected');
      if (count) count.textContent = selected.length === 1 ? `1 de ${boxes.length} selecionada` : `${selected.length} de ${boxes.length} selecionadas`;
      if (importButton) {
        importButton.disabled = selected.length === 0;
        importButton.textContent = selected.length ? `Importar selecionadas (${selected.length})` : 'Importar selecionadas';
      }
    };
    getBoxes().forEach((input) => input.addEventListener('change', syncSelection));
    pane.querySelector('#gssf-bank-mark-all')?.addEventListener('click', () => {
      const boxes = getBoxes();
      boxes.forEach((input) => { input.checked = true; });
      syncSelection();
      if (!boxes.length) toast('Nenhuma resposta disponível nesta origem.');
    });
    pane.querySelector('#gssf-bank-select-current-blank')?.addEventListener('click', () => {
      const boxes = getBoxes();
      boxes.forEach((input) => { input.checked = input.dataset.destBlank === '1'; });
      syncSelection();
      if (!boxes.some((input) => input.checked)) toast('Nenhuma questão sem resposta está disponível nesta origem.');
    });
    pane.querySelector('#gssf-bank-unmark-all')?.addEventListener('click', () => {
      getBoxes().forEach((input) => { input.checked = false; });
      syncSelection();
    });
    pane.querySelector('#gssf-bank-import-selected')?.addEventListener('click', async () => {
      const selected = getBoxes().filter((input) => input.checked).map((input) => Number(input.dataset.q)).filter(Boolean);
      if (!selected.length) {
        APP.omrImportState.message = 'Selecione uma ou mais questões para importar.';
        toast('Selecione uma ou mais questões para importar.');
        return;
      }
      await importSelectedAnswersFromSource(audit, source, selected, { triggerEffects: true, sourcePane: pane });
    });
    pane.querySelectorAll('.gssf-import-single[data-q]').forEach((btn) => btn.addEventListener('click', async () => {
      const number = Number(btn.dataset.q || 0);
      if (!number) return;
      const card = btn.closest('.gssf-import-question');
      const questionList = pane.querySelector('.gssf-bank-question-list');
      const sourceCards = pane.querySelector('.gssf-source-card-list');
      const sourceQuestion = source.questions?.[String(number)] || null;
      const answer = sourceAnswerForBankQuestion(sourceQuestion);
      APP.omrImportState.questionListScrollTop = Number(questionList?.scrollTop || 0);
      APP.omrImportState.sourceCardsScrollTop = Number(sourceCards?.scrollTop || 0);
      btn.disabled = true;
      if (card) card.classList.add('single-importing');

      APP.omrImportState.singleQueue = APP.omrImportState.singleQueue.then(async () => {
        await importSelectedAnswersFromSource(audit, source, [number], { single: true, triggerEffects: true, sourcePane: pane });
      }).catch((error) => { reportNonFatalError('importacao:fila-individual', error, { questionNumber: number }); });
      await APP.omrImportState.singleQueue;
    }));
    pane.querySelectorAll('.gssf-section-launch-btn[data-section-key]').forEach((btn) => btn.addEventListener('click', async () => {
      const target = analyzeSourceSectionsForImport(audit, source).matches.find((section) => section.key === String(btn.dataset.sectionKey || ''));
      if (!target) {
        toast('Não encontrei uma seção correspondente para lançar.');
        return;
      }
      const numbers = target.questionNumbers.filter(Boolean);
      if (!numbers.length) {
        toast('Esta seção não tem respostas disponíveis para lançar.');
        return;
      }
      await importSelectedAnswersFromSource(audit, source, numbers, { triggerEffects: true, sourcePane: pane, sectionTitle: target.title, alertOnReplace: true, sectionKey: target.key, sectionImport: true });
    }));
    pane.querySelector('#gssf-import-section-launch-toggle')?.addEventListener('click', () => {
      APP.omrImportState.sectionLaunchCollapsed = !APP.omrImportState.sectionLaunchCollapsed;
      saveSectionLaunchCollapsedPref(APP.omrImportState.sectionLaunchCollapsed);
      renderImportSourceList(audit, { sourceFormId: source.formId, message: APP.omrImportState.message });
    });
    pane.querySelector('#gssf-import-section-launch-toggle')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      APP.omrImportState.sectionLaunchCollapsed = !APP.omrImportState.sectionLaunchCollapsed;
      saveSectionLaunchCollapsedPref(APP.omrImportState.sectionLaunchCollapsed);
      renderImportSourceList(audit, { sourceFormId: source.formId, message: APP.omrImportState.message });
    });

    pane.querySelectorAll('.gssf-import-question[data-section-index]').forEach((card) => {
      const sectionIndex = String(card.dataset.sectionIndex || '');
      if (!sectionIndex) return;
      card.addEventListener('mouseenter', () => setOmrSectionHover(sectionIndex));
      card.addEventListener('mouseleave', clearOmrSectionHover);
      card.addEventListener('focusin', () => setOmrSectionHover(sectionIndex));
      card.addEventListener('focusout', () => {
        if (!card.contains(document.activeElement)) clearOmrSectionHover();
      });
    });
    pane.querySelectorAll('.gssf-section-launch-btn[data-section-index]').forEach((btn) => {
      const sectionIndex = String(btn.dataset.sectionIndex || '');
      if (!sectionIndex) return;
      btn.addEventListener('mouseenter', () => setOmrSectionHover(sectionIndex));
      btn.addEventListener('mouseleave', clearOmrSectionHover);
      btn.addEventListener('focusin', () => setOmrSectionHover(sectionIndex));
      btn.addEventListener('focusout', () => {
        if (!btn.contains(document.activeElement)) clearOmrSectionHover();
      });
    });
    syncSelection();
    requestAnimationFrame(() => {
      const restoreQuestionList = pane.querySelector('.gssf-bank-question-list');
      const restoreSourceCards = pane.querySelector('.gssf-source-card-list');
      if (restoreQuestionList) restoreQuestionList.scrollTop = Number(APP.omrImportState.questionListScrollTop || 0);
      if (restoreSourceCards) restoreSourceCards.scrollTop = Number(APP.omrImportState.sourceCardsScrollTop || 0);
    });
  }

  function renderImportSourceList(audit, options = {}) {
    const modal = document.getElementById('gssf-modal');
    const pane = modal?.querySelector('#gssf-omr-source-pane');
    if (!pane) return;
    const currentQuestionList = pane.querySelector('.gssf-bank-question-list');
    const currentSourceCards = pane.querySelector('.gssf-source-card-list');
    if (currentQuestionList) APP.omrImportState.questionListScrollTop = Number(currentQuestionList.scrollTop || 0);
    if (currentSourceCards) APP.omrImportState.sourceCardsScrollTop = Number(currentSourceCards.scrollTop || 0);
    const bank = readFormsBank();
    const currentId = getFormUniqueId(audit);
    const forms = Object.values(bank.forms || {})
      .filter((form) => form && form.formId !== currentId)
      .sort((a, b) => parseDateMs(b.lastReadAt) - parseDateMs(a.lastReadAt));
    const requestedId = Object.prototype.hasOwnProperty.call(options, 'sourceFormId')
      ? String(options.sourceFormId || '')
      : String(APP.omrImportState.sourceFormId || '');
    const selectedSource = forms.find((form) => String(form.formId) === requestedId) || null;
    APP.omrImportState.sourceFormId = selectedSource?.formId || '';
    if (Object.prototype.hasOwnProperty.call(options, 'message')) APP.omrImportState.message = String(options.message || '');

    if (!forms.length) {
      pane.innerHTML = `<div class="gssf-source-empty">
        <span aria-hidden="true">○</span>
        <strong>Aguardando leitura de outro Forms</strong>
        <p>Abra outro formulário com este assistente para que o gabarito seja salvo e apareça aqui como origem.</p>
      </div>`;
      clearOmrSectionHover();
      APP.omrImportState.bankSignature = omrBankUiSignature(audit);
      return;
    }

    const cardsHtml = buildImportSourceCardsHtml(forms, selectedSource);

    if (!selectedSource) {
      pane.innerHTML = `${cardsHtml}<div class="gssf-source-prompt"><strong>Escolha o Forms de origem</strong><p>O gabarito atual continuará visível à esquerda. Nenhuma resposta será selecionada automaticamente.</p></div>`;
      pane.querySelectorAll('.gssf-bank-source[data-form-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          APP.omrImportState.questionListScrollTop = 0;
          APP.omrImportState.message = '';
          renderImportQuestionList(audit, btn.dataset.formId);
        });
      });
      clearOmrSectionHover();
      APP.omrImportState.bankSignature = omrBankUiSignature(audit);
      return;
    }

    const source = selectedSource;
    const { allQuestions, importableCount, blankCount, rows } = buildImportQuestionRows(audit, source, bank, currentId);

    const inlineMessageText = String(APP.omrImportState.message || '');
    const isTransientStatus = /^(?:Importa[cç][aã]o conclu[ií]da|Origem atualizada automaticamente|O gabarito foi atualizado)/i.test(inlineMessageText);
    const message = inlineMessageText && !isTransientStatus ? `<div class="gssf-source-message">${escapeHtml(inlineMessageText)}</div>` : '';
    const sectionButtonsHtml = buildSectionImportButtonsHtml(audit, source);
    let listHtml = rows.join('');
    if (!allQuestions.length) listHtml = '<div class="gssf-source-empty compact"><strong>Origem sem respostas</strong><p>Este Forms foi lido, mas ainda não possui respostas corretas salvas para importar.</p></div>';
    else if (!rows.length) listHtml = '<div class="gssf-source-empty compact"><strong>Nada disponível</strong><p>Não há novas respostas disponíveis para esta origem.</p></div>';
    pane.innerHTML = `${cardsHtml}
      ${message}
      <div class="gssf-import-actionbar">
        <strong id="gssf-import-selection-count">0 de ${escapeHtml(importableCount)} selecionadas</strong>
        <div>
          <button type="button" class="gssf-btn" id="gssf-bank-mark-all">Marcar todas</button>
          <button type="button" class="gssf-btn" id="gssf-bank-select-current-blank">Marcar questões em branco</button>
          <button type="button" class="gssf-btn" id="gssf-bank-unmark-all">Desmarcar todas</button>
          <button type="button" class="gssf-btn ok" id="gssf-bank-import-selected" disabled>Importar selecionadas</button>
        </div>
      </div>
      ${sectionButtonsHtml}
      <div class="gssf-import-list-meta"><span>${escapeHtml(blankCount)} sem resposta no gabarito atual</span><span>${escapeHtml(importableCount)} importáveis</span></div>
      <div class="gssf-bank-question-list">${listHtml}</div>`;

    bindImportSourcePaneEvents(pane, audit, source);
    clearOmrSectionHover();
    APP.omrImportState.bankSignature = omrBankUiSignature(audit);
  }