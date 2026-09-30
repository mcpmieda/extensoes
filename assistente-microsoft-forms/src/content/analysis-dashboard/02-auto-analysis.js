

  function currentQuestionDomSignature() {
    try {
      const identities = Array.from(document.querySelectorAll('[id^="QuestionId_"]'), (node) => node.id).join(',');
      const wrappers = document.querySelectorAll('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"]').length;
      const radioGroups = document.querySelectorAll('[role="radiogroup"]').length;
      const optionContainers = document.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]').length;
      const sections = document.querySelectorAll('[data-automation-id*="section" i]').length;
      return [identities, wrappers, radioGroups, optionContainers, sections].join('|');
    } catch (_) {
      return '';
    }
  }

  function scheduleMapRefreshIfDomChanged() {
    if (APP.busy || APP.analysisRunning || document.hidden || APP.omrModeState?.active) return;
    if (document.getElementById('gssf-root')?.classList.contains('hidden')) return;
    if (Date.now() < APP.editingUntil || isActuallyEditingQuestion()) return;
    const signature = currentQuestionDomSignature();
    if (!signature) return;
    if (!APP.lastQuestionDomSignature) {
      APP.lastQuestionDomSignature = signature;
      return;
    }
    if (signature !== APP.lastQuestionDomSignature) {
      APP.lastQuestionDomSignature = signature;
      scheduleAutoAnalysis(650);
    }
  }

  function updateDashboardFromAudit(audit) {
    APP.lastQuestionDomSignature = currentQuestionDomSignature() || APP.lastQuestionDomSignature;
    resetLetterCapitalizeForNewForm(audit);
    const data = dataFromAudit(audit);
    if (audit.problems.length) data.warnings = [`${pluralPt(audit.problems.length, 'ponto de atenção', 'pontos de atenção')} no relatório`];
    updateDashboard(data);
    updateInlineReport(audit);
    updateActionAvailability(data);
  }

  async function runAutoAnalysis(showToast) {
    if (APP.busy || APP.analysisRunning || document.hidden || APP.omrModeState?.active) return;
    if (!showToast && document.getElementById('gssf-root')?.classList.contains('hidden')) return;
    if (!showToast && isActuallyEditingQuestion()) {
      scheduleAutoAnalysis(GSSF_TIMING.editingAnalysisMs);
      return;
    }
    const now = Date.now();
    if (!showToast && APP.lastAnalysisAt && now - APP.lastAnalysisAt < 2200) {
      scheduleAutoAnalysis(2300 - (now - APP.lastAnalysisAt));
      return;
    }
    APP.analysisRunning = true;
    const analysisStarted = Date.now();
    if (!isRealFormsDocument()) {
      const data = collectPrecheck();
      updateDashboard(data);
      updateActionAvailability(data);
      setInlineLoading('Abra um formulário real para usar o assistente.');
      APP.analysisRunning = false;
      APP.lastAnalysisAt = Date.now();
      return;
    }
    try {
      const audit = await auditPageCooperatively();
      if (!audit) {
        APP.analysisRunning = false;
        scheduleAutoAnalysis(GSSF_TIMING.editingAnalysisMs);
        return;
      }
      const hasContent = Boolean(audit.questions.length || audit.radioGroups);
      if (hasContent) APP.emptyAutoRetries = 0;
      if (auditLooksTransient(audit)) {
        const stable = APP.lastAudit;
        const data = dataFromAudit(stable);
        updateDashboard(data);
        updateActionAvailability(data);
        updateInlineReport(stable);
        const status = document.getElementById('gssf-status');
        if (status) {
          if (isActuallyEditingQuestion()) {
            status.className = 'gssf-status info';
            status.innerHTML = '<span class="gssf-status-icon">✎</span><span><b>Editando questão<span class="gssf-dots"><i>.</i><i>.</i><i>.</i></span></b><small>Leitura pausada durante a edição.</small></span>';
          } else if (pageMode() === 'visualização') {
            status.className = 'gssf-status warn';
            status.innerHTML = '<span class="gssf-status-icon">!</span><span><b>Você está na visualização.</b><small>Volte para a tela de edição do Forms.</small></span>';
          } else {
            status.className = 'gssf-status loading';
            status.innerHTML = '<span class="gssf-status-icon">↻</span><span><b>Atualizando leitura<span class="gssf-dots"><i>.</i><i>.</i><i>.</i></span></b><small>Conferindo as questões visíveis.</small></span>';
          }
        }
        APP.analysisRunning = false;
        APP.lastAnalysisAt = Date.now();
        return;
      }
      APP.lastAudit = audit;
      APP.questionAuditDirty = false;
      APP.lastQuestionDomSignature = currentQuestionDomSignature();
      resetLetterCapitalizeForNewForm(audit);
      const data = dataFromAudit(audit);
      updateDashboard(data);
      updateActionAvailability(data);
      updateInlineReport(audit);
      refreshOpenOmrBoard(audit);
      if (!hasContent && APP.emptyAutoRetries < 18) {
        APP.emptyAutoRetries += 1;
        setInlineLoading('Carregando formulário...');
        scheduleAutoAnalysis(1200);
      }
    } catch (error) {
      console.warn('Falha ao atualizar relatório embutido:', error);
      const data = collectPrecheck();
      updateDashboard(data);
      updateActionAvailability(data);
      if (!(data.questions || data.radioGroups)) {
        setInlineLoading('Carregando formulário...');
        if (APP.emptyAutoRetries < 18) {
          APP.emptyAutoRetries += 1;
          scheduleAutoAnalysis(1200);
        }
      }
    }
    if (showToast) toast('Análise atualizada.');
    APP.analysisRunning = false;
    APP.lastAnalysisAt = Date.now();
    const elapsed = APP.lastAnalysisAt - analysisStarted;
    if (elapsed > 1400) log(`Análise: ${elapsed} ms no total; maior etapa de leitura: ${APP.lastAnalysisLongestSliceMs || 0} ms.`, false);
  }

  function scheduleAutoAnalysis(delay = GSSF_TIMING.autoAnalysisMs) {
    if (document.hidden || APP.omrModeState?.active) return;
    const editingDelay = Date.now() < APP.editingUntil ? 2600 : 0;
    const safeDelay = Math.max(Number(delay) || 0, APP.busy ? 2200 : 900, editingDelay);
    clearTimeout(APP.autoTimer);
    APP.autoTimer = setTimeout(() => runAutoAnalysis(false), safeDelay);
  }

  function ensureInitialAnalysis() {
    clearInterval(APP.firstAnalysisTimer);
    APP.firstAnalysisAttempts = 0;
    APP.firstAnalysisTimer = setInterval(() => {
      const loaded = Boolean(APP.lastAudit?.questions?.length || APP.lastAudit?.radioGroups);
      if (loaded || APP.firstAnalysisAttempts >= 20) {
        clearInterval(APP.firstAnalysisTimer);
        APP.firstAnalysisTimer = null;
        return;
      }
      APP.firstAnalysisAttempts += 1;
      if (!APP.busy && hasRealFormShell()) runAutoAnalysis(false);
    }, 1500);
  }
