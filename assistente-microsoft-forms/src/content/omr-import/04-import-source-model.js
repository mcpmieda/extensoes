

  function sourceAnswerForBankQuestion(q) {
    return q?.manualAnswer || q?.importedAnswer || q?.originalAnswer || q?.effectiveAnswer || '';
  }

  function bankFormStatus(form) {
    const count = answerCountFromQuestions(form?.questions || {});
    if (!count) return 'Sem respostas';
    if (count >= Number(form?.questionCount || 0)) return 'Completo';
    return 'Parcial';
  }

  function shortFormIdentifier(form) {
    return simpleHash(form?.formId || form?.url || form?.title || 'forms').slice(0, 6).toUpperCase();
  }

  function importOptionListHtml(options, emptyText = 'Alternativas não salvas.') {
    const list = Array.isArray(options) ? options.filter(Boolean) : [];
    if (!list.length) return `<p class="gssf-import-detail-empty">${escapeHtml(emptyText)}</p>`;
    return `<ul>${list.map((option, index) => {
      const optionLetter = option?.letter || letter(index);
      const optionText = typeof option === 'string' ? option : option?.text || '';
      return `<li><b>${escapeHtml(optionLetter)}</b><span>${escapeHtml(optionText || 'Sem texto salvo')}</span></li>`;
    }).join('')}</ul>`;
  }

  function importQuestionDetailsHtml({ source, sourceQuestion, sourcePreview, sourceAnswer, destTitle, destQuestion, destPreview, currentAnswer }) {
    const sourceOptions = sourceQuestion?.options || [];
    const destOptions = (destQuestion?.optionTexts || []).map((text, index) => ({ letter: letter(index), text }));
    return `<details class="gssf-import-details">
      <summary>Ver detalhes</summary>
      <div class="gssf-import-detail-grid">
        <section>
          <strong>Forms de origem</strong>
          <span>Questão ${escapeHtml(sourceQuestion?.questionNumber || '')} • resposta ${escapeHtml(sourceAnswer || 'sem resposta')}</span>
          <p>${escapeHtml(sourcePreview || 'Questão sem texto salvo na origem.')}</p>
          ${importOptionListHtml(sourceOptions)}
        </section>
        <section>
          <strong>Forms atual</strong>
          <span>${escapeHtml(destTitle)} • resposta ${escapeHtml(currentAnswer || 'sem resposta')}</span>
          <p>${escapeHtml(destPreview || 'Questão sem texto detectado no Forms atual.')}</p>
          ${importOptionListHtml(destOptions)}
        </section>
      </div>
    </details>`;
  }

  function omrBankUiSignature(audit) {
    const bank = readFormsBank();
    const currentId = getFormUniqueId(audit);
    const forms = Object.values(bank.forms || {}).filter(Boolean).map((form) => ({
      formId: form.formId || '',
      title: form.title || '',
      lastReadAt: form.lastReadAt || '',
      questionCount: Number(form.questionCount || 0),
      answerCount: answerCountFromQuestions(form.questions || {}),
      fingerprint: form.contentFingerprint || formRecordFingerprint(form),
      current: form.formId === currentId
    })).sort((a, b) => String(a.formId).localeCompare(String(b.formId)));
    return simpleHash(JSON.stringify(forms));
  }

  function setOmrSectionHover(sectionIndex) {
    const bands = Array.from(document.querySelectorAll('#omr-sheet .gssf-omr-section-band'));
    bands.forEach((band) => {
      const active = String(band.dataset.sectionIndex || '') === String(sectionIndex || '');
      band.classList.toggle('hover-target', Boolean(sectionIndex !== null && sectionIndex !== '' && active));
    });
  }

  function clearOmrSectionHover() {
    document.querySelectorAll('#omr-sheet .gssf-omr-section-band.hover-target').forEach((band) => band.classList.remove('hover-target'));
  }

  function buildImportSourceCardsHtml(forms, selectedSource) {
    const normalizedTitleCounts = new Map();
    forms.forEach((form) => {
      const key = normalizeText(form.title || 'Forms salvo');
      normalizedTitleCounts.set(key, (normalizedTitleCounts.get(key) || 0) + 1);
    });
    const cards = forms.map((form) => {
      const answers = answerCountFromQuestions(form.questions || {});
      const read = formatReadTimeParts(form.lastReadAt);
      const repeated = (normalizedTitleCounts.get(normalizeText(form.title || 'Forms salvo')) || 0) > 1;
      const selected = selectedSource && String(selectedSource.formId) === String(form.formId);
      const status = bankFormStatus(form);
      const statusClass = status === 'Completo' ? ' status-complete' : ' status-incomplete';
      return `<button type="button" class="gssf-bank-source${statusClass}${selected ? ' selected' : ''}" data-form-id="${escapeHtml(form.formId)}" aria-pressed="${selected ? 'true' : 'false'}">
        <strong title="${escapeHtml(form.title || 'Forms salvo')}">${escapeHtml(form.title || 'Forms salvo')}</strong>
        <span class="gssf-bank-source-meta"><b>${escapeHtml(status)}</b><em>${escapeHtml(answers)}/${escapeHtml(form.questionCount || 0)} respostas</em>${repeated ? `<i>#${escapeHtml(shortFormIdentifier(form))}</i>` : ''}</span>
        <span class="gssf-bank-source-date"><b>${escapeHtml(read.date || 'sem data')}</b>${read.time ? `<i>${escapeHtml(read.time)}</i>` : ''}</span>
      </button>`;
    }).join('');
    return `<div class="gssf-source-selector">
      <div class="gssf-source-selector-title"><strong>Forms disponíveis</strong><span>${escapeHtml(forms.length)} origem(ns)</span></div>
      <div class="gssf-source-card-list">${cards}</div>
    </div>`;
  }

  function buildImportQuestionRows(audit, source, bank, currentId) {
    const destTitle = cleanText(audit.title || getFormTitle() || document.title || 'Forms atual');
    const destCount = Number(audit.questions.length || 0);
    const currentFormRecord = bank.forms?.[currentId] || null;
    const destByNumber = currentQuestionByNumberForImport(audit);
    const currentData = new Map(reportAnswerData(audit).map((item) => [Number(item.number), item]));
    const allQuestions = Object.values(source.questions || {})
      .filter((q) => sourceAnswerForBankQuestion(q))
      .sort((a, b) => Number(a.questionNumber || 0) - Number(b.questionNumber || 0));
    let importableCount = 0;
    let blankCount = 0;
    const rows = [];
    allQuestions.forEach((q) => {
      const number = Number(q.questionNumber || 0);
      if (!number) return;
      const sourceAnswer = sourceAnswerForBankQuestion(q);
      const currentBankQuestion = currentFormRecord?.questions?.[String(number)] || null;
      if (sameImportedAnswerFromSource(currentBankQuestion, source, q, sourceAnswer)) {
        return;
      }
      const destQuestion = destByNumber.get(number) || null;
      const blocked = number > destCount || !destQuestion;
      const currentAnswer = currentData.get(number)?.current || effectiveAnswerOfRecord(currentBankQuestion) || '';
      const destBlank = !blocked && !currentAnswer;
      if (!blocked) importableCount += 1;
      if (destBlank) blankCount += 1;
      const sourcePreview = sourcePreviewForImport(q);
      const destPreview = currentPreviewForImport(destQuestion, number);
      const match = importMatchInfo(sourcePreview, destPreview, destBlank, blocked ? 'disabled' : '', q, destQuestion);
      let statusText = '';
      if (blocked) statusText = 'Não existe questão correspondente no Forms atual.';
      else if (!currentAnswer) statusText = 'Sem resposta no gabarito atual.';
      else if (String(currentAnswer).toUpperCase() === String(sourceAnswer).toUpperCase()) statusText = 'A origem é igual à resposta usada atualmente.';
      else statusText = 'A importação substituirá a resposta usada atualmente.';
      const rowStateClass = match.level === 'different' ? ' match-different' : (destBlank ? ' match-blank' : '');
      const sectionIndex = Number.isInteger(destQuestion?.sectionIndex) && destQuestion.sectionIndex >= 0
        ? destQuestion.sectionIndex
        : (Number.isInteger(q?.sectionIndex) ? q.sectionIndex : -1);
      const sectionTitle = cleanText(destQuestion?.sectionTitle || q?.sectionTitle || '');
      const sectionTone = sectionVisual(sectionIndex);
      const sameAnswer = Boolean(currentAnswer && String(currentAnswer).toUpperCase() === String(sourceAnswer).toUpperCase());
      const stateBackground = match.level === 'different'
        ? 'rgba(255,228,230,.96)'
        : (destBlank ? 'rgba(220,252,231,.96)' : 'rgba(248,250,252,.96)');
      const singleButton = !blocked && !sameAnswer
        ? `<button type="button" class="gssf-import-single" data-q="${escapeHtml(number)}" title="Adicionar apenas esta resposta ao gabarito" aria-label="Adicionar apenas a resposta da questão ${escapeHtml(number)} ao gabarito"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/></svg></button>`
        : '';
      rows.push(`<article class="gssf-import-question${blocked ? ' disabled' : ''}${destBlank ? ' current-blank' : ''}${currentAnswer && currentAnswer !== sourceAnswer ? ' will-replace' : ''}${sameAnswer ? ' same-answer' : ''}${singleButton ? ' has-single' : ''}${rowStateClass}" data-section-index="${sectionIndex >= 0 ? escapeHtml(sectionIndex) : ''}" style="--gssf-card-state:${stateBackground};--gssf-card-section:${sectionTone.card};--gssf-card-section-soft:${sectionTone.soft || sectionTone.fill};--gssf-card-section-border:${sectionTone.border};--gssf-card-section-ink:${sectionTone.ink}">
        <label class="gssf-import-question-select-area">
          <span class="gssf-import-question-title-line">
            <input type="checkbox" data-q="${escapeHtml(number)}" data-dest-blank="${destBlank ? '1' : '0'}" data-match="${escapeHtml(match.level)}" ${blocked ? 'disabled' : ''} aria-label="Selecionar questão ${escapeHtml(number)}">
            <span class="gssf-import-question-number">Questão ${escapeHtml(number)}</span>
            ${sectionTitle ? `<span class="gssf-import-question-separator">–</span><span class="gssf-import-section-name" title="${escapeHtml(sectionTitle)}">${escapeHtml(sectionTitle)}</span>` : ''}
          </span>
          <span class="gssf-import-answer-pair"><b>Origem: ${escapeHtml(sourceAnswer)}</b><em>Atual: ${escapeHtml(currentAnswer || 'sem resposta')}</em></span>
          <span class="gssf-import-question-preview" title="${escapeHtml(sourcePreview)}">${escapeHtml(sourcePreview)}</span>
          <span class="gssf-import-question-status"><span class="gssf-import-status-pill ${escapeHtml(match.level)}">${escapeHtml(match.label)}</span>${statusText ? `<em>${escapeHtml(statusText)}</em>` : ''}</span>
        </label>
        ${singleButton}
        ${importQuestionDetailsHtml({ source, sourceQuestion: q, sourcePreview, sourceAnswer, destTitle, destQuestion, destPreview, currentAnswer })}
      </article>`);
    });
    return { allQuestions, importableCount, blankCount, rows };
  }