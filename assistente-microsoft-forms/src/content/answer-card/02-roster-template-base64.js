

  const ROSTER_TEMPLATE_BASE64 = __GSSF_RESOURCE__("ROSTER_TEMPLATE_BASE64");

  function downloadRosterTemplate() {
    try {
      const binary = atob(ROSTER_TEMPLATE_BASE64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Modelo_Alunos_Cartao_Resposta.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      showToast('Modelo Excel baixado. Apague os exemplos, preencha os alunos e importe o arquivo.');
    } catch (error) {
      console.error(error);
      showToast('Não foi possível baixar o modelo Excel.');
    }
  }

  function normalizedRosterHeader(value) {
    return normalizeText(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function findRosterSheetLayout(sheet, sheetName = '') {
    if (!sheet?.['!ref'] || !GSSF_CARD_XLSX) return null;
    let range;
    try { range = GSSF_CARD_XLSX.utils.decode_range(sheet['!ref']); } catch (_) { return null; }
    const maxHeaderRow = Math.min(range.e.r + 1, 20);
    const aliases = {
      name: new Set(['nome do aluno', 'nome aluno', 'aluno', 'nome', 'estudante']),
      number: new Set(['numero', 'numero do aluno', 'n do aluno', 'n', 'nº', 'nº do aluno', 'n de chamada', 'nº de chamada', 'numero de chamada', 'chamada']),
      className: new Set(['turma completa', 'turma', 'classe', 'sala']),
      label: new Set(['aluno e numero', 'aluno numero', 'nome e numero', 'nome numero'])
    };
    for (let row = 1; row <= maxHeaderRow; row += 1) {
      const headers = [];
      for (let column = range.s.c; column <= range.e.c; column += 1) headers[column] = normalizedRosterHeader(readCell(sheet, column, row));
      const findAlias = (set) => headers.findIndex((header) => set.has(header));
      const name = findAlias(aliases.name);
      const number = findAlias(aliases.number);
      if (name < 0 || number < 0) continue;
      const className = findAlias(aliases.className);
      const label = findAlias(aliases.label);
      return {
        sheetName,
        headerRow: row,
        startRow: row + 1,
        endRow: Math.max(row + 1, range.e.r + 1),
        mapping: { name, number, className, label: label >= 0 ? label : name }
      };
    }
    return null;
  }

  function applyInferredSheetLayout(sheetName) {
    const layout = state.inferredSheetLayouts?.[sheetName];
    if (!layout) return false;
    state.mapping = { ...layout.mapping };
    state.headerRow = layout.headerRow;
    state.startRow = layout.startRow;
    state.endRow = layout.endRow;
    syncSettingsControls();
    return true;
  }

  function detectSimpleRosterWorkbook(workbook, preferredSheetName = '') {
    if (!workbook || !GSSF_CARD_XLSX) return null;
    const orderedSheets = preferredSheetName
      ? [preferredSheetName, ...(workbook.SheetNames || []).filter((name) => name !== preferredSheetName)]
      : (workbook.SheetNames || []);
    for (const sheetName of orderedSheets) {
      const sheet = workbook.Sheets?.[sheetName];
      const layout = findRosterSheetLayout(sheet, sheetName);
      if (!layout || layout.mapping.className < 0) continue;
      const classes = [];
      for (let dataRow = layout.startRow; dataRow <= layout.endRow; dataRow += 1) {
        const value = cleanCell(readCell(sheet, layout.mapping.className, dataRow));
        if (value && !classes.some((item) => normalizeText(item) === normalizeText(value))) classes.push(value);
      }
      if (classes.length) return { ...layout, classes };
    }
    return null;
  }

  function selectedRosterSheet() {
    if (!state.workbook) return null;
    const sheetName = state.workbookMode === 'simple' ? state.rosterSheetName : state.selectedClass;
    return sheetName ? state.workbook.Sheets?.[sheetName] || null : null;
  }

  function selectedRosterClassMatches(value) {
    if (state.workbookMode !== 'simple') return true;
    return normalizeText(value) === normalizeText(state.selectedClass);
  }
  function resetWorkbookDerivedState() {
    state.workbook = null;
    state.fileName = '';
    state.workbookMode = 'relation';
    state.rosterSheetName = '';
    state.inferredSheetLayouts = {};
    state.classNames = [];
    state.selectedClass = '';
    state.savedClass = '';
    state.students = [];
    state.selectedStudentIndex = 0;
    state.savedStudentNumber = null;
    state.mapping = { ...DEFAULT_ROSTER_MAPPING };
    state.headerRow = DEFAULT_ROSTER_RANGE.headerRow;
    state.startRow = DEFAULT_ROSTER_RANGE.startRow;
    state.endRow = DEFAULT_ROSTER_RANGE.endRow;
  }

  function releaseWorkbookRuntime({ announce = false, updateUi = true, save = true, publish = true, bumpGeneration = true } = {}) {
    if (bumpGeneration) workbookLoadGeneration += 1;
    const hadWorkbook = Boolean(state.workbook || state.fileName || state.classNames.length || state.students.length);
    resetWorkbookDerivedState();
    if (els.fileInput) els.fileInput.value = '';
    if (updateUi && mounted && root) {
      setFileUi('', false);
      populateClassSelect();
      populateColumnSelectors();
      syncSettingsControls();
      clearMessage();
      setLibraryStatus('SheetJS local completo pronto', 'ready');
      if (announce && hadWorkbook) showToast('Planilha removida da memória.');
    }
    if (save) saveSettings();
    if (publish) publishSharedCardSnapshot('roster-file-cleared');
  }

  function prepareWorkbookReplacement() {
    // O clique no seletor invalida a leitura anterior antes de o navegador abrir a janela de arquivos.
    // Assim, cancelar a seleção também deixa claro que o arquivo anterior foi descartado.
    releaseWorkbookRuntime({ announce: false });
  }

  function loadSpreadsheetLibrary() { setLibraryStatus('SheetJS local completo pronto', 'ready'); clearMessage(); }

  function setLibraryStatus(text, kind) { if (!els.libraryStatus) return; els.libraryStatus.textContent = text; els.libraryStatus.dataset.kind = kind || ''; }

  async function handleWorkbookFile(event) {
    const input = event.currentTarget || event.target;
    const file = input?.files?.[0];
    if (!file) return;
    const generation = ++workbookLoadGeneration;
    // Garante o mesmo comportamento mesmo quando o evento change é disparado sem o clique normal do seletor.
    releaseWorkbookRuntime({ announce: false, bumpGeneration: false });
    if (!GSSF_CARD_XLSX) { setMessage('O leitor local de planilhas não está disponível.'); return; }
    clearMessage();
    setLibraryStatus('Lendo a planilha…', '');
    let data = null;
    let workbook = null;
    try {
      data = await gssfReadSpreadsheetArrayBuffer(file);
      if (generation !== workbookLoadGeneration) return;
      workbook = gssfReadSpreadsheetBuffer(data, GSSF_CARD_XLSX, { raw: false, cellText: true, cellFormula: false, cellDates: false });
      if (generation !== workbookLoadGeneration) return;
      loadWorkbookObject(workbook, file.name);
      setFileUi(file.name, true);
      setLibraryStatus('Planilha carregada', 'ready');
    } catch (error) {
      if (generation !== workbookLoadGeneration) return;
      console.error(error);
      releaseWorkbookRuntime({ announce: false, bumpGeneration: false });
      setLibraryStatus('Falha ao abrir a planilha', 'warn');
      setMessage(`Não foi possível abrir a planilha: ${error?.message || 'erro desconhecido'}.`);
      showToast('Falha ao abrir a planilha.');
    } finally {
      data = null;
      workbook = null;
      if (input) input.value = '';
    }
  }

  function setFileUi(fileName, loaded) {
    els.fileDrop?.classList.toggle('has-file', loaded);
    if (els.filePrompt) els.filePrompt.textContent = loaded ? fileName : 'Selecionar arquivo Excel';
    if (els.fileName) els.fileName.textContent = loaded ? 'Clique aqui para substituir o arquivo atual.' : 'XLS, XLSX, XLSM, XLSB, ODS ou CSV';
    if (els.clearWorkbook) els.clearWorkbook.hidden = !loaded;
  }

  function visibleWorkbookSheets(workbook) {
    const metadata = workbook?.Workbook?.Sheets || [];
    return (workbook?.SheetNames || []).filter((name, index) => {
      const normalized = normalizeText(name);
      const hidden = Number(metadata[index]?.Hidden || 0);
      return normalized !== 'inicio' && hidden === 0 && Boolean(workbook.Sheets?.[name]?.['!ref']);
    });
  }

  function loadWorkbookObject(workbook, fileName = 'Planilha') {
    state.workbook = workbook;
    state.fileName = fileName;
    state.inferredSheetLayouts = {};

    // O arquivo de relação escolar possui prioridade quando INICIO referencia guias de turmas.
    // Isso evita confundi-lo com o modelo simples, pois as guias das turmas podem usar cabeçalhos semelhantes.
    const inicioName = findSheetName('INICIO');
    const relationClasses = [];
    if (inicioName) {
      const inicio = workbook.Sheets[inicioName];
      for (let row = 7; row <= 28; row++) {
        const value = cleanCell(readCell(inicio, 5, row));
        if (!value || value === '0') continue;
        const matched = findSheetName(value);
        if (matched && !relationClasses.includes(matched)) relationClasses.push(matched);
      }
    }
    if (relationClasses.length) {
      state.workbookMode = 'relation';
      state.rosterSheetName = '';
      relationClasses.forEach((sheetName) => {
        const layout = findRosterSheetLayout(workbook.Sheets?.[sheetName], sheetName);
        if (layout) state.inferredSheetLayouts[sheetName] = layout;
      });
      state.classNames = relationClasses;
      state.selectedClass = relationClasses[0];
      if (state.selectedClass) applyInferredSheetLayout(state.selectedClass);
      populateClassSelect();
      clearMessage();
      populateColumnSelectors();
      buildStudents();
      showToast('Planilha carregada e turmas identificadas.');
      return;
    }

    // Modelo simples: somente uma guia visível, ou uma guia explicitamente chamada ALUNOS.
    // Uma relação personalizada com várias guias não pode ser reduzida à primeira guia que
    // possua uma coluna TURMA, pois isso ocultaria as demais turmas do arquivo.
    const visibleSheetsBeforeMode = visibleWorkbookSheets(workbook);
    const explicitSimpleSheet = visibleSheetsBeforeMode.find((name) => normalizeText(name) === 'alunos') || '';
    const simpleRoster = (visibleSheetsBeforeMode.length === 1 || explicitSimpleSheet)
      ? detectSimpleRosterWorkbook(workbook, explicitSimpleSheet)
      : null;
    if (simpleRoster) {
      state.workbookMode = 'simple';
      state.rosterSheetName = simpleRoster.sheetName;
      state.mapping = { ...simpleRoster.mapping };
      state.headerRow = simpleRoster.headerRow;
      state.startRow = simpleRoster.startRow;
      state.endRow = simpleRoster.endRow;
      state.classNames = simpleRoster.classes;
      state.selectedClass = state.classNames.some((item) => normalizeText(item) === normalizeText(state.savedClass))
        ? state.classNames.find((item) => normalizeText(item) === normalizeText(state.savedClass))
        : (state.classNames[0] || '');
      populateClassSelect();
      syncSettingsControls();
      if (!state.classNames.length) {
        setMessage('O modelo foi reconhecido, mas nenhuma turma preenchida foi encontrada.');
        clearStudents();
        return;
      }
      clearMessage();
      populateColumnSelectors();
      buildStudents();
      showToast('Modelo de alunos reconhecido automaticamente.');
      return;
    }

    // Relação personalizada: cada guia visível pode representar uma turma. O cabeçalho
    // é detectado por guia, aceitando variações como Nome, Nome do Aluno, Número e Nº de chamada.
    state.workbookMode = 'relation';
    state.rosterSheetName = '';
    const visibleSheets = visibleWorkbookSheets(workbook);
    visibleSheets.forEach((sheetName) => {
      const layout = findRosterSheetLayout(workbook.Sheets?.[sheetName], sheetName);
      if (layout) state.inferredSheetLayouts[sheetName] = layout;
    });
    const detectedSheets = visibleSheets.filter((sheetName) => Boolean(state.inferredSheetLayouts[sheetName]));
    const classNames = detectedSheets.length ? detectedSheets : visibleSheets;
    state.classNames = classNames;
    state.selectedClass = classNames.includes(state.savedClass) ? state.savedClass : (classNames[0] || '');
    if (state.selectedClass) applyInferredSheetLayout(state.selectedClass);
    populateClassSelect();
    if (!classNames.length) {
      setMessage('Nenhuma guia de turma utilizável foi encontrada na planilha.');
      clearStudents();
      return;
    }
    if (!detectedSheets.length) {
      setMessage('As guias foram abertas, mas os cabeçalhos não foram reconhecidos automaticamente. Ajuste as colunas em Mais configurações.');
    } else clearMessage();
    populateColumnSelectors();
    buildStudents();
    showToast(detectedSheets.length ? 'Planilha personalizada reconhecida automaticamente.' : 'Planilha carregada; ajuste o mapeamento das colunas.');
  }

  function findSheetName(wanted) {
    if (!state.workbook) return '';
    const normalized = normalizeText(wanted);
    return state.workbook.SheetNames.find((name) => normalizeText(name) === normalized) || '';
  }

  function readCell(sheet, zeroBasedColumn, oneBasedRow) {
    if (!sheet || !GSSF_CARD_XLSX) return '';
    const address = GSSF_CARD_XLSX.utils.encode_cell({ c: zeroBasedColumn, r: oneBasedRow - 1 });
    const cell = sheet[address];
    return cell ? (cell.w ?? cell.v ?? '') : '';
  }

  function populateClassSelect() {
    els.classSelect.innerHTML = '';
    if (!state.classNames.length) {
      els.classSelect.disabled = true;
      els.classSelect.append(new Option(state.workbook ? 'Nenhuma turma encontrada' : 'Importe uma planilha primeiro', ''));
      clearStudents();
      updateClassNavigation();
      return;
    }
    state.classNames.forEach((name) => els.classSelect.append(new Option(name, name)));
    els.classSelect.value = state.selectedClass;
    els.classSelect.disabled = false;
    updateClassNavigation();
  }

  function selectClass(className) {
    if (!state.classNames.includes(className)) return;
    state.selectedClass = className;
    state.savedClass = className;
    state.selectedStudentIndex = 0;
    state.savedStudentNumber = null;
    els.classSelect.value = className;
    applyInferredSheetLayout(className);
    populateColumnSelectors();
    buildStudents();
    updateClassNavigation();
    saveSettings();
  }