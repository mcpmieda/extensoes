  // ===== 71-response-tools-shell.js =====
// Fonte modular: shell nativo das Ferramentas de Respostas.
  const GSSF_RESPONSE_TOOLS_TABS = Object.freeze([
    { id: 'gabarito', index: 0, label: 'Gabarito', description: 'Gabarito atual e importação de respostas.' },
    { id: 'cartao-resposta', index: 1, label: 'Cartão-resposta', description: 'Preparação e impressão dos cartões dos alunos.' },
    { id: 'impressao', index: 2, label: 'Impressão', description: 'Impressão de notas e devolutivas pedagógicas.' },
    { id: 'diagnostico', index: 3, label: 'Diagnóstico', description: 'Acompanhamento pedagógico por avaliações.' },
    { id: 'organizador', index: 4, label: 'Organizador', description: 'Organização dos conteúdos das avaliações por turma.' }
  ]);
  const GSSF_RESPONSE_TOOLS_TRANSITION_MS = 510;
  const GSSF_RESPONSE_TOOLS_MOTION_REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensureResponseToolsState() {
    if (!APP.responseToolsState || typeof APP.responseToolsState !== 'object') {
      APP.responseToolsState = { activeTab: 'gabarito', switchTimer: 0, switchToken: 0 };
    }
    if (!GSSF_RESPONSE_TOOLS_TABS.some((tab) => tab.id === APP.responseToolsState.activeTab)) {
      APP.responseToolsState.activeTab = 'gabarito';
    }
    return APP.responseToolsState;
  }

  function responseToolsTabsHtml() {
    return `<div class="gssf-response-tools-switch" role="tablist" aria-label="Ferramentas de respostas">
      <span class="gssf-response-tools-slider" aria-hidden="true"></span>
      ${GSSF_RESPONSE_TOOLS_TABS.map((tab, index) => `<button type="button" class="gssf-response-tools-tab${index === 0 ? ' active' : ''}" id="gssf-response-tab-${tab.id}" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" aria-controls="gssf-response-panel-${tab.id}" tabindex="${index === 0 ? '0' : '-1'}" data-response-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join('')}
    </div>`;
  }

  function responseToolsPlaceholderHtml(tab) {
    return `<section class="gssf-response-tools-placeholder" aria-labelledby="gssf-response-placeholder-title-${tab.id}">
      <div class="gssf-response-tools-placeholder-icon" aria-hidden="true">${tab.id === 'cartao-resposta' ? '▤' : tab.id === 'impressao' ? '▣' : '◫'}</div>
      <strong id="gssf-response-placeholder-title-${tab.id}">${escapeHtml(tab.label)}</strong>
      <p>${escapeHtml(tab.description)}</p>
      <span>Área preparada para a próxima etapa da integração nativa.</span>
    </section>`;
  }

  function responseToolsPanelsHtml() {
    const cardTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'cartao-resposta');
    const printTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'impressao');
    const diagnosticTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'diagnostico');
    const organizerTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'organizador');
    const cardContent = globalThis.GSSFAnswerCard?.workspaceHtml?.() || responseToolsPlaceholderHtml(cardTab);
    const printContent = globalThis.GSSFPrinting?.workspaceHtml?.() || responseToolsPlaceholderHtml(printTab);
    const diagnosticContent = globalThis.GSSFDiagnostic?.workspaceHtml?.() || responseToolsPlaceholderHtml(diagnosticTab);
    const organizerContent = globalThis.GSSFOrganizer?.workspaceHtml?.() || responseToolsPlaceholderHtml(organizerTab);
    return `<div class="gssf-response-tools-panels">
      <section class="gssf-response-tools-panel active" id="gssf-response-panel-gabarito" role="tabpanel" aria-labelledby="gssf-response-tab-gabarito" data-response-panel="gabarito">
        <div class="gssf-omr-body gssf-omr-layout">
          <section class="gssf-omr-current-column" aria-label="Gabarito atual">
            <div id="gssf-omr-current" class="gssf-omr-current-scroll"></div>
          </section>
          <aside class="gssf-omr-source-column" aria-label="Origem das respostas">
            <div class="gssf-omr-source-head"><strong>Origem das respostas</strong><span>Escolha outro Forms e selecione somente o que deseja importar.</span></div>
            <div id="gssf-omr-source-pane" class="gssf-omr-source-pane"></div>
          </aside>
        </div>
      </section>
      <section class="gssf-response-tools-panel" id="gssf-response-panel-cartao-resposta" role="tabpanel" aria-labelledby="gssf-response-tab-cartao-resposta" data-response-panel="cartao-resposta" hidden>${cardContent}</section>
      <section class="gssf-response-tools-panel" id="gssf-response-panel-impressao" role="tabpanel" aria-labelledby="gssf-response-tab-impressao" data-response-panel="impressao" hidden>${printContent}</section>
      <section class="gssf-response-tools-panel" id="gssf-response-panel-diagnostico" role="tabpanel" aria-labelledby="gssf-response-tab-diagnostico" data-response-panel="diagnostico" hidden>${diagnosticContent}</section>
      <section class="gssf-response-tools-panel" id="gssf-response-panel-organizador" role="tabpanel" aria-labelledby="gssf-response-tab-organizador" data-response-panel="organizador" hidden>${organizerContent}</section>
    </div>`;
  }

  function responseToolsDialogHtml() {
    return `<div class="gssf-omr-dialog gssf-response-tools-dialog" role="dialog" aria-modal="true" aria-label="Ferramentas de respostas" tabindex="-1">
      <div class="gssf-omr-head gssf-response-tools-head">
        ${responseToolsTabsHtml()}
        <div class="gssf-response-tools-head-actions">
          <button type="button" id="gssf-omr-close" class="gssf-icon" data-allow-busy="1" title="Fechar ferramentas de respostas" aria-label="Fechar ferramentas de respostas">×</button>
        </div>
      </div>
      ${responseToolsPanelsHtml()}
    </div>`;
  }

  function updateResponseToolsSlider(modal, activeButton) {
    if (!modal || !activeButton || typeof modal.querySelector !== 'function') return;
    const switcher = modal.querySelector('.gssf-response-tools-switch');
    const slider = switcher?.querySelector?.('.gssf-response-tools-slider');
    if (!switcher || !slider || !Number.isFinite(activeButton.offsetWidth)) return;
    const inset = typeof getComputedStyle === 'function' ? (parseFloat(getComputedStyle(switcher).paddingLeft) || 0) : 0;
    slider.style.width = `${activeButton.offsetWidth}px`;
    slider.style.transform = `translateX(${Math.max(0, activeButton.offsetLeft - inset)}px)`;
  }

  function responseToolsPanel(modal, tabId) {
    return modal?.querySelector?.(`[data-response-panel="${String(tabId || '')}"]`) || null;
  }

  function responseToolsActivateModule(tabOrId) {
    const tab = typeof tabOrId === 'object' && tabOrId
      ? tabOrId
      : GSSF_RESPONSE_TOOLS_TABS.find((item) => item.id === String(tabOrId || ''));
    if (!tab) return;
    if (tab.id === 'cartao-resposta') globalThis.GSSFAnswerCard?.activate?.();
    if (tab.id === 'impressao') globalThis.GSSFPrinting?.activate?.();
    if (tab.id === 'diagnostico') globalThis.GSSFDiagnostic?.activate?.();
    if (tab.id === 'organizador') globalThis.GSSFOrganizer?.activate?.();
  }

  function clearResponseToolsTimer(timerId) {
    if (!timerId || typeof globalThis.clearTimeout !== 'function') return;
    globalThis.clearTimeout(timerId);
  }

  function scheduleResponseToolsTimer(callback, delay) {
    if (typeof globalThis.setTimeout === 'function') return globalThis.setTimeout(callback, delay);
    callback();
    return 0;
  }

  function scheduleResponseToolsFrame(callback) {
    if (typeof globalThis.requestAnimationFrame === 'function') return globalThis.requestAnimationFrame(callback);
    callback();
    return 0;
  }

  function settleResponseToolsWorkspace(modal, tabId) {
    const state = ensureResponseToolsState();
    clearResponseToolsTimer(state.switchTimer);
    state.switchTimer = 0;
    state.switchToken = Number(state.switchToken || 0) + 1;
    modal?.querySelectorAll?.('[data-response-panel]').forEach((panel) => {
      const active = panel.dataset.responsePanel === tabId;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
      panel.classList.remove('is-enter-left', 'is-enter-right', 'is-leave-left', 'is-leave-right');
      panel.setAttribute('aria-hidden', String(!active));
    });
  }

  function finishResponseToolsWorkspace(modal, outgoing, incoming, token, tabId) {
    const state = ensureResponseToolsState();
    if (token !== state.switchToken) return;
    state.switchTimer = 0;
    outgoing.hidden = true;
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.classList.remove('active', 'is-enter-left', 'is-enter-right', 'is-leave-left', 'is-leave-right');
    incoming.classList.remove('is-enter-left', 'is-enter-right', 'is-leave-left', 'is-leave-right');
    incoming.classList.add('active');
    incoming.setAttribute('aria-hidden', 'false');
    scheduleResponseToolsFrame(() => responseToolsActivateModule(tabId));
  }

  function selectResponseToolsTab(tabId, { focus = false, animate = true } = {}) {
    const modal = document.getElementById('gssf-modal');
    const requested = String(tabId || '');
    const tab = GSSF_RESPONSE_TOOLS_TABS.find((item) => item.id === requested) || GSSF_RESPONSE_TOOLS_TABS[0];
    const state = ensureResponseToolsState();
    const previousId = state.activeTab;
    const previousTab = GSSF_RESPONSE_TOOLS_TABS.find((item) => item.id === previousId) || GSSF_RESPONSE_TOOLS_TABS[0];
    const incoming = responseToolsPanel(modal, tab.id);
    const outgoing = responseToolsPanel(modal, previousTab.id);
    let activeButton = null;

    modal?.querySelectorAll('[data-response-tab]').forEach((button) => {
      const active = button.dataset.responseTab === tab.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
      if (active) activeButton = button;
      if (active && focus) button.focus();
    });

    settleResponseToolsWorkspace(modal, previousTab.id);
    responseToolsActivateModule(tab);

    if (!incoming || !outgoing || previousTab.id === tab.id || !animate || GSSF_RESPONSE_TOOLS_MOTION_REDUCED) {
      state.activeTab = tab.id;
      settleResponseToolsWorkspace(modal, tab.id);
      scheduleResponseToolsFrame(() => responseToolsActivateModule(tab));
    } else {
      const token = Number(state.switchToken || 0) + 1;
      state.switchToken = token;
      const forward = tab.index > previousTab.index;
      incoming.hidden = false;
      incoming.setAttribute('aria-hidden', 'false');
      incoming.classList.remove('active', 'is-leave-left', 'is-leave-right');
      outgoing.classList.remove('is-enter-left', 'is-enter-right', 'is-leave-left', 'is-leave-right');
      incoming.classList.add(forward ? 'is-enter-right' : 'is-enter-left');
      void incoming.offsetWidth;
      outgoing.classList.remove('active');
      outgoing.classList.add(forward ? 'is-leave-left' : 'is-leave-right');
      incoming.classList.remove('is-enter-left', 'is-enter-right');
      incoming.classList.add('active');
      state.activeTab = tab.id;
      state.switchTimer = scheduleResponseToolsTimer(
        () => finishResponseToolsWorkspace(modal, outgoing, incoming, token, tab.id),
        GSSF_RESPONSE_TOOLS_TRANSITION_MS
      );
    }

    globalThis.GSSFSharedBridge?.updateGlobalContext?.({ activeTool: tab.id }, 'tab-change');
    scheduleResponseToolsFrame(() => updateResponseToolsSlider(modal, activeButton));
  }

  function bindResponseToolsShell(modal) {
    if (!modal) return;
    const responseState = ensureResponseToolsState();
    responseState.activeTab = 'gabarito';
    clearResponseToolsTimer(responseState.switchTimer);
    responseState.switchTimer = 0;
    const tabs = Array.from(modal.querySelectorAll('[data-response-tab]'));
    tabs.forEach((button) => button.addEventListener('click', () => selectResponseToolsTab(button.dataset.responseTab)));
    modal.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      selectResponseToolsTab(tabs[nextIndex]?.dataset.responseTab, { focus: true });
    });
    APP.responseToolsResizeObserver?.disconnect?.();
    const switcher = modal.querySelector('.gssf-response-tools-switch');
    if (switcher && typeof ResizeObserver === 'function') {
      APP.responseToolsResizeObserver = new ResizeObserver(() => {
        const activeButton = modal.querySelector('[data-response-tab].active');
        updateResponseToolsSlider(modal, activeButton);
      });
      APP.responseToolsResizeObserver.observe(switcher);
    }
    const cardPanel = modal.querySelector('#gssf-response-panel-cartao-resposta');
    Promise.resolve(globalThis.GSSFAnswerCard?.mount?.(cardPanel)).catch((error) => {
      console.error('Falha ao iniciar Cartão-resposta:', error);
      const cardTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'cartao-resposta');
      if (cardPanel && cardTab) cardPanel.innerHTML = responseToolsPlaceholderHtml({ ...cardTab, description: 'Não foi possível iniciar esta ferramenta.' });
    });
    const printPanel = modal.querySelector('#gssf-response-panel-impressao');
    Promise.resolve(globalThis.GSSFPrinting?.mount?.(printPanel)).catch((error) => {
      console.error('Falha ao iniciar Impressão:', error);
      const printTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'impressao');
      if (printPanel && printTab) printPanel.innerHTML = responseToolsPlaceholderHtml({ ...printTab, description: 'Não foi possível iniciar esta ferramenta.' });
    });
    const diagnosticPanel = modal.querySelector('#gssf-response-panel-diagnostico');
    Promise.resolve(globalThis.GSSFDiagnostic?.mount?.(diagnosticPanel)).catch((error) => {
      console.error('Falha ao iniciar Diagnóstico:', error);
      const diagnosticTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'diagnostico');
      if (diagnosticPanel && diagnosticTab) diagnosticPanel.innerHTML = responseToolsPlaceholderHtml({ ...diagnosticTab, description: 'Não foi possível iniciar esta ferramenta.' });
    });
    const organizerPanel = modal.querySelector('#gssf-response-panel-organizador');
    Promise.resolve(globalThis.GSSFOrganizer?.mount?.(organizerPanel)).catch((error) => {
      console.error('Falha ao iniciar Organizador:', error);
      const organizerTab = GSSF_RESPONSE_TOOLS_TABS.find((tab) => tab.id === 'organizador');
      if (organizerPanel && organizerTab) organizerPanel.innerHTML = responseToolsPlaceholderHtml({ ...organizerTab, description: 'Não foi possível iniciar esta ferramenta.' });
    });
    selectResponseToolsTab('gabarito');
  }

  globalThis.GSSFResponseTools = Object.freeze({
    selectTab: (tabId, options = {}) => selectResponseToolsTab(tabId, options),
    getActiveTab: () => ensureResponseToolsState().activeTab
  });

