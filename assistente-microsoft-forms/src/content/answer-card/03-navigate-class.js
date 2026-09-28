

  function navigateClass(delta) {
    const current = state.classNames.indexOf(state.selectedClass);
    const next = Math.min(state.classNames.length - 1, Math.max(0, current + delta));
    if (next !== current) selectClass(state.classNames[next]);
  }

  function updateClassNavigation() {
    const index = state.classNames.indexOf(state.selectedClass);
    els.prevClass.disabled = index <= 0;
    els.nextClass.disabled = index < 0 || index >= state.classNames.length - 1;
  }

  function buildStudents() {
    if (!state.workbook || !state.selectedClass) return clearStudents();
    const sheet = selectedRosterSheet();
    if (!sheet) return clearStudents();
    const students = [];
    for (let row = Math.max(1, state.startRow); row <= Math.max(state.startRow, state.endRow); row++) {
      const name = cleanCell(readCell(sheet, state.mapping.name, row));
      const label = cleanCell(readCell(sheet, state.mapping.label, row));
      const rawNumber = cleanCell(readCell(sheet, state.mapping.number, row));
      const mappedClassColumn = Number(state.mapping.className);
      const className = (mappedClassColumn >= 0 ? cleanCell(readCell(sheet, mappedClassColumn, row)) : '') || state.selectedClass;
      if (!selectedRosterClassMatches(className)) continue;
      if (!name && !label && !rawNumber) continue;
      if (!name || !rawNumber) continue;
      const number = parseStudentNumber(rawNumber);
      if (number === null) continue;
      students.push({ name, label: label || `${name} ${number}`, number, className, row });
    }
    state.students = students;
    const savedIndex = state.savedStudentNumber === null ? -1 : students.findIndex((student) => student.number === state.savedStudentNumber);
    state.selectedStudentIndex = savedIndex >= 0 ? savedIndex : Math.min(state.selectedStudentIndex, Math.max(0, students.length - 1));
    populateStudentSelect();
    refreshStudentSummary();
    renderPreview({ resetPosition: true });
    updateActionButtons();
    updateStudentNavigation();
    saveSettings();
    publishSharedCardSnapshot('roster-rebuilt');
  }

  function clearStudents() {
    state.students = [];
    state.selectedStudentIndex = 0;
    els.studentSelect.innerHTML = '<option>Importe uma planilha primeiro</option>';
    els.studentSelect.disabled = true;
    refreshStudentSummary();
    renderPreview({ resetPosition: true });
    updateActionButtons();
    updateStudentNavigation();
    publishSharedCardSnapshot('roster-cleared');
  }

  function populateStudentSelect() {
    els.studentSelect.innerHTML = '';
    state.students.forEach((student, index) => els.studentSelect.append(new Option(`${String(student.number).padStart(2, '0')} — ${student.name}`, String(index))));
    els.studentSelect.disabled = !state.students.length;
    if (state.students.length) els.studentSelect.value = String(state.selectedStudentIndex);
  }

  function selectStudent(index) {
    if (!state.students.length) return;
    state.selectedStudentIndex = Math.min(state.students.length - 1, Math.max(0, index));
    const student = getSelectedStudent();
    state.savedStudentNumber = student?.number ?? null;
    els.studentSelect.value = String(state.selectedStudentIndex);
    refreshStudentSummary();
    renderPreview({ resetPosition: true });
    updateStudentNavigation();
    saveSettings();
    publishSharedCardContext('student-selected');
  }

  function navigateStudent(delta) { selectStudent(state.selectedStudentIndex + delta); }

  function updateStudentNavigation() {
    els.prevStudent.disabled = !state.students.length || state.selectedStudentIndex <= 0;
    els.nextStudent.disabled = !state.students.length || state.selectedStudentIndex >= state.students.length - 1;
  }

  function refreshStudentSummary() {
    const student = getSelectedStudent();
    els.studentCount.textContent = String(state.students.length);
    els.studentClass.textContent = student ? student.className : (state.selectedClass || '—');
    els.studentClass.title = student ? student.className : (state.selectedClass || '');
    els.previewCaption.textContent = student ? `${student.name} — ${student.className}` : 'Modelo inicial — importe a planilha para selecionar um aluno';
  }

  function updateActionButtons() {
    const disabled = !state.students.length;
    [els.printStudent, els.printClass, els.pdfStudent, els.pdfClass].filter(Boolean).forEach((button) => { button.disabled = disabled; });
  }

  function getSelectedStudent() { return state.students[state.selectedStudentIndex] || null; }

  function detectedColumnCount(sheet) {
    const selectedMaximum = Math.max(0, ...Object.values(state.mapping).map(Number).filter(Number.isFinite));
    let usedMaximum = 25;
    if (sheet?.['!ref'] && GSSF_CARD_XLSX?.utils?.decode_range) {
      try { usedMaximum = GSSF_CARD_XLSX.utils.decode_range(sheet['!ref']).e.c; } catch (_) {}
    }
    return Math.min(702, Math.max(26, selectedMaximum + 1, usedMaximum + 1));
  }

  function populateColumnSelectors() {
    const sheet = state.workbook && state.selectedClass ? selectedRosterSheet() : null;
    const columns = Array.from({ length: detectedColumnCount(sheet) }, (_, index) => {
      const header = sheet ? cleanCell(readCell(sheet, index, state.headerRow)) : '';
      return { value: index, label: `${columnLetter(index)} — ${header || `Coluna ${columnLetter(index)}`}` };
    });
    [[els.mapName, state.mapping.name], [els.mapLabel, state.mapping.label], [els.mapNumber, state.mapping.number]].forEach(([select, selected]) => {
      select.innerHTML = '';
      columns.forEach((column) => select.append(new Option(column.label, String(column.value))));
      select.value = String(Math.min(columns.length - 1, Math.max(0, Number(selected) || 0)));
    });
    els.mapClass.innerHTML = '';
    els.mapClass.append(new Option('Usar o nome da guia', '-1'));
    columns.forEach((column) => els.mapClass.append(new Option(column.label, String(column.value))));
    els.mapClass.value = Number(state.mapping.className) >= 0 ? String(Math.min(columns.length - 1, Number(state.mapping.className))) : '-1';
  }

  function applyMappingFromControls() {
    state.mapping = { name: Number(els.mapName.value), label: Number(els.mapLabel.value), number: Number(els.mapNumber.value), className: Number(els.mapClass.value) };
    buildStudents();
    saveSettings();
  }

  function applyRangeFromControls() {
    state.headerRow = clampInt(els.headerRow.value, 1, 100, 1);
    state.startRow = clampInt(els.startRow.value, 1, 500, 2);
    state.endRow = clampInt(els.endRow.value, state.startRow, 500, 47);
    syncSettingsControls();
    populateColumnSelectors();
    buildStudents();
    saveSettings();
  }

  function setPreviewSide(side, focusTab = false) {
    state.previewSide = side === 'back' ? 'back' : 'front';
    const isBack = state.previewSide === 'back';
    els.paperFlip.classList.toggle('is-flipped', isBack);
    root.querySelectorAll('.cr-side-tab').forEach((button) => {
      const active = button.dataset.side === state.previewSide;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focusTab) button.focus();
    });
    els.frontFace.setAttribute('aria-hidden', String(isBack));
    els.backFace.setAttribute('aria-hidden', String(!isBack));
    els.previewChip.textContent = isBack ? 'VERSO' : 'FRENTE';
    requestAnimationFrame(() => scalePreview({ resetPosition: true }));
  }

  function updateFrontContentStatus() {
    if (!els.performanceStatus) return;
    els.performanceStatus.classList.remove('is-performance', 'is-warning');
    if (state.customFront) {
      els.performanceStatus.classList.add('is-warning');
      els.performanceStatus.innerHTML = '<strong>Página personalizada ativa</strong>A substituição da frente tem prioridade sobre esta escolha.';
      return;
    }
    if (state.frontContentMode === 'performance') {
      els.performanceStatus.classList.add('is-performance');
      els.performanceStatus.innerHTML = '<strong>Fluxo com desempenho</strong>O cartão-resposta será impresso com a área das instruções em branco. Depois da avaliação, a guia Impressão preencherá o desempenho nessa mesma área.';
      return;
    }
    els.performanceStatus.innerHTML = '<strong>Fluxo com instruções</strong>As instruções serão impressas no cartão-resposta. A guia Impressão adicionará somente a nota e as contagens.';
  }

  function setFrontContentMode(mode, options = {}) {
    state.frontContentMode = mode === 'performance' ? 'performance' : 'instructions';
    if (els.frontContentMode) els.frontContentMode.value = state.frontContentMode;
    syncChoiceSwitch('crFrontContentMode', state.frontContentMode);
    renderPreview({ resetPosition: true });
    saveSettings();
    publishSharedCardSnapshot(options.reason || 'front-content-mode');
    if (!options.silent) {
      showToast(state.frontContentMode === 'performance' ? 'A área das instruções ficará em branco no cartão e será preenchida depois pela guia Impressão.' : 'As instruções voltarão a ser impressas no cartão; o desempenho não será adicionado.');
    }
    return state.frontContentMode;
  }

  function applyFrontContentMode() {
    setFrontContentMode(els.frontContentMode?.value);
  }

  function fitStudentNames(container) {
    (container || document).querySelectorAll('.cr-student-name').forEach((element) => {
      element.style.fontSize = '';
      let size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
      while ((element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) && size > 8) {
        size -= .5;
        element.style.fontSize = `${size}px`;
      }
    });
  }

  function renderPreview(options = {}) {
    const student = getSelectedStudent() || { name: '', label: '', number: '', className: '' };
    els.frontFace.innerHTML = frontPageHtml(student);
    els.backFace.innerHTML = backPageHtml();
    fitStudentNames(els.frontFace);
    els.paperFlip.classList.toggle('is-flipped', state.previewSide === 'back');
    updateFrontContentStatus();
    requestAnimationFrame(() => scalePreview({ resetPosition: Boolean(options.resetPosition) }));
  }

  function clampScroll(value, maximum) {
    return Math.min(Math.max(0, value), Math.max(0, maximum));
  }

  function resetPreviewPosition() {
    if (!els.previewScroll) return;
    const applyPosition = () => {
      els.previewScroll.scrollTop = 0;
      const horizontalOverflow = Math.max(0, els.previewScroll.scrollWidth - els.previewScroll.clientWidth);
      els.previewScroll.scrollLeft = horizontalOverflow / 2;
    };
    applyPosition();
    requestAnimationFrame(applyPosition);
    clearTimeout(resetPreviewPosition.timer);
    resetPreviewPosition.timer = setTimeout(applyPosition, 80);
  }

  function previewScaleOrigin() {
    return {
      x: (els.paperViewport?.offsetLeft || 0) + (els.paperShell?.offsetLeft || 0),
      y: (els.paperViewport?.offsetTop || 0) + (els.paperShell?.offsetTop || 0)
    };
  }

  function applyPreviewScale(scale, anchor = null) {
    const pageWidth = els.paperScale.offsetWidth || 794;
    const pageHeight = els.paperScale.offsetHeight || 1123;
    els.paperScale.style.transform = `scale(${scale})`;
    els.paperScale.dataset.appliedScale = String(scale);
    els.paperShell.style.width = `${pageWidth * scale}px`;
    els.paperShell.style.height = `${pageHeight * scale}px`;
    if (!anchor) return;
    const origin = previewScaleOrigin();
    const maxTop = Math.max(0, els.previewScroll.scrollHeight - els.previewScroll.clientHeight);
    const maxLeft = Math.max(0, els.previewScroll.scrollWidth - els.previewScroll.clientWidth);
    els.previewScroll.scrollTop = clampScroll(origin.y + anchor.y * scale - els.previewScroll.clientHeight / 2, maxTop);
    els.previewScroll.scrollLeft = clampScroll(origin.x + anchor.x * scale - els.previewScroll.clientWidth / 2, maxLeft);
  }

  function cancelPreviewScaleAnimation() {
    if (scalePreview.animationFrame) cancelAnimationFrame(scalePreview.animationFrame);
    scalePreview.animationFrame = 0;
  }

  function scalePreview(options = {}) {
    if (!mounted || !root?.isConnected || !els.previewScroll || !els.paperScale || !els.paperShell) return;
    const pageWidth = els.paperScale.offsetWidth || 794;
    const pageHeight = els.paperScale.offsetHeight || 1123;
    const availableWidth = Math.max(250, els.previewScroll.clientWidth - 26);
    const availableHeight = Math.max(260, els.previewScroll.clientHeight - 26);
    const fitScale = Math.min(1, availableWidth / pageWidth, availableHeight / pageHeight);
    const targetScale = state.zoom > 1 ? state.zoom : fitScale * state.zoom;
    const currentScale = Number(els.paperScale.dataset.appliedScale) || targetScale;
    const origin = previewScaleOrigin();
    const anchor = options.preserveCenter ? {
      x: (els.previewScroll.scrollLeft + els.previewScroll.clientWidth / 2 - origin.x) / Math.max(.001, currentScale),
      y: (els.previewScroll.scrollTop + els.previewScroll.clientHeight / 2 - origin.y) / Math.max(.001, currentScale)
    } : null;

    cancelPreviewScaleAnimation();
    if (options.resetPosition) {
      applyPreviewScale(targetScale);
      resetPreviewPosition();
      return;
    }
    if (!options.animate || Math.abs(targetScale - currentScale) < .001) {
      applyPreviewScale(targetScale, anchor);
      return;
    }

    const startedAt = performance.now();
    const duration = 280;
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const scale = currentScale + (targetScale - currentScale) * eased;
      applyPreviewScale(scale, anchor);
      if (progress < 1) scalePreview.animationFrame = requestAnimationFrame(step);
      else scalePreview.animationFrame = 0;
    };
    scalePreview.animationFrame = requestAnimationFrame(step);
  }

  function customPageHtml(source, side) {
    return `<article class="cr-sheet cr-custom-page cr-custom-${side}"><img class="cr-custom-page-image" src="${escapeAttr(source)}" alt="Página personalizada ${side === 'front' ? 'da frente' : 'do verso'}"></article>`;
  }

  function studentNameClass(name) {
    const length = [...cleanCell(name)].length;
    if (length > 64) return 'is-very-long';
    if (length > 48) return 'is-long';
    if (length > 32) return 'is-medium';
    return '';
  }