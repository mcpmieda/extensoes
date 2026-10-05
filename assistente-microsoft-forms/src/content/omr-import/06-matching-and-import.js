

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
    if (isReadOnlyAnswerAudit(audit)) { toast('Volte à aba Perguntas do editor e atualize a leitura antes de importar respostas.'); return 0; }
    if (APP.omrImportRunning) { toast('Aguarde a importação em andamento.'); return 0; }
    APP.omrImportRunning = true;
    const formId = getFormUniqueId(audit);
    const revision = APP.questionContentRevision || 0;
    const selected = [...new Set(selectedNumbers.map(Number))];
    let message = '';
    try {
      await GSSF_STORAGE.flush();
      const bank = readFormsBank();
      const freshSource = bank.forms?.[source.formId];
      if (!freshSource) throw new Error('Origem indisponível. Atualize a lista.');
      const sourceSnapshot = JSON.stringify(freshSource);
      const currentSnapshot = JSON.stringify(bank.forms?.[formId] || null);
      const currentData = reportAnswerData(audit);
      const plan = selected.map((number) => {
        const sourceQuestion = freshSource.questions?.[String(number)];
        const match = resolveSafeImport(audit, sourceQuestion);
        const target = match.destination?.number;
        const current = currentData.find((q) => q.number === target);
        if (current?.manual) return { number, blocked: true, label: 'Ajuste manual preservado; limpe-o antes de importar.' };
        return { number, target, answer: match.answer, blocked: match.level === 'blocked', label: match.label };
      });
      const allowed = plan.filter((item) => !item.blocked);
      if (!allowed.length) {
        message = 'Nenhuma resposta importada. ' + (plan[0]?.label || 'Selecione questões com conteúdo conferido.');
        toast(message); return 0;
      }
      if (new Set(allowed.map((item) => item.target)).size !== allowed.length) throw new Error('Mais de uma origem aponta para a mesma questão. Selecione apenas uma.');
      const skipped = plan.length - allowed.length;
      const changes = allowed.filter((item) => currentData.find((q) => q.number === item.target)?.current !== item.answer);
      const mapping = allowed.map((item) => 'Q' + item.number + ' → Q' + item.target + ': ' + item.answer).join('; ');
      const ok = await askConfirm({
        title: 'Confirmar importação conferida',
        message: allowed.length + ' resposta(s) de "' + freshSource.title + '" para "' + audit.title + '". ' + changes.length + ' resposta(s) serão alteradas no gabarito interno do app. ' + skipped + ' bloqueada(s), sem alteração. ' + mapping,
        confirmText: 'Importar respostas', cancelText: 'Cancelar'
      });
      if (!ok) return 0;
      await GSSF_STORAGE.flush();
      if ((APP.questionContentRevision || 0) !== revision || getFormUniqueId() !== formId) throw new Error('O formulário mudou durante a confirmação. Atualize a análise.');
      const latest = readFormsBank();
      if (JSON.stringify(latest.forms?.[source.formId]) !== sourceSnapshot || JSON.stringify(latest.forms?.[formId] || null) !== currentSnapshot) throw new Error('O gabarito mudou durante a confirmação. Confira e tente novamente.');
      const freshAudit = auditPage();
      if (isReadOnlyAnswerAudit(freshAudit)) throw new Error('A página saiu da edição durante a confirmação. Atualize a análise.');
      for (const item of allowed) {
        const match = resolveSafeImport(freshAudit, freshSource.questions[String(item.number)]);
        if (match.level === 'blocked' || match.destination.number !== item.target || match.answer !== item.answer
          || reportAnswerData(freshAudit).find((q) => q.number === item.target)?.manual) throw new Error('O conteúdo ou ajuste manual mudou. Atualize a análise.');
      }
      const record = buildFormBankRecord(freshAudit, latest.forms[formId]);
      for (const item of allowed) {
        const q = record.questions[String(item.target)];
        q.importedAnswer = item.answer;
        q.effectiveAnswer = item.answer;
        q.source = 'imported';
        q.shiftRisk = null;
        q.importSource = { type: 'formsBank', formId: source.formId, title: freshSource.title, sourceQuestion: item.number, targetQuestion: item.target, matchLevel: 'similar', matchLabel: item.label, importedAt: new Date().toISOString() };
      }
      record.answerCount = answerCountFromQuestions(record.questions);
      record.contentFingerprint = formRecordFingerprint(record);
      latest.forms[formId] = record;
      if (!saveFormsBank(latest, 'importação conferida')) throw new Error('Não foi possível agendar a gravação.');
      await GSSF_STORAGE.flush();
      const saved = readFormsBank().forms?.[formId];
      if (!allowed.every((item) => saved?.questions?.[String(item.target)]?.importedAnswer === item.answer && effectiveAnswerOfRecord(saved.questions[String(item.target)]) === item.answer)) throw new Error('A gravação não pôde ser confirmada. Confira o gabarito atual.');
      message = allowed.length + ' resposta(s) gravada(s) e conferida(s); ' + skipped + ' bloqueada(s).';
      log(message); toast(message);
      APP.lastAudit = freshAudit;
      if (options.triggerEffects) allowed.forEach((item) => registerPendingOmrBubbleEffect(item.target, item.answer, 0));
      return allowed.length;
    } catch (error) {
      message = 'Importação não confirmada: ' + error.message;
      log(message); toast(message);
      return 0;
    } finally {
      APP.omrImportRunning = false;
      APP.omrImportState.message = message;
      if (getFormUniqueId() === formId) {
        renderOmrMainIntoModal(APP.lastAudit || audit);
        renderImportSourceList(APP.lastAudit || audit, { sourceFormId: source.formId, message });
      }
    }
  }
