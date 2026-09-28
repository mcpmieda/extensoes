

  function logoSvg() {
    return '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="7" y="7" width="50" height="50" rx="16" fill="currentColor" opacity=".16"/><path d="M42 19H27.5c-4.9 0-8.5 2.8-8.5 7.1 0 4.1 3.1 6.1 8.6 7.1l7.1 1.3c3.1.6 4.4 1.4 4.4 3.2 0 2-1.9 3.3-5.2 3.3H19" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M21 48h15.1c5.3 0 9.1-2.8 9.1-7.5 0-4.1-2.7-6.3-8.7-7.5l-7.1-1.4c-2.8-.5-4.1-1.4-4.1-3.1 0-1.9 1.8-3.1 4.8-3.1H43" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>';
  }

  function fabSvg() {
    return '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="5" y="5" width="54" height="54" rx="18" fill="rgba(255,255,255,.16)"/><path d="M42 19H27.5c-4.9 0-8.5 2.8-8.5 7.1 0 4.1 3.1 6.1 8.6 7.1l7.1 1.3c3.1.6 4.4 1.4 4.4 3.2 0 2-1.9 3.3-5.2 3.3H19" stroke="white" stroke-width="6" stroke-linecap="round"/><path d="M21 48h15.1c5.3 0 9.1-2.8 9.1-7.5 0-4.1-2.7-6.3-8.7-7.5l-7.1-1.4c-2.8-.5-4.1-1.4-4.1-3.1 0-1.9 1.8-3.1 4.8-3.1H43" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';
  }

  function kpiIconSvg(kind) {
    const icons = {
      questions: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5.75h7.75L19 9v9.25A1.75 1.75 0 0 1 17.25 20h-9.5A1.75 1.75 0 0 1 6 18.25v-10.5A1.75 1.75 0 0 1 7.75 6H8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M15.5 5.75V9H18.75" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 12h6M9 15.25h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      options: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.25 7h9M9.25 12h9M9.25 17h9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M5.25 7.25h.01M5.25 12.25h.01M5.25 17.25h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
      images: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.25" y="5.25" width="15.5" height="13.5" rx="2.25" stroke="currentColor" stroke-width="1.9"/><path d="M7.25 15.75l3.15-3.15a1 1 0 0 1 1.42 0l1.43 1.43a1 1 0 0 0 1.42 0l2.11-2.11a1 1 0 0 1 1.42 0l1.57 1.57" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="9.25" r="1.35" fill="currentColor"/></svg>',
      sections: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.25" y="5.25" width="15.5" height="4.5" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="4.25" y="11.75" width="15.5" height="3.5" rx="1.25" stroke="currentColor" stroke-width="1.9"/><rect x="4.25" y="17.25" width="9.5" height="2.5" rx="1.1" fill="currentColor" opacity=".95"/></svg>'
    };
    return icons[kind] || icons.questions;
  }

  function bindPanelGlow(root) {
    if (!root || root.dataset.glowBound === '1') return;
    root.dataset.glowBound = '1';
    root.addEventListener('pointermove', (event) => {
      const r = root.getBoundingClientRect();
      root.style.setProperty('--gssf-mx', `${Math.round(event.clientX - r.left)}px`);
      root.style.setProperty('--gssf-my', `${Math.round(event.clientY - r.top)}px`);
    }, { passive: true });
  }

  function createPanel() {
    if (document.getElementById('gssf-root')) return;

    const root = document.createElement('section');
    root.id = 'gssf-root';
    root.setAttribute('aria-label', APP.name);
    root.innerHTML = `
      <div class="gssf-head">
        <div class="gssf-brandrow">
          <div class="gssf-logo">${logoSvg()}</div>
          <div class="gssf-titlebox">
            <div class="gssf-title">ASSISTENTE DE FORMS</div>
            <div class="gssf-subtitle"><span>${APP.brand}</span><small>${APP.version.toLowerCase()}</small></div>
          </div>
        </div>
        <div class="gssf-head-actions">
          <button id="gssf-theme" class="gssf-icon" type="button" data-allow-busy="1" title="Alternar modo claro/escuro" aria-label="Alternar modo claro ou escuro">🌙</button>
          <button id="gssf-clear-data" class="gssf-icon" type="button" data-allow-busy="1" title="Limpar todos os dados salvos do app" aria-label="Limpar todos os dados salvos do app">🧹</button>
          <button id="gssf-refresh" class="gssf-icon" type="button" data-allow-busy="1" title="Atualizar análise" aria-label="Atualizar análise">↻</button>
          <button id="gssf-close" class="gssf-icon" type="button" data-allow-busy="1" title="Ocultar" aria-label="Ocultar assistente">×</button>
        </div>
      </div>

      <div class="gssf-body">
        <div class="gssf-status loading" id="gssf-status"><span class="gssf-status-icon">⏳</span><span><b>Carregando formulário...</b><small>Aguarde a leitura do Forms.</small></span></div>

        <div class="gssf-kpis" id="gssf-kpis">
          <div class="gssf-kpi kpi-questions"><i aria-hidden="true">${kpiIconSvg('questions')}</i><div><b>-</b><span>questões</span></div><em></em></div>
          <div class="gssf-kpi kpi-options"><i aria-hidden="true">${kpiIconSvg('options')}</i><div><b>-</b><span>alternativas</span></div><em></em></div>
          <div class="gssf-kpi kpi-images"><i aria-hidden="true">${kpiIconSvg('images')}</i><div><b>-</b><span>imagens</span></div><em></em></div>
          <div class="gssf-kpi kpi-sections"><i aria-hidden="true">${kpiIconSvg('sections')}</i><div><b>-</b><span>seções</span></div><em></em></div>
        </div>

        <div id="gssf-dashboard-extra" class="gssf-dashboard-extra"></div>

        <section class="gssf-card gssf-map-card" id="gssf-map-card">
          <div class="gssf-card-head gssf-map-head">
            <h3>Mapa de questões</h3>
            <label class="gssf-map-toggle">
              <input id="gssf-map-by-sections" type="checkbox">
              <span>Organizar por seções</span>
            </label>
          </div>
          <div id="gssf-question-map" class="gssf-question-map">
            <p class="gssf-muted">O mapa aparece após a leitura.</p>
          </div>
        </section>

        <section class="gssf-card gssf-settings-card" id="gssf-settings-card">
          <h3>Configurações</h3>
          <label class="gssf-field">
            <span>Alternativas padrão por questão</span>
            <input id="gssf-standard-options" type="text" value="4" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="Quantidades de alternativas aceitas por questão">
          </label>
          <p class="gssf-help">Informe uma ou mais quantidades separadas por vírgula. Ex.: 4, 3, 2 aceita questões com 4, 3 ou 2 alternativas.</p>
          <label class="gssf-field">
            <span>Quantidade de questões</span>
            <input id="gssf-expected-questions" type="text" value="" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="Quantidade esperada de questões">
          </label>
          <p class="gssf-help">Deixe vazio para não validar. Ao informar um valor, o painel avisa quando o formulário tiver menos ou mais questões.</p>
        </section>

        <section class="gssf-card gssf-pending-panel" id="gssf-issues-card">
          <header class="gssf-pending-head">
            <div class="gssf-pending-head-left">
              <span class="gssf-pending-signal" aria-hidden="true"></span>
              <div class="gssf-pending-head-copy">
                <strong>PENDÊNCIAS</strong>
              </div>
            </div>
            <span id="gssf-pending-total" class="gssf-pending-total" aria-label="Total de pendências">—</span>
          </header>
          <div id="gssf-inline-issues" class="gssf-pending-body">
            <p class="gssf-muted">Ainda não há leitura concluída.</p>
          </div>
        </section>

        <section class="gssf-card" id="gssf-key-card">
          <h3>Gabarito</h3>
          <div id="gssf-inline-key" class="gssf-mini-key">
            <p class="gssf-muted">O gabarito aparece após a leitura.</p>
          </div>
          <div class="gssf-actions">
            <button id="gssf-open-omr" class="gssf-btn ok" type="button">Ferramentas de Respostas</button>
          </div>
        </section>

        <section class="gssf-card">
          <h3>Ferramentas para Word</h3>
          <div class="gssf-actions two">
            <button id="gssf-copy" class="gssf-btn ok" type="button">Copiar questões</button>
            <button id="gssf-download-word" class="gssf-btn ok" type="button">Baixar Word</button>
          </div>
          <div id="gssf-progress-copy" class="gssf-progress"><span class="gssf-progress-bar"></span><em class="gssf-progress-label"></em></div>
        </section>

        <section class="gssf-card gssf-letter-map-card" id="gssf-letter-map-card">
          <h3>Conferir letras nas alternativas</h3>
          <div id="gssf-letter-map" class="gssf-letter-map">
            <p class="gssf-muted">A leitura aparece após a análise.</p>
          </div>
        </section>

        <section class="gssf-card">
          <h3>Letras nas alternativas</h3>
          <label class="gssf-field">
            <span>Questões ou intervalo</span>
            <input id="gssf-letter-range" type="text" placeholder="Ex.: 1, 3-8 ou 12">
          </label>
          <label class="gssf-checkline gssf-letter-capitalize-line">
            <input id="gssf-letter-capitalize" type="checkbox">
            <span>Também deixar iniciais maiúsculas ao inserir letras</span>
          </label>
          <div class="gssf-actions two">
            <button id="gssf-insert-letters" class="gssf-btn ok" type="button">Inserir letras nas alternativas</button>
            <button id="gssf-remove-letters" class="gssf-btn ok" type="button">Remover letras das alternativas</button>
          </div>
          <div class="gssf-actions gssf-actions-single">
            <button id="gssf-capitalize-alternatives" class="gssf-btn ok" type="button">Deixar iniciais maiúsculas</button>
          </div>
          <div id="gssf-progress-letters" class="gssf-progress"><span class="gssf-progress-bar"></span><em class="gssf-progress-label"></em></div>
        </section>

        <section class="gssf-card gssf-data-card">
          <h3>Salvamento de dados</h3>
          <div class="gssf-actions two">
            <button id="gssf-export-data" class="gssf-btn ok" type="button">Baixar backup</button>
            <button id="gssf-import-data" class="gssf-btn ok" type="button">Importar backup</button>
          </div>
          <input id="gssf-import-file" type="file" accept="application/json,.json" multiple hidden>
        </section>

        <section class="gssf-card">
          <h3>Ajuda técnica</h3>
          <div class="gssf-actions two">
            <button id="gssf-diag" class="gssf-btn ok" type="button">Baixar dados</button>
            <button id="gssf-txt" class="gssf-btn ok" type="button">Baixar relatório</button>
          </div>
        </section>

        <pre id="gssf-log" class="gssf-log" aria-live="polite"></pre>
      </div>
    `;

    const fab = document.createElement('button');
    fab.id = 'gssf-fab';
    fab.type = 'button';
    fab.title = 'ABRIR O ASSISTENTE DE FORMS';
    fab.setAttribute('aria-label', 'ABRIR O ASSISTENTE DE FORMS');
    fab.innerHTML = `${fabSvg()}<span>ABRIR O ASSISTENTE DE FORMS</span>`;
    fab.addEventListener('click', showPanel);

    document.documentElement.appendChild(root);
    document.documentElement.appendChild(fab);

    bindPanelGlow(root);
    bindPanelEvents();
    applySavedTheme();
    applySettingsToUi();
    showPanel();
    setTimeout(restoreActivityLog, 250);
  }

  function bindPanelEvents() {
    document.getElementById('gssf-close')?.addEventListener('click', hidePanel);
    document.getElementById('gssf-refresh')?.addEventListener('click', () => runAutoAnalysis(true));
    document.getElementById('gssf-theme')?.addEventListener('click', toggleTheme);
    document.getElementById('gssf-clear-data')?.addEventListener('click', runClearSavedData);
    document.getElementById('gssf-open-omr')?.addEventListener('click', openOmrBoard);
    document.getElementById('gssf-copy')?.addEventListener('click', runCopyQuestions);
    document.getElementById('gssf-download-word')?.addEventListener('click', runDownloadWordQuestions);
    // O botão de remover seções foi ocultado da interface nesta versão.
    // A função runRemoveSections permanece preservada para possível retorno futuro do recurso.
    document.getElementById('gssf-insert-letters')?.addEventListener('click', runInsertAlternativeLetters);
    document.getElementById('gssf-remove-letters')?.addEventListener('click', runRemoveAlternativeLetters);
    document.getElementById('gssf-capitalize-alternatives')?.addEventListener('click', runCapitalizeAlternatives);
    document.getElementById('gssf-standard-options')?.addEventListener('input', handleStandardOptionTyping);
    document.getElementById('gssf-standard-options')?.addEventListener('change', saveStandardOptionSetting);
    document.getElementById('gssf-standard-options')?.addEventListener('blur', saveStandardOptionSetting);
    document.getElementById('gssf-expected-questions')?.addEventListener('input', handleExpectedQuestionTyping);
    document.getElementById('gssf-expected-questions')?.addEventListener('change', saveExpectedQuestionSetting);
    document.getElementById('gssf-expected-questions')?.addEventListener('blur', saveExpectedQuestionSetting);
    document.getElementById('gssf-map-by-sections')?.addEventListener('change', saveMapSectionSetting);
    document.getElementById('gssf-export-data')?.addEventListener('click', exportAllSavedData);
    document.getElementById('gssf-import-data')?.addEventListener('click', () => document.getElementById('gssf-import-file')?.click());
    document.getElementById('gssf-import-file')?.addEventListener('change', importAllSavedData);
    document.getElementById('gssf-diag')?.addEventListener('click', downloadDiagnostic);
    document.getElementById('gssf-txt')?.addEventListener('click', downloadLastReport);
  }

  function showPanel() {
    if (APP.omrModeState?.active) return;
    const root = document.getElementById('gssf-root');
    if (!root) return;
    root.classList.remove('hidden');
    document.documentElement.classList.add('gssf-docked-page');
    document.body?.classList.add('gssf-docked-page');
    document.getElementById('gssf-fab')?.classList.add('hidden');
    scheduleAutoAnalysis(100);
  }

  function hidePanel() {
    if (APP.omrModeState?.active) return;
    document.getElementById('gssf-root')?.classList.add('hidden');
    document.documentElement.classList.remove('gssf-docked-page');
    document.body?.classList.remove('gssf-docked-page');
    document.getElementById('gssf-fab')?.classList.remove('hidden');
  }

  function setOptionalAttribute(el, name, value) {
    if (!el) return;
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  function enterOmrMode() {
    if (APP.omrModeState?.active) return APP.omrModeState;
    const root = document.getElementById('gssf-root');
    const fab = document.getElementById('gssf-fab');
    const panelBody = root?.querySelector?.('.gssf-body') || null;
    const state = {
      active: true,
      rootHidden: Boolean(root?.classList.contains('hidden')),
      fabHidden: Boolean(fab?.classList.contains('hidden')),
      htmlDocked: document.documentElement.classList.contains('gssf-docked-page'),
      bodyDocked: Boolean(document.body?.classList.contains('gssf-docked-page')),
      rootAriaHidden: root?.getAttribute('aria-hidden') ?? null,
      fabAriaHidden: fab?.getAttribute('aria-hidden') ?? null,
      panelScrollTop: Number(panelBody?.scrollTop || 0)
    };
    APP.omrModeState = state;
    try {
      root?.classList.add('gssf-omr-temporarily-hidden');
      fab?.classList.add('gssf-omr-temporarily-hidden');
      root?.setAttribute('aria-hidden', 'true');
      fab?.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('gssf-docked-page');
      document.body?.classList.remove('gssf-docked-page');
      document.documentElement.classList.add('gssf-omr-open');
    } catch (error) {
      APP.omrModeState = null;
      throw error;
    }
    return state;
  }

  function exitOmrMode() {
    const state = APP.omrModeState;
    if (!state?.active) return;
    const root = document.getElementById('gssf-root');
    const fab = document.getElementById('gssf-fab');
    const panelBody = root?.querySelector?.('.gssf-body') || null;
    try {
      root?.classList.remove('gssf-omr-temporarily-hidden');
      fab?.classList.remove('gssf-omr-temporarily-hidden');
      root?.classList.toggle('hidden', Boolean(state.rootHidden));
      fab?.classList.toggle('hidden', Boolean(state.fabHidden));
      document.documentElement.classList.toggle('gssf-docked-page', Boolean(state.htmlDocked));
      document.body?.classList.toggle('gssf-docked-page', Boolean(state.bodyDocked));
      document.documentElement.classList.remove('gssf-omr-open');
      setOptionalAttribute(root, 'aria-hidden', state.rootAriaHidden);
      setOptionalAttribute(fab, 'aria-hidden', state.fabAriaHidden);
      if (panelBody) panelBody.scrollTop = state.panelScrollTop;
    } finally {
      state.active = false;
      APP.omrModeState = null;
    }
  }