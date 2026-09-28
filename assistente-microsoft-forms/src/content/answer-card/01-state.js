
  'use strict';

  const DEFAULTS = {
    logo: __GSSF_RESOURCE__("ANSWER_CARD_LOGO"),
    omr: __GSSF_RESOURCE__("ANSWER_CARD_OMR"),
    instructionLeft: __GSSF_RESOURCE__("ANSWER_CARD_INSTRUCTION_LEFT"),
    instructionRight: __GSSF_RESOURCE__("ANSWER_CARD_INSTRUCTION_RIGHT"),
    cardTitle: `CARTÃO-RESPOSTA`,
    cardSubtitle: `SIMULADO TRIMESTRAL DO ENSINO FUNDAMENTAL ANOS FINAIS`,
  };

  const STORAGE_KEY = 'gssf:pedagogical:card:settings';
  const MEDIA_KEYS = ['logo','omr','customFront','customBack'];
  const OMR_ADJUSTMENT_VERSION = 3;
  const OMR_VERTICAL_CALIBRATION = .04;
  const DEFAULT_OMR_ADJUSTMENT = Object.freeze({ scale: 1, offsetX: 0, offsetY: OMR_VERTICAL_CALIBRATION });
  const DEFAULT_CLASS_BAR_OFFSET_Y = 0;
  const FRONT_GUIDE_LAYOUT = Object.freeze({
    pageWidth: 210,
    pageHeight: 297,
    pageLeft: 5,
    pageRight: 5,
    headerTop: 0,
    headerHeight: 22,
    infoTop: 22,
    infoHeight: 52,
    centerTop: 74,
    centerHeight: 100.5,
    classTop: 178,
    classHeight: 6,
    omrTop: 188,
    omrHeight: 97
  });
  const DEFAULT_ROSTER_MAPPING = Object.freeze({ name: 3, label: 0, number: 2, className: 4 });
  const DEFAULT_ROSTER_RANGE = Object.freeze({ headerRow: 1, startRow: 2, endRow: 47 });

  const state = {
    workbook: null,
    fileName: '',
    workbookMode: 'relation',
    rosterSheetName: '',
    inferredSheetLayouts: {},
    classNames: [],
    selectedClass: '',
    savedClass: '',
    students: [],
    selectedStudentIndex: 0,
    savedStudentNumber: null,
    previewSide: 'front',
    zoom: 1,
    mapping: { ...DEFAULT_ROSTER_MAPPING },
    headerRow: DEFAULT_ROSTER_RANGE.headerRow,
    startRow: DEFAULT_ROSTER_RANGE.startRow,
    endRow: DEFAULT_ROSTER_RANGE.endRow,
    logo: DEFAULTS.logo,
    omr: DEFAULTS.omr,
    omrNatural: { width: 1000, height: 485 },
    omrFit: 'contain',
    omrScale: DEFAULT_OMR_ADJUSTMENT.scale,
    omrOffsetX: DEFAULT_OMR_ADJUSTMENT.offsetX,
    omrOffsetY: DEFAULT_OMR_ADJUSTMENT.offsetY,
    classBarOffsetY: DEFAULT_CLASS_BAR_OFFSET_Y,
    bubbleDetection: null,
    instructionLeft: DEFAULTS.instructionLeft,
    instructionRight: DEFAULTS.instructionRight,
    cardTitle: DEFAULTS.cardTitle,
    cardSubtitle: DEFAULTS.cardSubtitle,
    customFront: '',
    customBack: '',
    customFrontName: '',
    customBackName: '',
    instructionSectionOpen: false,
    frontContentMode: 'instructions',
    activeEditor: null,
    savedRange: null,
    storageAvailable: true,
    mediaStorageAvailable: true,
    mediaDirty: new Set(),
  };

  let root = null;
  let mounted = false;
  let settingsRestored = false;
  let resizeObserver = null;
  let globalListenersBound = false;
  let mediaWriteQueue = Promise.resolve();
  let workbookLoadGeneration = 0;
  let activeAnswerCardPrintWindow = null;
  let activeAnswerCardPrintSession = null;
  const $ = (id) => root?.querySelector?.(`#${CSS.escape(id)}`) || null;
  let els = {};
  function collectElements() {
    els = {
    libraryStatus: $('crLibraryStatus'),
    fileInput: $('crFileInput'), fileDrop: $('crFileDrop'), filePrompt: $('crFilePrompt'), fileName: $('crFileName'), clearWorkbook: $('crClearWorkbook'), downloadModel: $('crDownloadModel'), classSelect: $('crClassSelect'), workbookMessage: $('crWorkbookMessage'),
    prevClass: $('crPrevClass'), nextClass: $('crNextClass'), prevStudent: $('crPrevStudent'), nextStudent: $('crNextStudent'),
    studentsSection: $('crStudentsSection'), studentsRangeHint: $('crStudentsRangeHint'), studentSelect: $('crStudentSelect'), studentCount: $('crStudentCount'), studentClass: $('crStudentClass'), instructionSection: $('crInstructionSection'), frontContentMode: $('crFrontContentMode'), performanceStatus: $('crPerformanceStatus'),
    previewCaption: $('crPreviewCaption'), previewChip: $('crPreviewChip'), previewScroll: $('crPreviewScroll'), paperViewport: $('crPaperViewport'), paperShell: $('crPaperShell'), paperScale: $('crPaperScale'), paperFlip: $('crPaperFlip'), frontFace: $('crFrontFace'), backFace: $('crBackFace'),
    zoomOut: $('crZoomOut'), zoomReset: $('crZoomReset'), zoomIn: $('crZoomIn'), zoomValue: $('crZoomValue'),
    mapName: $('crMapName'), mapLabel: $('crMapLabel'), mapNumber: $('crMapNumber'), mapClass: $('crMapClass'), headerRow: $('crHeaderRow'), startRow: $('crStartRow'), endRow: $('crEndRow'),
    logoInput: $('crLogoInput'), resetLogo: $('crResetLogo'), omrInput: $('crOmrInput'), resetOmr: $('crResetOmr'), omrFit: $('crOmrFit'), omrScale: $('crOmrScale'), omrScaleValue: $('crOmrScaleValue'), omrScaleX: $('crOmrScaleX'), omrScaleXValue: $('crOmrScaleXValue'), omrScaleY: $('crOmrScaleY'), omrScaleYValue: $('crOmrScaleYValue'), classBarY: $('crClassBarY'), classBarYValue: $('crClassBarYValue'), resetOmrAdjustments: $('crResetOmrAdjustments'), detectOmr: $('crDetectOmr'), detectionText: $('crDetectionText'), detectionCanvas: $('crDetectionCanvas'),
    instructionLeft: $('crInstructionLeft'), instructionRight: $('crInstructionRight'), cardTitleEditor: $('crCardTitleEditor'), cardSubtitleEditor: $('crCardSubtitleEditor'),
    customPageSide: $('crCustomPageSide'), customPageInput: $('crCustomPageInput'), removeCustomPage: $('crRemoveCustomPage'), customPageStatus: $('crCustomPageStatus'), storageStatus: $('crStorageStatus'), resetCard: $('crResetCard'),
    printStudent: $('crPrintStudent'), printClass: $('crPrintClass'), printQueue: $('crPrintQueue'), toast: $('crToast')
      };
  }
  async function mountAnswerCardWorkspace(container) {
    const workspace = container?.querySelector?.('#crCardWorkspace') || (container?.id === 'crCardWorkspace' ? container : null);
    if (!workspace) return false;
    const nextRoot = container?.id === 'crCardWorkspace' ? (container.parentElement || container) : container;
    if (mounted && root === nextRoot) { activateAnswerCardWorkspace(); return true; }
    unmountAnswerCardWorkspace();
    root = nextRoot;
    collectElements();
    mounted = true;
    if (!settingsRestored) {
      restoreStoredSettings();
      await restoreStoredMedia();
      settingsRestored = true;
    }
    enhanceEditorToolbars();
    syncSettingsControls();
    populateColumnSelectors();
    restoreAllEditors();
    bindEvents();
    renderPreview();
    loadSpreadsheetLibrary();
    loadOmrImage(state.omr, state.omr === DEFAULTS.omr, false);
    if (!globalListenersBound) {
      globalListenersBound = true;
      window.addEventListener('resize', () => { if (mounted) scalePreview(); });
    }
    requestAnimationFrame(() => scalePreview({ resetPosition: true }));
    return true;
  }

  function unmountAnswerCardWorkspace() {
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    releaseWorkbookRuntime({ updateUi: false, save: false, publish: false, bumpGeneration: true });
    try { activeAnswerCardPrintSession?.finish?.(); } catch (_) {}
    activeAnswerCardPrintSession = null;
    try { if (activeAnswerCardPrintWindow && !activeAnswerCardPrintWindow.closed) activeAnswerCardPrintWindow.close(); } catch (_) {}
    activeAnswerCardPrintWindow = null;
    hideToast();
    mounted = false;
    root = null;
    els = {};
  }

  function activateAnswerCardWorkspace() {
    if (!mounted || !root) return;
    requestAnimationFrame(() => scalePreview({ preserveCenter: true }));
  }

  function bindEvents() {
    root.querySelectorAll('.cr-side-tab').forEach((button) => {
      button.addEventListener('click', () => setPreviewSide(button.dataset.side, true));
      button.addEventListener('keydown', handleSideTabKeydown);
    });
    bindChoiceSwitches();

    els.zoomOut.addEventListener('click', () => setZoom(state.zoom - .1));
    els.zoomReset.addEventListener('click', () => setZoom(1));
    els.zoomIn.addEventListener('click', () => setZoom(state.zoom + .1));

    els.fileInput.addEventListener('click', prepareWorkbookReplacement);
    els.fileInput.addEventListener('change', handleWorkbookFile);
    els.clearWorkbook?.addEventListener('click', () => releaseWorkbookRuntime({ announce: true }));
    els.downloadModel?.addEventListener('click', downloadRosterTemplate);
    els.classSelect.addEventListener('change', () => selectClass(els.classSelect.value));
    els.prevClass.addEventListener('click', () => navigateClass(-1));
    els.nextClass.addEventListener('click', () => navigateClass(1));
    els.studentSelect.addEventListener('change', () => selectStudent(Number(els.studentSelect.value || 0)));
    els.prevStudent.addEventListener('click', () => navigateStudent(-1));
    els.nextStudent.addEventListener('click', () => navigateStudent(1));

    [els.mapName, els.mapLabel, els.mapNumber, els.mapClass].forEach((select) => select.addEventListener('change', applyMappingFromControls));
    [els.headerRow, els.startRow, els.endRow].forEach((input) => input.addEventListener('change', applyRangeFromControls));

    els.logoInput.addEventListener('change', (event) => loadUserImage(event, 'logo'));
    els.resetLogo.addEventListener('click', () => { state.logo = DEFAULTS.logo; markMediaDirty('logo'); els.logoInput.value = ''; renderPreview(); saveSettings(); showToast('Logomarca oficial restaurada.'); });
    els.omrInput.addEventListener('change', (event) => loadUserImage(event, 'omr'));
    els.resetOmr.addEventListener('click', () => { els.omrInput.value = ''; loadOmrImage(DEFAULTS.omr, true, true); });
    els.omrFit.addEventListener('change', () => { state.omrFit = els.omrFit.value; renderPreview(); saveSettings(); });
    els.omrScale.addEventListener('input', () => updateOmrScale('omrScale', els.omrScale, els.omrScaleValue));
    els.omrScaleX.addEventListener('input', () => updateOmrScale('omrOffsetX', els.omrScaleX, els.omrScaleXValue));
    els.omrScaleY.addEventListener('input', () => updateOmrScale('omrOffsetY', els.omrScaleY, els.omrScaleYValue));
    els.classBarY?.addEventListener('input', updateClassBarOffset);
    els.resetOmrAdjustments.addEventListener('click', resetOmrAdjustments);
    els.detectOmr.addEventListener('click', () => detectOmrBubbles(true));

    bindRichTextEditors();
    if (els.instructionSection) els.instructionSection.addEventListener('toggle', () => { state.instructionSectionOpen = els.instructionSection.open; saveSettings(); });
    if (els.frontContentMode) els.frontContentMode.addEventListener('change', applyFrontContentMode);
    els.customPageInput.addEventListener('change', handleCustomPageFile);
    els.customPageSide.addEventListener('change', updateCustomPageStatus);
    els.removeCustomPage.addEventListener('click', removeSelectedCustomPage);
    els.resetCard.addEventListener('click', resetCardToDefaults);
    els.printStudent.addEventListener('click', () => printStudents([getSelectedStudent()]));
    els.printClass.addEventListener('click', () => printStudents(state.students));
      resizeObserver?.disconnect?.();
    if (typeof ResizeObserver === 'function' && els.paperViewport) { resizeObserver = new ResizeObserver(() => scalePreview()); resizeObserver.observe(els.paperViewport); }
  }

  function bindChoiceSwitches() {
    root.querySelectorAll('.cr-choice-switch[data-choice-target]').forEach((group) => {
      const input = $(group.dataset.choiceTarget);
      if (!input) return;
      group.querySelectorAll('.cr-choice-button[data-value]').forEach((button) => {
        button.addEventListener('click', () => {
          input.value = button.dataset.value;
          syncChoiceSwitch(group, input.value);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      syncChoiceSwitch(group, input.value);
    });
  }

  function syncChoiceSwitch(groupOrTarget, value) {
    const group = typeof groupOrTarget === 'string'
      ? root?.querySelector?.(`.cr-choice-switch[data-choice-target="${groupOrTarget}"]`)
      : groupOrTarget;
    if (!group) return;
    group.querySelectorAll('.cr-choice-button[data-value]').forEach((button) => {
      const active = button.dataset.value === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function handleSideTabKeydown(event) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...root.querySelectorAll('.cr-side-tab')];
    const current = tabs.indexOf(event.currentTarget);
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else next = (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setPreviewSide(tabs[next].dataset.side, true);
  }
  function openModal() { globalThis.selectResponseToolsTab?.('cartao-resposta', { focus: true }); }
  function closeModal() { document.getElementById('gssf-omr-close')?.click?.(); }

  function setZoom(value) {
    const previousZoom = state.zoom;
    state.zoom = Math.round(Math.min(1.8, Math.max(.5, value)) * 10) / 10;
    els.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    els.zoomOut.disabled = state.zoom <= .5;
    els.zoomIn.disabled = state.zoom >= 1.8;
    if (state.zoom !== previousZoom && els.paperScale) {
      els.paperScale.classList.remove('cr-zooming-in', 'cr-zooming-out');
      void els.paperScale.offsetWidth;
      els.paperScale.classList.add(state.zoom > previousZoom ? 'cr-zooming-in' : 'cr-zooming-out');
      clearTimeout(setZoom.effectTimer);
      setZoom.effectTimer = setTimeout(() => els.paperScale?.classList.remove('cr-zooming-in', 'cr-zooming-out'), 320);
    }
    scalePreview({ preserveCenter: true, animate: true });
    saveSettings();
  }

  function updateOmrScale(key, input, output) {
    const visibleValue = Number(input.value) / 100;
    state[key] = key === 'omrOffsetY' ? visibleValue + OMR_VERTICAL_CALIBRATION : visibleValue;
    output.textContent = `${input.value}%`;
    renderPreview();
    saveSettings();
  }

  function formatCompactNumber(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1).replace('.', ',');
  }

  function updateClassBarOffset() {
    state.classBarOffsetY = Math.min(12, Math.max(-12, Number(els.classBarY?.value) || 0));
    if (els.classBarYValue) els.classBarYValue.textContent = `${formatCompactNumber(state.classBarOffsetY)} mm`;
    renderPreview();
    saveSettings();
  }

  function resetOmrAdjustments() {
    state.omrScale = DEFAULT_OMR_ADJUSTMENT.scale;
    state.omrOffsetX = DEFAULT_OMR_ADJUSTMENT.offsetX;
    state.omrOffsetY = DEFAULT_OMR_ADJUSTMENT.offsetY;
    state.classBarOffsetY = DEFAULT_CLASS_BAR_OFFSET_Y;
    syncSettingsControls();
    renderPreview();
    saveSettings();
    showToast('Tamanho e posição da folha OMR restaurados.');
  }