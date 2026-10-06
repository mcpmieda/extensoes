  // ===== 00-core.js =====
// Fonte modular: core.
  const GSSF_STORAGE = globalThis.GSSF_STORAGE;

  const GSSF_VERSION = '16.0.5';

  const GSSF_BUILD = `v${GSSF_VERSION}-alternative-paren-labels-2026-10-06`;

  const GSSF_RUNTIME_KEY = '__GSSF_ASSISTENTE_FORMS__';

  const GSSF_LEGACY_RUNTIME_KEYS = Object.freeze(['__GSSF_ASSISTENTE_FORMS_V34__', '__GSSF_ASSISTENTE_FORMS_V33__']);

  const GSSF_TIMING = Object.freeze({
    progressStepMs: 120,
    progressResetMs: 1300,
    overlayHideMs: 450,
    waitForMs: 5000,
    formsAutosaveMs: 4500,
    autoAnalysisMs: 800,
    mutationDebounceMs: 450,
    mutationIdleTimeoutMs: 1800,
    mutationGuardMs: 500,
    interactionMapRefreshMs: 900,
    editingAnalysisMs: 2600,
    mapSignatureIntervalMs: 6500,
    eligibilityFastMs: 700,
    eligibilityNormalMs: 2200,
    eligibilitySlowMs: 4200,
    eligibilityRevalidateMs: 15000,
    eligibilityMissLimit: 3
  });

  const previousBuild = window[GSSF_RUNTIME_KEY] || GSSF_LEGACY_RUNTIME_KEYS.map((key) => window[key]).find(Boolean) || null;

  const APP = {
    id: 'gssf',
    name: 'ASSISTENTE DE FORMS',
    brand: 'Guilherme Silva Soluções',
    version: `V${GSSF_VERSION}`,
    lastPrecheck: null,
    lastAudit: null,
    busy: false,
    autoTimer: null,
    firstAnalysisTimer: null,
    firstAnalysisAttempts: 0,
    mutationTimer: null,
    progressTimers: {},
    lastAnalysisKey: '',
    analysisRunning: false,
    lastAnalysisAt: 0,
    lastMutationAt: 0,
    emptyAutoRetries: 0,
    editingUntil: 0,
    letterCapitalizeFormId: '',
    startedAt: Date.now(),
    lastMarkEditingAt: 0,
    deferredLogLines: [],
    logFlushTimer: null,
    errorLog: [],
    errorThrottle: new Map(),
    lastLogLine: '',
    lastProgressState: {},
    progressValues: {},
    lastOverlayState: { pct: null, message: '', title: '' },
    overlayHideTimer: null,
    copyImageCache: null,
    lastQuestionDomSignature: '',
    mapSignatureTimer: null,
    mapJumpSeq: 0,
    mapJumpToastTimer: null,
    mapJumpHighlightTimer: null,
    letterMapScrollTimer: null,
    letterMapActiveNumber: 0,
    letterMapForcedNumber: 0,
    letterMapForcedUntil: 0,
    letterMapTrailTimers: [],
    pageModeCache: { value: '', at: 0, href: '' },
    sectionBlocksCache: { value: null, at: 0 },
    omrModeState: null,
    responseToolsState: { activeTab: 'gabarito' },
    autoObserver: null,
    mutationIdleCallback: null,
    runtimeMessageHandler: null,
    togglePanelHandler: null,
    storageReady: false,
    quizActive: false,
    quizDocumentKey: '',
    quizDetectedKeys: new Set(),
    manualOverrideKey: '',
    eligibilityTimer: null,
    eligibilityAttempts: 0,
    eligibilityLastHref: '',
    eligibilityLastVerifiedAt: 0,
    eligibilityMisses: 0,
    eligibilityListeners: [],
    lifecycle: { destroyed: false, listeners: [], pendingTimeouts: new Set() },
    omrImportState: {
      sourceFormId: '',
      bankSignature: '',
      refreshTimer: null,
      periodicTimer: null,
      storageHandler: null,
      customHandler: null,
      keyHandler: null,
      message: '',
      singleQueue: Promise.resolve(),
      pendingBubbleEffects: [],
      questionListScrollTop: 0,
      sourceCardsScrollTop: 0,
      sectionLaunchCollapsed: false,
      launchedSectionKeys: {},
      previousFocus: null
    },
    
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function cleanText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(value) {
    return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
