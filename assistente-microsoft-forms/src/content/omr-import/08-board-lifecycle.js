

  function refreshOpenOmrBoard(audit) {
    const modal = document.getElementById('gssf-modal');
    if (!modal || !modal.classList.contains('omr-mode') || !modal.classList.contains('show')) return;
    renderOmrMainIntoModal(audit);
    renderImportSourceList(audit, { sourceFormId: APP.omrImportState.sourceFormId });
  }

  function startImportFlightAnimation(card, triggerElement, questionNumber, answer) {
    const bubble = answer ? document.querySelector(`#omr-sheet .omr-bubble[data-q="${questionNumber}"][data-letter="${answer}"]`) : null;
    const anchor = triggerElement || card;
    if (!card || !anchor || !bubble) return;
    try {
      const anchorRect = anchor.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.className = 'gssf-import-flight-layer';
      const particle = document.createElement('div');
      particle.className = `gssf-import-flight-card ${card.classList.contains('match-different') ? 'danger' : card.classList.contains('match-blank') ? 'ok' : ''}`;
      particle.innerHTML = `<span class="gssf-import-flight-q">Q${questionNumber}</span><span class="gssf-import-flight-a">${escapeHtml(answer || '')}</span>`;
      const trail = document.createElement('div');
      trail.className = 'gssf-import-flight-trail';
      const pulse = document.createElement('div');
      pulse.className = 'gssf-import-flight-pulse';
      overlay.appendChild(trail);
      overlay.appendChild(particle);
      overlay.appendChild(pulse);
      document.body.appendChild(overlay);
      const startX = anchorRect.left + (anchorRect.width / 2);
      const startY = anchorRect.top + (anchorRect.height / 2);
      const endX = bubbleRect.left + (bubbleRect.width / 2);
      const endY = bubbleRect.top + (bubbleRect.height / 2);
      const dx = endX - startX;
      const dy = endY - startY;
      const cp1X = startX + (dx * 0.34);
      const cp1Y = startY + Math.sign(dy || 1) * Math.min(18, Math.abs(dx) * 0.02);
      const cp2X = startX + (dx * 0.72);
      const cp2Y = endY - Math.min(28, Math.abs(dx) * 0.035);
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      particle.style.left = `${startX}px`;
      particle.style.top = `${startY}px`;
      trail.style.left = `${startX}px`;
      trail.style.top = `${startY}px`;
      trail.style.width = `${distance}px`;
      trail.style.transform = `rotate(${angle}deg)`;
      pulse.style.left = `${endX}px`;
      pulse.style.top = `${endY}px`;
      requestAnimationFrame(() => {
        trail.classList.add('run');
        pulse.classList.add('run');
        particle.animate([
          { offset: 0, left: `${startX}px`, top: `${startY}px`, transform: 'translate(-50%, -50%) scale(.92)', opacity: 0 },
          { offset: 0.08, left: `${startX}px`, top: `${startY}px`, transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { offset: 0.38, left: `${cp1X}px`, top: `${cp1Y}px`, transform: 'translate(-50%, -50%) scale(1.02)', opacity: 1 },
          { offset: 0.74, left: `${cp2X}px`, top: `${cp2Y}px`, transform: 'translate(-50%, -50%) scale(.88)', opacity: .96 },
          { offset: 1, left: `${endX}px`, top: `${endY}px`, transform: 'translate(-50%, -50%) scale(.18)', opacity: 0 }
        ], { duration: 760, easing: 'cubic-bezier(.18,.86,.24,1)', fill: 'forwards' });
        trail.animate([
          { opacity: 0, transform: `rotate(${angle}deg) scaleX(.04)` },
          { opacity: .92, transform: `rotate(${angle}deg) scaleX(.72)`, offset: .58 },
          { opacity: .22, transform: `rotate(${angle}deg) scaleX(1)`, offset: .82 },
          { opacity: 0, transform: `rotate(${angle}deg) scaleX(1)`, offset: 1 }
        ], { duration: 700, easing: 'cubic-bezier(.2,.82,.24,1)', fill: 'forwards' });
      });
      setTimeout(() => overlay.remove(), 920);
    } catch (_) {}
  }

  function registerPendingOmrBubbleEffect(number, letter, delayMs = 70) {
    if (!number || !letter) return;
    const now = Date.now();
    APP.omrImportState.pendingBubbleEffects = (APP.omrImportState.pendingBubbleEffects || []).filter((item) => Number(item.endsAt || 0) > now);
    APP.omrImportState.pendingBubbleEffects.push({ number: Number(number), letter: String(letter).toUpperCase(), startsAt: now + Math.max(0, Number(delayMs || 0)), endsAt: now + Math.max(1100, Number(delayMs || 0) + 980) });
  }

  function replayPendingOmrBubbleEffects() {
    const now = Date.now();
    const pending = (APP.omrImportState.pendingBubbleEffects || []).filter((item) => Number(item.endsAt || 0) > now);
    APP.omrImportState.pendingBubbleEffects = pending;
    pending.forEach((item) => {
      const btn = document.querySelector(`#omr-sheet .omr-bubble[data-q="${item.number}"][data-letter="${item.letter}"]`);
      if (!btn) return;
      const startIn = Math.max(0, Number(item.startsAt || 0) - Date.now());
      setTimeout(() => {
        if (!btn.isConnected) return;
        const glow = document.createElement('span');
        glow.className = 'omr-bubble-glow';
        btn.appendChild(glow);
        setTimeout(() => { try { glow.remove(); } catch (_) {} }, Math.max(320, item.endsAt - Date.now()));
      }, startIn);
    });
  }

  function renderOmrMainIntoModal(audit) {
    const modal = document.getElementById('gssf-modal');
    const currentPane = modal?.querySelector('#gssf-omr-current');
    if (!currentPane) return;
    currentPane.innerHTML = omrMainBodyHtml(audit);
    attachReportInteractivity({ document, closed: false }, audit);
    currentPane.querySelector('#gssf-omr-risk-reset')?.addEventListener('click', () => { document.getElementById('gssf-omr-reset')?.click(); });
    replayPendingOmrBubbleEffects();
  }

  function stopOmrLiveUpdates() {
    const state = APP.omrImportState;
    clearTimeout(state.refreshTimer);
    clearInterval(state.periodicTimer);
    state.refreshTimer = null;
    state.periodicTimer = null;
    try { if (state.storageHandler && chrome?.storage?.onChanged) chrome.storage.onChanged.removeListener(state.storageHandler); } catch (_) {}
    if (state.customHandler) window.removeEventListener('gssf-forms-bank-changed', state.customHandler);
    if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler, true);
    state.closeObserver?.disconnect?.();
    state.storageHandler = null;
    state.customHandler = null;
    state.keyHandler = null;
    state.closeObserver = null;
    state.pendingBubbleEffects = [];
    state.singleQueue = Promise.resolve();
    state.questionListScrollTop = 0;
    state.sourceCardsScrollTop = 0;
    state.sectionLaunchCollapsed = readSectionLaunchCollapsedPref();
    state.launchedSectionKeys = {};
  }

  function closeOmrBoard({ refresh = true } = {}) {
    const modal = document.getElementById('gssf-modal');
    const audit = APP.lastAudit;
    const previousFocus = APP.omrImportState.previousFocus;
    stopOmrLiveUpdates();
    globalThis.GSSFAnswerCard?.unmount?.();
    globalThis.GSSFPrinting?.unmount?.();
    globalThis.GSSFDiagnostic?.unmount?.();
    globalThis.GSSFOrganizer?.unmount?.();
    try {
      modal?.classList.remove('show', 'omr-mode', 'response-tools-mode');
      if (modal) modal.innerHTML = '';
    } finally {
      APP.omrImportState.sourceFormId = '';
      APP.omrImportState.message = '';
      APP.omrImportState.bankSignature = '';
      APP.omrImportState.sectionLaunchCollapsed = readSectionLaunchCollapsedPref();
      APP.omrImportState.launchedSectionKeys = {};
      exitOmrMode();
      APP.omrImportState.previousFocus = null;
    }
    if (previousFocus?.isConnected) setTimeout(() => previousFocus.focus(), 0);
    if (refresh && audit) updateInlineReport(audit);
  }

  function scheduleOmrBankRefresh(audit, reason = '') {
    clearTimeout(APP.omrImportState.refreshTimer);
    APP.omrImportState.refreshTimer = setTimeout(() => {
      const modal = document.getElementById('gssf-modal');
      if (!APP.omrModeState?.active || !modal?.classList.contains('show')) return;
      const latestAudit = APP.lastAudit || audit;
      const nextSignature = omrBankUiSignature(latestAudit);
      if (nextSignature === APP.omrImportState.bankSignature) return;
      const selectedSourceId = APP.omrImportState.sourceFormId;
      renderOmrMainIntoModal(latestAudit);
      renderImportSourceList(latestAudit, {
        sourceFormId: selectedSourceId,
        message: ''
      });
    }, 180);
  }

  function startOmrLiveUpdates(audit) {
    stopOmrLiveUpdates();
    APP.omrImportState.bankSignature = omrBankUiSignature(audit);
    APP.omrImportState.storageHandler = (changes, areaName) => {
      if (areaName !== 'local') return;
      const keys = Object.keys(changes || {});
      if (keys.some((key) => key === GSSF_STORAGE.canonicalKey(formsBankKey()) || key.startsWith('gssf:forms_bank_') || key.startsWith('gssf:omr_manual_'))) scheduleOmrBankRefresh(audit, 'storage');
    };
    APP.omrImportState.customHandler = () => scheduleOmrBankRefresh(audit, 'interno');
    APP.omrImportState.keyHandler = (event) => {
      if (document.getElementById('gssf-confirm-modal')?.classList.contains('show')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeOmrBoard();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector('#gssf-modal.show .gssf-omr-dialog');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    try { chrome?.storage?.onChanged?.addListener(APP.omrImportState.storageHandler); } catch (_) {}
    window.addEventListener('gssf-forms-bank-changed', APP.omrImportState.customHandler);
    document.addEventListener('keydown', APP.omrImportState.keyHandler, true);
    APP.omrImportState.periodicTimer = setInterval(() => {
      const modal = document.getElementById('gssf-modal');
      if (!modal?.isConnected || !modal.classList.contains('show') || !modal.classList.contains('omr-mode')) {
        closeOmrBoard({ refresh: false });
        return;
      }
      scheduleOmrBankRefresh(audit, 'verificação');
    }, 2400);
    try {
      const modal = document.getElementById('gssf-modal');
      const observer = new MutationObserver(() => {
        if (!APP.omrModeState?.active) return;
        const current = document.getElementById('gssf-modal');
        if (!current?.isConnected || !current.classList.contains('show') || !current.classList.contains('omr-mode') || !current.querySelector('.gssf-omr-dialog')) closeOmrBoard({ refresh: false });
      });
      if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
      observer.observe(document.documentElement, { childList: true });
      APP.omrImportState.closeObserver = observer;
    } catch (_) {}
  }

  function openOmrBoard() {
    if (APP.busy) return;
    if (!isRealFormsDocument()) { toast('Abra um formulário real.'); return; }
    const audit = APP.lastAudit || auditPage();
    APP.lastAudit = audit;
    updateInlineReport(audit);
    let modal = document.getElementById('gssf-modal');
    try {
      enterOmrMode();
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gssf-modal';
        document.documentElement.appendChild(modal);
      }
      APP.omrImportState.sourceFormId = '';
      APP.omrImportState.message = '';
      APP.omrImportState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.classList.add('omr-mode', 'response-tools-mode');
      modal.innerHTML = responseToolsDialogHtml(audit);
      bindResponseToolsShell(modal);
      modal.querySelector('#gssf-omr-close')?.addEventListener('click', () => closeOmrBoard());
      modal.onclick = (event) => { if (event.target === modal) closeOmrBoard(); };
      modal.classList.add('show');
      setTimeout(() => modal.querySelector('#gssf-omr-close')?.focus(), 0);
      renderOmrMainIntoModal(audit);
      renderImportSourceList(audit);
      startOmrLiveUpdates(audit);
    } catch (error) {
      console.error('Falha ao abrir gabarito:', error);
      closeOmrBoard({ refresh: false });
      toast('Não foi possível abrir o gabarito.');
    }
  }

  function openHtmlReport(audit, targetWindow) {
    const html = buildHtmlReport(audit);
    let reportWindow = targetWindow;
    if (!reportWindow || reportWindow.closed) {
      reportWindow = window.open('', '_blank');
    }
    if (!reportWindow || reportWindow.closed) {
      toast('A aba do relatório foi bloqueada.');
      return;
    }

    const written = writeHtmlToWindow(reportWindow, html);
    if (written) {
      try { reportWindow.focus(); } catch (_) {}
      setTimeout(() => attachReportInteractivity(reportWindow, audit), 80);
      setTimeout(() => attachReportInteractivity(reportWindow, audit), 500);
      return;
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try { reportWindow.location.href = url; }
    catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); }
    setTimeout(() => URL.revokeObjectURL(url), 180000);
  }

  async function runAudit(openReport) {
    if (APP.busy) return;
    let reportWindow = null;
    if (openReport) {
      reportWindow = window.open('', '_blank');
      writeHtmlToWindow(reportWindow, buildLoadingReportHtml());
    }
    await withBusy(async () => {
      if (!isRealFormsDocument()) { log('Abra um formulário real do Microsoft Forms antes de gerar relatório.'); return; }
      const audit = auditPage();
      APP.lastAudit = audit;
      updateDashboardFromAudit(audit);
      updateInlineReport(audit);
      log(`Relatório atualizado. Questões: ${audit.questions.length}; gabarito: ${audit.answerKey.length}; pendências: ${audit.problems.length}.`);
      if (openReport) openHtmlReport(audit, reportWindow);
    });
  }

  function downloadLastReport() {
    const audit = APP.lastAudit || auditPage();
    APP.lastAudit = audit;
    downloadFile('relatorio-simulado-forms.txt', buildTextReport(audit));
    log('TXT do relatório baixado.');
    toast('TXT baixado.');
  }

