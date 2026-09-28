

  function currentQuestionByNumberForImport(audit) {
    const map = new Map();
    (audit?.questions || []).forEach((q) => {
      const number = Number(q?.number || 0);
      if (number) map.set(number, q);
    });
    return map;
  }

  function sourcePreviewForImport(q) {
    const number = Number(q?.questionNumber || 0);
    const fromPreview = cleanQuestionPreview(q?.textPreview || '', number);
    if (fromPreview) return fromPreview;
    const fromNormalized = cleanText(q?.promptNormalized || '');
    if (fromNormalized) return cleanQuestionPreview(fromNormalized, number);
    const options = Array.isArray(q?.options) ? q.options.map((opt) => opt?.text || '').filter(Boolean).slice(0, 4).join(' | ') : '';
    if (options) return `Sem enunciado salvo. Alternativas: ${options}`.slice(0, 320);
    return 'Questão sem texto salvo na origem.';
  }

  function currentPreviewForImport(q, number = 0) {
    if (!q) return 'Não existe questão correspondente no formulário atual.';
    const preview = cleanQuestionPreview(q.prompt || '', q.number || number);
    if (q.emptyModel) {
      return preview || 'Atual • em branco';
    }
    return preview || 'Sem texto detectado no formulário atual.';
  }

  function currentQuestionIsBlankForImport(q, preview = '') {
    if (!q) return false;
    if (q.emptyModel) return true;
    const normalized = normalizeText(preview || q.prompt || '');
    if (!normalized) return true;
    const withoutModelWords = normalized.replace(/\b(pergunta|opcao\s*\d+)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return !withoutModelWords;
  }

  function importComparableTokens(text) {
    const stop = new Set(['questao','pergunta','opcao','opcoes','alternativa','alternativas','unica','atual','origem','formulario','forms','texto','sem','com','para','que','uma','das','dos','nas','nos','por','mais','menos','qual','quais','assinale','marque','responda']);
    return normalizeText(text || '')
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]+/g, ''))
      .filter((token) => token.length >= 3 && !stop.has(token))
      .slice(0, 120);
  }

  function importOptionTextsForQuestion(question) {
    if (!question) return [];
    if (Array.isArray(question.options)) return question.options.map((opt) => cleanText(opt?.text || '')).filter(Boolean);
    if (Array.isArray(question.optionTexts)) return question.optionTexts.map((text) => cleanText(text || '')).filter(Boolean);
    return [];
  }

  function importSimilarityFromTexts(sourceText, destText) {
    const a = new Set(importComparableTokens(sourceText));
    const b = new Set(importComparableTokens(destText));
    if (!a.size || !b.size) return null;
    let intersection = 0;
    a.forEach((token) => { if (b.has(token)) intersection += 1; });
    return intersection / Math.max(a.size, b.size);
  }

  function importPreviewSimilarity(sourcePreview, destPreview, sourceQuestion = null, destQuestion = null) {
    const promptSimilarity = importSimilarityFromTexts(sourcePreview, destPreview);
    const sourceOptions = importOptionTextsForQuestion(sourceQuestion).join(' ');
    const destOptions = importOptionTextsForQuestion(destQuestion).join(' ');
    const optionSimilarity = sourceOptions && destOptions ? importSimilarityFromTexts(sourceOptions, destOptions) : null;
    if (promptSimilarity === null && optionSimilarity === null) return null;
    if (promptSimilarity !== null && optionSimilarity !== null) return (promptSimilarity * 0.58) + (optionSimilarity * 0.42);
    return promptSimilarity !== null ? promptSimilarity : optionSimilarity;
  }

  function importMatchInfo(sourcePreview, destPreview, destBlank, disabled, sourceQuestion = null, destQuestion = null) {
    if (disabled) return { level: 'blocked', label: 'fora do destino' };
    if (destBlank) return { level: 'blank', label: 'Atual • em branco' };
    const similarity = importPreviewSimilarity(sourcePreview, destPreview, sourceQuestion, destQuestion);
    const promptSimilarity = importSimilarityFromTexts(sourcePreview, destPreview);
    const sourceOptions = importOptionTextsForQuestion(sourceQuestion).join(' ');
    const destOptions = importOptionTextsForQuestion(destQuestion).join(' ');
    const optionSimilarity = sourceOptions && destOptions ? importSimilarityFromTexts(sourceOptions, destOptions) : null;
    if (similarity === null) return { level: 'limited', label: 'comparação limitada' };
    if (optionSimilarity !== null && optionSimilarity <= 0.34) return { level: 'different', label: 'texto diferente — revisar' };
    if (similarity >= 0.78 && (optionSimilarity === null || optionSimilarity >= 0.56) && (promptSimilarity === null || promptSimilarity >= 0.66)) return { level: 'similar', label: 'textos parecidos' };
    if (similarity <= 0.52 || (promptSimilarity !== null && promptSimilarity <= 0.47)) return { level: 'different', label: 'texto diferente — revisar' };
    return { level: 'medium', label: 'conferir antes de importar' };
  }

  function sameImportedAnswerFromSource(currentQuestion, source, sourceQuestion, sourceAnswer) {
    if (!currentQuestion || !source || !sourceQuestion || !sourceAnswer) return false;
    const imported = String(currentQuestion.importedAnswer || '').trim().toUpperCase();
    const answer = String(sourceAnswer || '').trim().toUpperCase();
    if (!imported || imported !== answer) return false;
    const importSource = currentQuestion.importSource || {};
    const sameForm = String(importSource.formId || '') === String(source.formId || '');
    const sameQuestion = Number(importSource.sourceQuestion || currentQuestion.questionNumber || 0) === Number(sourceQuestion.questionNumber || 0);
    return Boolean(sameForm && sameQuestion);
  }

  function renderImportQuestionList(audit, sourceFormId) {
    APP.omrImportState.sourceFormId = String(sourceFormId || '');
    APP.omrImportState.questionListScrollTop = 0;
    APP.omrImportState.message = '';
    renderImportSourceList(audit, { sourceFormId: APP.omrImportState.sourceFormId });
  }

  async function importSelectedAnswersFromSource(audit, source, selectedNumbers, options = {}) {
    if (!selectedNumbers.length) {
      APP.omrImportState.message = 'Selecione uma ou mais questões para importar.';
      toast('Selecione uma ou mais questões para importar.');
      return 0;
    }
    const destTitle = cleanText(audit.title || getFormTitle() || document.title || 'Forms atual');
    const destByNumber = currentQuestionByNumberForImport(audit);
    const destCount = audit.questions.length || 40;
    const currentData = reportAnswerData(audit);
    const importable = selectedNumbers.map((number) => {
      const q = source.questions?.[String(number)];
      const sourcePreview = q ? sourcePreviewForImport(q) : '';
      const destQuestion = destByNumber.get(Number(number)) || null;
      const destPreview = currentPreviewForImport(destQuestion, Number(number));
      const blocked = Number(number) > destCount || !destQuestion;
      const current = currentData.find((item) => Number(item.number) === Number(number));
      const destBlank = !blocked && !current?.current;
      const match = importMatchInfo(sourcePreview, destPreview, destBlank, blocked ? 'disabled' : '', q, destQuestion);
      return { number, answer: sourceAnswerForBankQuestion(q), sourceQuestion: q, match, sourcePreview, destPreview };
    }).filter((item) => item.answer && item.match.level !== 'blocked');
    if (!importable.length) {
      APP.omrImportState.message = 'Não há novas respostas disponíveis para esta origem.';
      renderImportSourceList(audit, { sourceFormId: source.formId, message: APP.omrImportState.message });
      toast('Nada disponível para importar.');
      return 0;
    }
    const questionList = options.sourcePane?.querySelector?.('.gssf-bank-question-list');
    const sourceCards = options.sourcePane?.querySelector?.('.gssf-source-card-list');
    if (questionList) APP.omrImportState.questionListScrollTop = Number(questionList.scrollTop || 0);
    if (sourceCards) APP.omrImportState.sourceCardsScrollTop = Number(sourceCards.scrollTop || 0);
    const cautionCount = importable.filter((item) => ['different','limited','medium'].includes(item.match.level)).length;
    const conflicts = importable.filter((item) => {
      const current = currentData.find((data) => Number(data.number) === Number(item.number));
      return Boolean(current?.current && String(current.current).toUpperCase() !== String(item.answer).toUpperCase());
    });
    if (!options.skipConfirm) {
      const cautionText = cautionCount ? ` Atenção: ${cautionCount} selecionada(s) exigem conferência entre a questão de origem e a questão atual.` : '';
      const ok = await askConfirm({
        title: options.single ? 'Adicionar resposta?' : 'Confirmar importação',
        message: `Você está importando ${importable.length} resposta(s) de "${source.title || 'Forms salvo'}" para "${destTitle}". Elas serão aplicadas somente no gabarito interno deste app.${cautionText} Deseja continuar?`,
        confirmText: options.single ? 'Adicionar ao gabarito' : 'Importar respostas',
        cancelText: 'Cancelar'
      });
      if (!ok) return 0;
      if (conflicts.length) {
        const sample = conflicts.slice(0, 8).map((item) => {
          const current = currentData.find((data) => Number(data.number) === Number(item.number));
          return `Questão ${item.number}: atual ${current?.current || 'sem resposta'}; origem ${item.answer}`;
        }).join(' | ');
        const replace = await askConfirm({
          title: 'Há respostas diferentes',
          message: `${conflicts.length} questão(ões) têm resposta diferente entre a origem e o gabarito atual. Exemplos: ${sample}${conflicts.length > 8 ? '...' : ''} Deseja substituir a resposta usada atualmente no app?`,
          confirmText: 'Substituir no app',
          cancelText: 'Cancelar'
        });
        if (!replace) return 0;
      }
    } else if (options.alertOnReplace && conflicts.length) {
      const targetLabel = options.sectionTitle ? ` na seção "${options.sectionTitle}"` : '';
      const sample = conflicts.slice(0, 6).map((item) => `Q${item.number} (${item.answer})`).join(', ');
      const proceed = await askConfirm({
        title: 'Algumas respostas serão substituídas',
        message: `Vou substituir ${conflicts.length} resposta(s) já marcadas no gabarito atual${targetLabel} pelas respostas da origem.${sample ? ` Exemplos: ${sample}.` : ''}`,
        confirmText: 'Continuar',
        cancelText: 'Cancelar'
      });
      if (!proceed) return 0;
    }
    const formId = getFormUniqueId(audit);
    saveCurrentFormToBank(audit, 'antes da importação');
    let applied = 0;
    const effectSpecs = [];
    importable.forEach((item) => {
      const q = audit.questions.find((question) => Number(question.number) === Number(item.number));
      if (!q) return;
      const importSource = {
        type: 'formsBank',
        formId: source.formId,
        title: source.title || 'Forms salvo',
        sourceQuestion: item.sourceQuestion?.questionNumber || item.number,
        targetQuestion: item.number,
        matchLevel: item.match?.level || '',
        matchLabel: item.match?.label || '',
        importedAt: new Date().toISOString()
      };
      if (updateBankQuestion(formId, item.number, { importedAnswer: item.answer, importSource, originalAnswer: originalAnswerForQuestion(q) })) {
        applied += 1;
        effectSpecs.push({ number: item.number, letter: item.answer });
      }
    });
    if (applied && options.sectionImport && options.sectionKey) markSectionLaunchHidden(source.formId, options.sectionKey);
    if (applied) log(`Respostas importadas de "${source.title || 'Forms salvo'}": ${applied}.`);
    toast(applied ? 'Importação concluída. O gabarito foi atualizado.' : 'Nada mudou no gabarito.');
    updateInlineReport(audit);
    if (options.triggerEffects && effectSpecs.length) effectSpecs.forEach((effect) => registerPendingOmrBubbleEffect(effect.number, effect.letter, options.sectionImport ? 0 : 70));
    renderOmrMainIntoModal(audit);
    renderImportSourceList(audit, {
      sourceFormId: source.formId,
      message: applied ? '' : 'Não há novas respostas disponíveis para esta origem.'
    });
    return applied;
  }