

  function addLifecycleEventListener(target, type, handler, options) {
    target?.addEventListener?.(type, handler, options);
    APP.lifecycle.listeners.push({ target, type, handler, options });
    return handler;
  }

  function lifecycleTimeout(handler, delay) {
    const id = setTimeout(() => {
      APP.lifecycle.pendingTimeouts.delete(id);
      if (!APP.lifecycle.destroyed) handler();
    }, delay);
    APP.lifecycle.pendingTimeouts.add(id);
    return id;
  }

  function clearAppTimers() {
    ['autoTimer','firstAnalysisTimer','mutationTimer','mapSignatureTimer','mapJumpToastTimer','mapJumpHighlightTimer','letterMapScrollTimer','logFlushTimer','overlayHideTimer'].forEach((key) => {
      clearTimeout(APP[key]);
      clearInterval(APP[key]);
      APP[key] = null;
    });
    Object.values(APP.progressTimers || {}).forEach((id) => clearTimeout(id));
    (APP.letterMapTrailTimers || []).forEach((id) => clearTimeout(id));
    APP.letterMapTrailTimers = [];
    APP.lifecycle.pendingTimeouts.forEach((id) => clearTimeout(id));
    APP.lifecycle.pendingTimeouts.clear();
    if (APP.mutationIdleCallback && typeof cancelIdleCallback === 'function') cancelIdleCallback(APP.mutationIdleCallback);
    APP.mutationIdleCallback = null;
    APP.progressTimers = {};
    APP.progressValues = {};
    APP.lastProgressState = {};
    APP.lastOverlayState = { pct: null, message: '', title: '' };
  }

  function destroyExtension() {
    if (!APP || APP.lifecycle.destroyed) return;
    APP.lifecycle.destroyed = true;
    clearTimeout(APP.eligibilityTimer);
    APP.eligibilityTimer = null;
    APP.eligibilityListeners.splice(0).forEach(({ target, type, handler, options }) => {
      try { target?.removeEventListener?.(type, handler, options); }
      catch (error) { reportNonFatalError('lifecycle:remover-listener-elegibilidade', error, { type }); }
    });
    deactivateQuizFeatures('extensão encerrada');
    try {
      if (!APP.extensionContextLost && APP.runtimeMessageHandler && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) chrome.runtime.onMessage.removeListener(APP.runtimeMessageHandler);
    } catch (error) {
      reportNonFatalError('lifecycle:remover-runtime-listener', error);
    }
    APP.runtimeMessageHandler = null;
    clearAppTimers();
    ['gssf-root','gssf-fab','gssf-toast','gssf-modal','gssf-confirm-modal','gssf-work-overlay','gssf-question-focus-marker'].forEach((id) => document.getElementById(id)?.remove());
    document.documentElement.classList.remove('gssf-docked-page', 'gssf-silent-work', 'gssf-omr-open');
    document.body?.classList.remove('gssf-docked-page');
  }

  function toggleTheme() {
    const root = document.getElementById('gssf-root');
    const next = root?.classList.contains('dark') ? 'light' : 'dark';
    setTheme(next);
    try {
      GSSF_STORAGE.setItem(GSSF_THEME_KEY, next);
      GSSF_THEME_LEGACY_KEYS.forEach((legacyKey) => GSSF_STORAGE.removeItem(legacyKey));
    } catch (error) {
      reportNonFatalError('tema:salvar', error);
    }
  }

  function applySavedTheme() {
    let theme = 'light';
    try {
      theme = GSSF_STORAGE.getItem(GSSF_THEME_KEY) || '';
      if (!theme) {
        for (const legacyKey of GSSF_THEME_LEGACY_KEYS) {
          theme = GSSF_STORAGE.getItem(legacyKey) || '';
          if (theme) {
            GSSF_STORAGE.setItem(GSSF_THEME_KEY, theme);
            GSSF_STORAGE.removeItem(legacyKey);
            break;
          }
        }
      }
    } catch (error) {
      reportNonFatalError('tema:ler', error);
    }
    setTheme(theme || 'light');
  }

  function setTheme(theme) {
    const dark = theme === 'dark';
    const root = document.getElementById('gssf-root');
    root?.classList.toggle('dark', dark);
    const btn = document.getElementById('gssf-theme');
    if (btn) {
      btn.textContent = dark ? '☀️' : '🌙';
      btn.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
      btn.setAttribute('aria-label', btn.title);
    }
  }
