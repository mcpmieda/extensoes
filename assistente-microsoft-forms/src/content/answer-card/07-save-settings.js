

  function saveSettings() {
    clearTimeout(saveSettings.timer);
    saveSettings.timer = setTimeout(persistSettingsNow, 120);
  }

  function persistSettingsNow() {
    const selected = getSelectedStudent();
    const payload = {
      mapping: state.mapping, headerRow: state.headerRow, startRow: state.startRow, endRow: state.endRow,
      omrFit: state.omrFit, omrAdjustmentVersion: OMR_ADJUSTMENT_VERSION, omrScale: state.omrScale, omrOffsetX: state.omrOffsetX, omrOffsetY: state.omrOffsetY, classBarOffsetY: state.classBarOffsetY,
      zoom: state.zoom, instructionLeft: state.instructionLeft, instructionRight: state.instructionRight, cardTitle: state.cardTitle, cardSubtitle: state.cardSubtitle,
      instructionSectionOpen: state.instructionSectionOpen, frontContentMode: state.frontContentMode,
      selectedClass: state.selectedClass || state.savedClass, selectedStudentNumber: selected?.number ?? state.savedStudentNumber,
      customFrontName: state.customFrontName, customBackName: state.customBackName
    };
    if (state.storageAvailable) {
      try { globalThis.GSSF_STORAGE?.setItem?.(STORAGE_KEY, JSON.stringify(payload)); }
      catch (error) { console.warn('Falha ao salvar configurações:', error); state.storageAvailable = false; showToast('O navegador não permitiu salvar os textos e ajustes.'); }
    }
    persistDirtyMedia();
  }

  function setMessage(text) { els.workbookMessage.textContent = text; els.workbookMessage.hidden = !text; }
  function clearMessage() { setMessage(''); }
  function hideToast() {
    clearTimeout(showToast.timer);
    if (!els.toast) return;
    els.toast.classList.remove('show');
    els.toast.textContent = '';
  }
  function showToast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(hideToast, 3000);
  }
  function cleanCell(value) { return value === null || value === undefined ? '' : String(value).replace(/\u00a0/g, ' ').trim(); }
  function normalizeText(value) { return cleanCell(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' '); }
  function parseStudentNumber(value) { const match = cleanCell(value).replace(/\s/g, '').match(/\d+/); if (!match) return null; const number = Number(match[0]); return Number.isInteger(number) && number >= 0 ? number : null; }
  function clampInt(value, min, max, fallback) { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
  function columnLetter(index) { let number = index + 1, output = ''; while (number > 0) { const remainder = (number - 1) % 26; output = String.fromCharCode(65 + remainder) + output; number = Math.floor((number - 1) / 26); } return output; }
  function rollDigits(number) { return String(Math.abs(Number(number) || 0) % 100).padStart(2, '0'); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]); }
  function escapeAttr(value) { return escapeHtml(value); }
  function fileToDataUri(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
  function loadImage(source) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; }); }


  async function clearAnswerCardStoredData({ resetRuntime = true } = {}) {
    await clearStoredMedia({ strict: true });
    globalThis.GSSF_STORAGE?.removeItem?.(STORAGE_KEY);
    if (!resetRuntime) return;
    workbookLoadGeneration += 1;
    resetWorkbookDerivedState();
    state.logo = DEFAULTS.logo; state.omr = DEFAULTS.omr;
    state.omrNatural = { width: 1000, height: 485 };
    state.omrFit = 'contain';
    state.omrScale = DEFAULT_OMR_ADJUSTMENT.scale;
    state.omrOffsetX = DEFAULT_OMR_ADJUSTMENT.offsetX;
    state.omrOffsetY = DEFAULT_OMR_ADJUSTMENT.offsetY;
    state.classBarOffsetY = DEFAULT_CLASS_BAR_OFFSET_Y;
    state.bubbleDetection = null;
    state.customFront = ''; state.customBack = ''; state.customFrontName = ''; state.customBackName = '';
    state.instructionLeft = DEFAULTS.instructionLeft; state.instructionRight = DEFAULTS.instructionRight;
    state.cardTitle = DEFAULTS.cardTitle; state.cardSubtitle = DEFAULTS.cardSubtitle;
    state.instructionSectionOpen = false;
    state.frontContentMode = 'instructions'; state.zoom = 1; state.previewSide = 'front';
    state.activeEditor = null; state.savedRange = null;
    state.mediaDirty.clear();
    settingsRestored = true;
    if (mounted && root) {
      collectElements(); syncSettingsControls(); restoreAllEditors(); populateClassSelect(); clearStudents(); updateCustomPageStatus(); renderPreview();
    }
  }

  function sharedCardNormalizeName(value) {
    return cleanCell(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function sharedCardStudentId(student) {
    const className = normalizeText(student?.className || state.selectedClass || 'SEM TURMA');
    const roll = cleanCell(student?.number);
    const name = sharedCardNormalizeName(student?.name);
    return `${className}|${roll}|${name}`;
  }

  function sharedCardReadRoster() {
    if (!state.workbook || !state.classNames.length) return [];
    const roster = [];
    const readSheet = (sheet, sheetName, restrictClass = '') => {
      if (!sheet) return;
      const layout = state.workbookMode === 'relation' ? state.inferredSheetLayouts?.[sheetName] : null;
      const mapping = layout?.mapping || state.mapping;
      const startRow = layout?.startRow || state.startRow;
      const endRow = layout?.endRow || state.endRow;
      for (let row = Math.max(1, startRow); row <= Math.max(startRow, endRow); row++) {
        const name = cleanCell(readCell(sheet, mapping.name, row));
        const label = cleanCell(readCell(sheet, mapping.label, row));
        const rawNumber = cleanCell(readCell(sheet, mapping.number, row));
        const mappedClassColumn = Number(mapping.className);
        const rawClassName = mappedClassColumn >= 0 ? cleanCell(readCell(sheet, mappedClassColumn, row)) : '';
        const className = restrictClass || rawClassName || sheetName;
        if (!name || !rawNumber) continue;
        const number = parseStudentNumber(rawNumber);
        if (number === null) continue;
        const student = { name, label: label || `${name} ${number}`, number, roll: String(number), className, sourceClassName: rawClassName, sheetName, row };
        roster.push({ ...student, sourceId: sharedCardStudentId(student) });
      }
    };
    if (state.workbookMode === 'simple') {
      readSheet(state.workbook.Sheets[state.rosterSheetName], state.rosterSheetName);
    } else {
      state.classNames.forEach((sheetName) => readSheet(state.workbook.Sheets[sheetName], sheetName, sheetName));
    }
    return roster;
  }

  function getSharedCardSnapshot() {
    const students = sharedCardReadRoster();
    const counts = new Map();
    students.forEach((student) => counts.set(student.className, (counts.get(student.className) || 0) + 1));
    const selected = getSelectedStudent();
    return {
      schemaVersion: 1,
      source: 'card',
      fileName: state.fileName || '',
      classes: state.classNames.map((className) => ({ name: className, studentCount: counts.get(className) || students.filter((student) => normalizeText(student.className) === normalizeText(className)).length })),
      students,
      selection: {
        className: state.selectedClass || '',
        studentSourceId: selected ? sharedCardStudentId(selected) : '',
        roll: selected ? String(selected.number) : '',
        name: selected?.name || ''
      },
      settings: {
        mapping: { ...state.mapping },
        headerRow: state.headerRow,
        startRow: state.startRow,
        endRow: state.endRow,
        frontContentMode: state.frontContentMode
      }
    };
  }

  function publishSharedCardSnapshot(reason = 'update') {
    const snapshot = getSharedCardSnapshot();
    if (window.GSSFSharedBridge?.publish) window.GSSFSharedBridge.publish('card', snapshot, reason);
    return snapshot;
  }

  function publishSharedCardContext(reason = 'selection') {
    const selected = getSelectedStudent();
    const context = {
      className: state.selectedClass || '',
      studentSourceId: selected ? sharedCardStudentId(selected) : '',
      roll: selected ? String(selected.number) : '',
      name: selected?.name || ''
    };
    if (window.GSSFSharedBridge?.updateSourceContext) window.GSSFSharedBridge.updateSourceContext('card', context, reason);
    return context;
  }

  function handleSharedCardQuery(action, params = {}) {
    if (action === 'get-roster') return getSharedCardSnapshot();
    if (action === 'get-student') {
      const roster = sharedCardReadRoster();
      const wantedId = cleanCell(params.sourceId);
      const wantedClass = normalizeText(params.className || '');
      const wantedRoll = cleanCell(params.roll);
      const wantedName = sharedCardNormalizeName(params.name || '');
      return roster.find((student) =>
        (wantedId && student.sourceId === wantedId) ||
        (wantedClass && wantedRoll && normalizeText(student.className) === wantedClass && cleanCell(student.roll) === wantedRoll && (!wantedName || sharedCardNormalizeName(student.name) === wantedName))
      ) || null;
    }
    if (action === 'get-selection') return publishSharedCardContext('query');
    throw new Error(`Consulta não suportada pelo Cartão-resposta: ${action}`);
  }

  async function flushAnswerCardBackupState() {
    clearTimeout(saveSettings.timer);
    persistSettingsNow();
    await mediaWriteQueue.catch(() => {});
    await globalThis.GSSF_STORAGE?.flush?.();
  }

  async function reloadAnswerCardBackupState() {
    restoreStoredSettings();
    await restoreStoredMedia();
    if (mounted && root) {
      syncSettingsControls();
      restoreAllEditors();
      populateClassSelect();
      populateStudents();
      renderPreview();
      publishSharedCardSnapshot('backup-restored');
    }
  }

  const publicApi = {
    loadWorkbookObject,
    getState: () => ({ classNames: [...state.classNames], selectedClass: state.selectedClass, students: state.students.map((student) => ({ ...student })), mapping: { ...state.mapping }, omrDetected: Boolean(state.bubbleDetection?.roll), zoom: state.zoom, frontContentMode: state.frontContentMode, classBarOffsetY: state.classBarOffsetY }),
    setFrontContentMode: (mode, options = {}) => setFrontContentMode(mode, options),
    getVisualGuideSnapshot: () => ({
      cardTitle: state.cardTitle,
      cardSubtitle: state.cardSubtitle,
      instructionLeft: state.instructionLeft,
      instructionRight: state.instructionRight,
      logo: state.logo,
      omr: state.omr,
      omrFit: state.omrFit,
      omrAdjustmentVersion: OMR_ADJUSTMENT_VERSION,
      omrScale: state.omrScale,
      omrOffsetX: state.omrOffsetX,
      omrOffsetY: state.omrOffsetY,
      classBarOffsetY: state.classBarOffsetY,
      frontLayout: { ...FRONT_GUIDE_LAYOUT }
    }),
    open: openModal,
    close: closeModal,
    resetPreviewPosition: () => scalePreview({ resetPosition: true }),
    printSelected: () => printStudents([getSelectedStudent()]),
    printClass: () => printStudents(state.students),
    rerunOmrDetection: () => detectOmrBubbles(true),
    getOmrAlignmentAudit: () => {
      const roll = currentRollCoordinates();
      return {
        detected: Boolean(state.bubbleDetection?.roll),
        sourceSize: { ...state.omrNatural },
        viewportMm: {
          width: FRONT_GUIDE_LAYOUT.pageWidth - FRONT_GUIDE_LAYOUT.pageLeft - FRONT_GUIDE_LAYOUT.pageRight,
          height: FRONT_GUIDE_LAYOUT.omrHeight
        },
        fit: state.omrFit,
        scale: state.omrScale,
        offsetX: state.omrOffsetX,
        offsetY: state.omrOffsetY,
        classBarOffsetY: state.classBarOffsetY,
        firstColumn: roll.columns[0].map((point) => ({ source: { ...point }, mapped: mapOmrPoint(point) })),
        secondColumn: roll.columns[1].map((point) => ({ source: { ...point }, mapped: mapOmrPoint(point) })),
        boxes: roll.boxes.map((point) => ({ source: { ...point }, mapped: mapOmrPoint(point) }))
      };
    },
    getSharedSnapshot: getSharedCardSnapshot,
    publishSharedSnapshot: publishSharedCardSnapshot,
    publishSharedContext: publishSharedCardContext,
    handleSharedQuery: handleSharedCardQuery
  };


  const WORKSPACE_HTML = __GSSF_RESOURCE__("WORKSPACE_HTML");
  Object.assign(publicApi, {
    workspaceHtml: () => WORKSPACE_HTML,
    mount: mountAnswerCardWorkspace,
    unmount: unmountAnswerCardWorkspace,
    activate: activateAnswerCardWorkspace,
    clearStoredData: clearAnswerCardStoredData,
    flushBackupState: flushAnswerCardBackupState,
    reloadBackupState: reloadAnswerCardBackupState,
    isMounted: () => mounted
  });
  globalThis.GSSFAnswerCard = publicApi;
  globalThis.CardaoRespostaApp = publicApi;
