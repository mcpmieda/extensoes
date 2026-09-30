

  const APP_IGNORED_SELECTOR = '#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker,.gssf-history-overlay,.gssf-history-button,.gssf-history-all-button,#dfp-root,#dfp-fab,#dfp-panel,#dfp-toast,[id^="dfp-"]';

  function isIgnoredAppNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      const id = node.id || '';
      if (id.startsWith('gssf') || id.startsWith('dfp-')) return true;
      const cls = typeof node.className === 'string' ? node.className : '';
      if (cls.includes('gssf-') || cls.includes('dfp-')) return true;
      return Boolean(node.closest?.(APP_IGNORED_SELECTOR));
    } catch (_) { return false; }
  }

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isIgnoredAppNode(el)) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function textOf(el) {
    if (!el) return '';
    return cleanText(el.innerText || el.textContent || (el.getAttribute && el.getAttribute('aria-label')) || '');
  }

  function all(selector = '*', root = document) {
    return Array.from(root.querySelectorAll(selector)).filter(visible);
  }

  function isFormsPage() {
    return /forms\.(cloud\.)?microsoft|forms\.office/i.test(location.href);
  }

  function isRealFormsDocument() {
    if (!isFormsPage()) return false;
    const url = location.href;
    return /\/Pages\/(DesignPageV2|EditFormPage)\.aspx/i.test(url);
  }

  function currentFormsDocumentKey() {
    try {
      const url = new URL(location.href);
      const formId = url.searchParams.get('id') || url.searchParams.get('formid') || url.searchParams.get('FormId') || url.searchParams.get('responseId') || '';
      if (formId) return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase()}?form=${formId}`;
      const stableParams = [...url.searchParams.entries()]
        .filter(([name]) => !/^(topview|subpage|tab|view)$/i.test(name))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${name}=${value}`)
        .join('&');
      return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase()}?${stableParams}`;
    } catch (_) {
      return String(location.href || '').split('#')[0];
    }
  }

  function hostQuizSignalElement(el) {
    if (!el || el.nodeType !== 1 || isIgnoredAppNode(el)) return false;
    if (typeof getComputedStyle !== 'function' || typeof el.getBoundingClientRect !== 'function') return true;
    try { return visible(el); } catch (_) { return true; }
  }

  function quizSignalSummary(root = document) {
    const categories = new Set();
    const evidence = [];
    const add = (category, detail) => {
      if (!categories.has(category)) evidence.push(detail);
      categories.add(category);
    };
    const firstHostMatch = (selector) => Array.from(root.querySelectorAll?.(selector) || []).find(hostQuizSignalElement) || null;

    if (firstHostMatch('[data-automation-id*="quiz" i], [data-testid*="quiz" i]')) {
      add('quiz-automation', 'marcador estrutural de questionário');
    }
    if (firstHostMatch('[data-automation-id*="correctAnswer" i], [data-automation-id*="answerKey" i], [data-testid*="correct-answer" i], [data-testid*="answer-key" i]')) {
      add('correct-answer', 'controle estrutural de resposta correta');
    }
    if (firstHostMatch('[data-automation-id*="point" i], [data-automation-id*="score" i], [data-testid*="point" i], [data-testid*="score" i], input[aria-label*="ponto" i], input[aria-label*="point" i], [role="spinbutton"][aria-label*="ponto" i], [role="spinbutton"][aria-label*="point" i]')) {
      add('points-control', 'controle de pontuação');
    }
    if (firstHostMatch('[aria-label*="resposta correta" i], [title*="resposta correta" i], [aria-label*="correct answer" i], [title*="correct answer" i], [aria-label*="marcar como correta" i], [aria-label*="mark as correct" i]')) {
      add('correct-answer-label', 'controle rotulado como resposta correta');
    }

    // No editor atual do Microsoft Forms, questionários de múltipla escolha
    // mantêm as alternativas dentro de role="radiogroup". Formulários comuns
    // usam a lista editável de opções, sem esses grupos. Esse sinal continua
    // disponível mesmo quando os controles de Pontos/Resposta correta ficam
    // ocultos porque nenhuma questão está selecionada.
    const answerGroups = Array.from(root.querySelectorAll?.('[role="radiogroup"]') || [])
      .filter(hostQuizSignalElement)
      .filter((group) => {
        const inQuestion = Boolean(group.closest?.('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"], [data-automation-id*="question" i]'));
        if (!inQuestion) return false;
        const optionCount = group.querySelectorAll?.('[role="radio"], input[type="radio"], [data-automation-id="questionChoiceOptionContainer"]')?.length || 0;
        return optionCount >= 2;
      })
      .slice(0, 120);

    if (answerGroups.length) {
      add('quiz-answer-groups', `${answerGroups.length} grupo(s) estrutural(is) de respostas do questionário`);
    }

    // Uma resposta já marcada como correta é uma evidência definitiva. A
    // varredura é limitada para não transformar a detecção em uma auditoria
    // completa de formulários extensos.
    for (const group of answerGroups.slice(0, 16)) {
      const options = typeof findOptionContainers === 'function'
        ? findOptionContainers(group)
        : Array.from(group.querySelectorAll?.('[data-automation-id="questionChoiceOptionContainer"], [role="radio"], input[type="radio"]') || []);
      if (options.some((option) => typeof isCorrectOption === 'function' && isCorrectOption(option))) {
        add('answer-key-state', 'resposta correta identificada na estrutura das alternativas');
        break;
      }
    }

    const controls = Array.from(root.querySelectorAll?.('button,[role="button"],label,input,[role="spinbutton"]') || []).filter(hostQuizSignalElement).slice(0, 900);
    for (const el of controls) {
      const label = normalizeText(`${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''} ${el.getAttribute?.('data-automation-id') || ''} ${textOf(el)}`);
      const inQuestion = Boolean(el.closest?.('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"], [data-automation-id*="question" i]'));
      if (inQuestion && /^(pontos?|points?|pontuacao|pontuação|score)$/.test(label)) add('points-control', 'controle textual de pontuação dentro da questão');
      if (inQuestion && /(resposta correta|correct answer|marcar como correta|mark as correct|definir como correta|set as correct)/.test(label)) add('correct-answer-label', 'controle textual de resposta correta dentro da questão');
      if (categories.size >= 3) break;
    }

    const scripts = Array.from(root.querySelectorAll?.('script[type="application/json"], script#__NEXT_DATA__, script[data-automation-id*="state" i]') || []).slice(0, 12);
    for (const script of scripts) {
      const raw = String(script.textContent || '').slice(0, 900000);
      if (/"(?:isQuiz|is_quiz|quizMode|isTest)"\s*:\s*true/i.test(raw) || /"(?:formType|documentType|type)"\s*:\s*"(?:quiz|test|questionnaire)"/i.test(raw)) {
        add('quiz-json', 'estado interno identifica questionário');
        break;
      }
    }

    const score = (categories.has('quiz-json') ? 6 : 0)
      + (categories.has('quiz-automation') ? 4 : 0)
      + (categories.has('correct-answer') ? 4 : 0)
      + (categories.has('correct-answer-label') ? 3 : 0)
      + (categories.has('points-control') ? 3 : 0)
      + (categories.has('quiz-answer-groups') ? 4 : 0)
      + (categories.has('answer-key-state') ? 6 : 0);
    return { detected: score >= 3, score, categories: [...categories], evidence };
  }

  function isQuizOrTestDocument(options = {}) {
    if (!isRealFormsDocument()) return false;
    const key = currentFormsDocumentKey();
    if (!options.force && APP.quizDetectedKeys.has(key)) return true;
    const summary = quizSignalSummary(document);
    if (summary.detected) APP.quizDetectedKeys.add(key);
    return summary.detected;
  }

  function hasRealFormShell() {
    if (!isRealFormsDocument()) return false;
    if (document.querySelector('[data-automation-id="formTitleContainer"], [data-automation-id="questionWrapper"], [role="radiogroup"]')) return true;
    const text = normalizeText(document.body?.innerText || '');
    if (text.includes('visualizacao') || text.includes('visualização') || text.includes('coletar respostas') || text.includes('exibir respostas')) return true;
    return false;
  }

  function hasManualActivationForCurrentDocument() {
    return APP.manualOverrideKey && APP.manualOverrideKey === currentFormsDocumentKey();
  }

  async function forceActivateFromBrowserAction() {
    if (!isRealFormsDocument()) return false;
    if (!(await ensurePrivateStorageReady())) return false;
    if (!hasRealFormShell()) return false;
    const key = currentFormsDocumentKey();
    APP.manualOverrideKey = key;
    APP.quizDetectedKeys.add(key);
    APP.eligibilityMisses = 0;
    APP.eligibilityAttempts = 0;
    await activateQuizFeatures(key, { manual: true });
    showPanel();
    log('Assistente acionado manualmente pelo ícone do navegador.', false);
    toast('Assistente aberto manualmente.');
    return true;
  }

  async function ensurePrivateStorageReady() {
    if (APP.storageReady) return true;
    if (!GSSF_STORAGE) {
      console.error('Armazenamento privado da extensão indisponível.');
      return false;
    }
    try {
      await GSSF_STORAGE.init();
      APP.storageReady = true;
      return true;
    } catch (error) {
      console.error('Falha ao inicializar o armazenamento privado da extensão:', error);
      return false;
    }
  }

  function removeActiveFeatureListeners() {
    APP.lifecycle.listeners.splice(0).forEach(({ target, type, handler, options }) => {
      try { target?.removeEventListener?.(type, handler, options); }
      catch (error) { reportNonFatalError('lifecycle:remover-listener', error, { type }); }
    });
  }

  function deactivateQuizFeatures(reason = '') {
    const hadUi = Boolean(document.getElementById('gssf-root') || document.getElementById('gssf-fab'));
    APP.quizActive = false;
    if (APP.manualOverrideKey && APP.manualOverrideKey === APP.quizDocumentKey) APP.manualOverrideKey = '';
    APP.quizDocumentKey = '';
    APP.eligibilityMisses = 0;
    APP.eligibilityLastVerifiedAt = 0;
    try { stopOmrLiveUpdates(); } catch (error) { reportNonFatalError('quiz:parar-omr', error); }
    try { exitOmrMode(); } catch (error) { reportNonFatalError('quiz:sair-omr', error); }
    try { APP.autoObserver?.disconnect?.(); } catch (error) { reportNonFatalError('quiz:desconectar-observer', error); }
    APP.autoObserver = null;
    removeActiveFeatureListeners();
    clearAppTimers();
    stopQuestionHistory();
    ['gssf-root','gssf-fab','gssf-toast','gssf-modal','gssf-confirm-modal','gssf-work-overlay','gssf-question-focus-marker'].forEach((id) => document.getElementById(id)?.remove());
    document.documentElement.classList.remove('gssf-docked-page', 'gssf-silent-work', 'gssf-omr-open');
    document.body?.classList.remove('gssf-docked-page');
    APP.lastAudit = null;
    APP.lastPrecheck = null;
    APP.lastAnalysisKey = '';
    APP.sectionBlocksCache = { value: null, at: 0 };
    APP.scrollQuestionBlocks = [];
    if (hadUi && reason) console.info(`[GSSF] Assistente desativado: ${reason}`);
  }

  async function activateQuizFeatures(key, options = {}) {
    if (APP.lifecycle.destroyed || APP.quizActive && APP.quizDocumentKey === key) return;
    if (!(await ensurePrivateStorageReady())) return;
    const manual = Boolean(options.manual);
    if (!isRealFormsDocument() || !hasRealFormShell() || (!manual && !isQuizOrTestDocument())) return;
    if (APP.quizActive) deactivateQuizFeatures('mudança de questionário');
    APP.quizActive = true;
    APP.quizDocumentKey = key;
    APP.lastAudit = null;
    APP.lastPrecheck = null;
    APP.lastAnalysisKey = '';
    createPanel();
    startQuestionHistory();
    startAutoObserver();
    scheduleAutoAnalysis(700);
    ensureInitialAnalysis();
  }

  async function evaluateQuizEligibility() {
    if (APP.lifecycle.destroyed) return;
    const now = Date.now();
    const href = String(location.href || '');
    const key = currentFormsDocumentKey();
    const hrefChanged = href !== APP.eligibilityLastHref;
    const sameActiveDocument = APP.quizActive && APP.quizDocumentKey === key;
    APP.eligibilityLastHref = href;
    if (!isRealFormsDocument()) {
      if (APP.quizActive) deactivateQuizFeatures('página fora da edição de questionário');
      return;
    }
    if (sameActiveDocument && !hrefChanged && now - APP.eligibilityLastVerifiedAt < GSSF_TIMING.eligibilityRevalidateMs) return;

    const summary = quizSignalSummary(document);
    APP.eligibilityLastVerifiedAt = now;
    if (hasManualActivationForCurrentDocument() && hasRealFormShell()) {
      APP.quizDetectedKeys.add(key);
      APP.eligibilityMisses = 0;
      APP.eligibilityAttempts = 0;
      await activateQuizFeatures(key, { manual: true });
      return;
    }
    if (summary.detected && hasRealFormShell()) {
      APP.quizDetectedKeys.add(key);
      APP.eligibilityMisses = 0;
      APP.eligibilityAttempts = 0;
      await activateQuizFeatures(key);
      return;
    }

    if (sameActiveDocument) {
      APP.eligibilityMisses += 1;
      if (APP.eligibilityMisses >= GSSF_TIMING.eligibilityMissLimit) {
        APP.quizDetectedKeys.delete(key);
        deactivateQuizFeatures('formulário não é mais identificado como teste');
      }
      return;
    }

    APP.eligibilityMisses = 0;
    if (APP.quizActive && APP.quizDocumentKey !== key) deactivateQuizFeatures('formulário atual não identificado como teste');
  }

  function eligibilityDelay() {
    if (APP.quizActive) return GSSF_TIMING.eligibilityNormalMs;
    APP.eligibilityAttempts += 1;
    if (APP.eligibilityAttempts <= 24) return GSSF_TIMING.eligibilityFastMs;
    if (APP.eligibilityAttempts <= 80) return GSSF_TIMING.eligibilityNormalMs;
    return GSSF_TIMING.eligibilitySlowMs;
  }

  function scheduleEligibilityCheck(delay = 0) {
    clearTimeout(APP.eligibilityTimer);
    APP.eligibilityTimer = setTimeout(async () => {
      APP.eligibilityTimer = null;
      try { await evaluateQuizEligibility(); }
      catch (error) { reportNonFatalError('quiz:avaliar-elegibilidade', error); }
      if (!APP.lifecycle.destroyed) scheduleEligibilityCheck(eligibilityDelay());
    }, Math.max(0, Number(delay) || 0));
  }

  function startEligibilityMonitor() {
    const wake = () => scheduleEligibilityCheck(80);
    [['popstate', wake], ['hashchange', wake], ['focus', wake], ['pageshow', wake]].forEach(([type, handler]) => {
      window.addEventListener(type, handler, { passive: true });
      APP.eligibilityListeners.push({ target: window, type, handler, options: { passive: true } });
    });
    scheduleEligibilityCheck(0);
  }

  function getFormTitle() {
    const candidates = [
      document.querySelector('[data-automation-id="formTitleContainer"]'),
      document.querySelector('[aria-label*="Título do formulário"]'),
      ...all('[role="heading"], h1, h2').slice(0, 12)
    ].filter(Boolean);
    for (const el of candidates) {
      const tx = cleanText((el.getAttribute && el.getAttribute('aria-label')) || textOf(el));
      const cleaned = tx
        .replace(/^Título do formulário\s*/i, '')
        .replace(/\s*Salvo\s*$/i, '')
        .replace(/\s*-\s*Salvo\s*$/i, '')
        .trim();
      if (cleaned && !/^(Forms|Microsoft Forms|Estilo|Configurações|Visualização)$/i.test(cleaned)) return cleaned;
    }
    return cleanText(document.title || '');
  }

  function pageMode() {
    const now = Date.now();
    const u = location.href;
    const cache = APP.pageModeCache || { value: '', at: 0, href: '' };
    if (cache.value && cache.href === u && now - cache.at < 400) return cache.value;
    const body = document.body ? document.body.innerText || '' : '';
    const value = (/topview=preview/i.test(u) || /quando voce enviar este formulario|quando você enviar este formulário/i.test(body) || exactLabel('voltar').length)
      ? 'visualização'
      : ((/DesignPageV2/i.test(u) || /subpage=design/i.test(u)) ? 'edição' : 'forms');
    APP.pageModeCache = { value, at: now, href: u };
    return value;
  }
