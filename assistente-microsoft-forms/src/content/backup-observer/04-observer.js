

  function mutationTouchesOnlyIgnoredNodes(mutation) {
    const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
    if (target && isIgnoredAppNode(target)) return true;
    const changed = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])].filter(Boolean);
    const nodes = mutation.type === 'childList' && changed.length ? changed : [mutation.target];
    return nodes.length > 0 && nodes.every((node) => {
      const element = node.nodeType === 1 ? node : node.parentElement;
      return Boolean(element && isIgnoredAppNode(element));
    });
  }

  function formsObservationRoot() {
    const question = document.querySelector('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"]');
    return question?.closest?.('[data-automation-id="formDesigner"], [data-automation-id="formContent"], main, form')
      || document.querySelector('[data-automation-id="formDesigner"], [data-automation-id="formContent"], main, form')
      || document.body
      || document.documentElement;
  }

  function questionMutationContext(mutation) {
    const selector = '[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"]';
    const changed = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])]
      .filter((node) => node.nodeType === 1);
    if (mutation.type === 'childList' && changed.some((node) => node.matches?.(selector) || node.querySelector?.(selector))) {
      const added = [...(mutation.addedNodes || [])].find((node) => node.nodeType === 1 && (node.matches?.(selector) || node.querySelector?.(selector)));
      return { structural: true, target: added?.matches?.(selector) ? added : added?.querySelector?.(selector) || null };
    }
    const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
    const question = target?.closest?.(selector);
    if (question) return { structural: false, target: question };
    const section = target?.closest?.('[data-automation-id*="section" i]');
    return section ? { structural: false, target: null } : null;
  }

  function queueMutationAnalysis() {
    clearTimeout(APP.mutationTimer);
    if (APP.mutationIdleCallback && typeof cancelIdleCallback === 'function') cancelIdleCallback(APP.mutationIdleCallback);
    APP.mutationTimer = setTimeout(() => {
      const run = () => {
        APP.mutationIdleCallback = null;
        scheduleAutoAnalysis(900);
      };
      if (typeof requestIdleCallback === 'function') APP.mutationIdleCallback = requestIdleCallback(run, { timeout: GSSF_TIMING.mutationIdleTimeoutMs });
      else run();
    }, GSSF_TIMING.mutationDebounceMs);
  }

  function startAutoObserver() {
    try {
      APP.autoObserver?.disconnect?.();
      APP.autoObserver = new MutationObserver((mutations) => {
        if (APP.lifecycle.destroyed) return;
        const changes = mutations.filter((mutation) => !mutationTouchesOnlyIgnoredNodes(mutation));
        if (!changes.length) return;
        const relevant = changes.map(questionMutationContext).filter(Boolean);
        if (!relevant.length) return;
        APP.questionContentRevision = (APP.questionContentRevision || 0) + 1;
        APP.questionAuditDirty = true;
        APP.sectionBlocksCache = null;
        if (APP.busy || document.hidden || APP.omrModeState?.active) return;
        const now = Date.now();
        if (now - APP.lastMutationAt < GSSF_TIMING.mutationGuardMs) return;
        APP.lastMutationAt = now;
        queueMutationAnalysis();
      });
      APP.autoObserver.observe(formsObservationRoot(), {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-checked','aria-selected','data-is-correct','data-correct','data-answer','data-selected','data-checked']
      });
    } catch (error) {
      console.warn('Falha ao iniciar observação otimizada do formulário:', error);
    }
    const markEditing = (event) => {
      const target = event?.target;
      if (!target || isIgnoredAppNode(target)) return;
      const tag = (target.tagName || '').toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || target.isContentEditable || target.getAttribute?.('role') === 'textbox';
      if (!editable && !isQuestionActivityTarget(target, false)) return;
      const now = Date.now();
      markQuestionEditing();
      if (now - APP.lastMarkEditingAt > 1400) {
        APP.lastMarkEditingAt = now;
        scheduleAutoAnalysis(2600);
      }
    };
    const scheduleMapAfterInteraction = (event) => {
      if (event?.target && isIgnoredAppNode(event.target)) return;
      clearTimeout(APP.interactionMapTimer);
      APP.interactionMapTimer = lifecycleTimeout(scheduleMapRefreshIfDomChanged, GSSF_TIMING.interactionMapRefreshMs);
    };
    const scheduleFocusAnalysis = refreshAnalysisAfterFocus;
    const scheduleVisibilityAnalysis = () => { if (!document.hidden) refreshAnalysisAfterFocus(); };
    addLifecycleEventListener(document, 'pointerdown', markEditing, true);
    addLifecycleEventListener(document, 'focusin', markEditing, true);
    addLifecycleEventListener(document, 'input', markEditing, true);
    addLifecycleEventListener(document, 'keydown', markEditing, true);
    addLifecycleEventListener(document, 'click', scheduleMapAfterInteraction, true);
    addLifecycleEventListener(document, 'pointerup', scheduleMapAfterInteraction, true);
    addLifecycleEventListener(document, 'scroll', scheduleActiveLetterMapUpdate, { capture: true, passive: true });
    addLifecycleEventListener(window, 'scroll', scheduleActiveLetterMapUpdate, { passive: true });
    clearInterval(APP.mapSignatureTimer);
    APP.mapSignatureTimer = setInterval(() => {
      if (!document.hidden && !APP.busy && !APP.analysisRunning) scheduleMapRefreshIfDomChanged();
    }, GSSF_TIMING.mapSignatureIntervalMs);
    addLifecycleEventListener(window, 'focus', scheduleFocusAnalysis);
    addLifecycleEventListener(document, 'visibilitychange', scheduleVisibilityAnalysis);
  }

  function refreshAnalysisAfterFocus() {
    if (document.hidden || APP.lifecycle.destroyed) return;
    if (!APP.lastAudit || APP.questionAuditDirty) scheduleAutoAnalysis(800);
    else scheduleMapRefreshIfDomChanged();
  }
