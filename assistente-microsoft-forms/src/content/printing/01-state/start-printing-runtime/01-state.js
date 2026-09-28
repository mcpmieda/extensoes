
    const printDocument = createPrintDocument(shadowRoot);
    const runtimeWindowListeners = [];
    const addRuntimeWindowListener = (type, listener, options) => {
      globalThis.addEventListener(type, listener, options);
      runtimeWindowListeners.push([type, listener, options]);
    };
    const cleanupRuntimeWindowListeners = () => {
      runtimeWindowListeners.splice(0).forEach(([type, listener, options]) => globalThis.removeEventListener(type, listener, options));
    };

  const STORAGE_KEY = 'gssf_impressao_notas_v1';
  const ANALYSIS_CONFIG_KEY = 'gssf_pedagogical_analysis_config_v1';
  const LOT_DB_NAME = 'gssf_impressao_lotes_db_v1';
  const LOT_DB_STORE = 'lots';

  const SHARED_PROTOCOL = 'gssf-shared-data-v1';
  let sharedPrintTimer = 0;

  function sharedPrintPost(type, payload, reason = '') {
    const bridge = globalThis.GSSFSharedBridge;
    if (type === 'snapshot') bridge?.publish?.('print', payload, reason);
    else if (type === 'context') bridge?.updateSourceContext?.('print', payload, reason);
    else if (type === 'register') bridge?.register?.('print', payload, reason);
  }

  function getSharedPrintSnapshot() {
    const datasets = state.datasets.map((dataset) => ({
      id: dataset.key,
      key: dataset.key,
      fileName: dataset.fileName,
      className: displayClass(dataset),
      detectedClassName: dataset.classDisplay,
      sheetName: dataset.sheetName,
      studentCount: dataset.students.length
    }));
    const students = state.datasets.flatMap((dataset) => dataset.students.map((student) => ({
      sourceId: `${dataset.key}|${clean(student.roll)}|${normalizeHeader(student.name)}`,
      datasetId: dataset.key,
      fileName: dataset.fileName,
      className: displayClass(dataset),
      roll: clean(student.roll),
      name: clean(student.name),
      totalMarks: clean(student.total),
      rank: clean(student.rank),
      correct: Math.max(0, Number(student.correct) || 0),
      incorrect: Math.max(0, Number(student.incorrect) || 0),
      blank: Math.max(0, Number(student.blank) || 0),
      sourceIndex: student.sourceIndex
    })));
    const dataset = currentDataset();
    const student = currentStudent();
    return {
      schemaVersion: 1,
      source: 'print',
      datasets,
      students,
      selection: {
        datasetId: dataset?.key || '',
        className: dataset ? displayClass(dataset) : '',
        studentSourceId: dataset && student ? `${dataset.key}|${clean(student.roll)}|${normalizeHeader(student.name)}` : '',
        roll: student?.roll || '',
        name: student?.name || ''
      },
      sections: clonePerformanceSections(state.performanceSections),
      settings: { order: state.order, decimals: state.decimals, separator: state.separator, frontContentMode: getFrontContentMode(), target: state.performanceTarget }
    };
  }

  function publishSharedPrintSnapshot(reason = 'update') {
    clearTimeout(sharedPrintTimer);
    sharedPrintTimer = setTimeout(() => sharedPrintPost('snapshot', getSharedPrintSnapshot(), reason), 40);
  }

  function publishSharedPrintContext(reason = 'selection') {
    const dataset = currentDataset();
    const student = currentStudent();
    sharedPrintPost('context', {
      datasetId: dataset?.key || '',
      className: dataset ? displayClass(dataset) : '',
      studentSourceId: dataset && student ? `${dataset.key}|${clean(student.roll)}|${normalizeHeader(student.name)}` : '',
      roll: student?.roll || '',
      name: student?.name || ''
    }, reason);
  }

  function handleSharedPrintQuery(action, params = {}) {
    if (action === 'get-results') return getSharedPrintSnapshot();
    if (action === 'get-selection') return getSharedPrintSnapshot().selection;
    if (action === 'get-student-result') {
      const wantedDataset = clean(params.datasetId);
      const wantedClass = normalizeClass(params.className || '');
      const wantedRoll = clean(params.roll);
      const wantedName = normalizeHeader(params.name || '');
      for (const dataset of state.datasets) {
        if (wantedDataset && dataset.key !== wantedDataset) continue;
        if (!wantedDataset && wantedClass && normalizeClass(displayClass(dataset)) !== wantedClass) continue;
        const student = dataset.students.find((item) => clean(item.roll) === wantedRoll && (!wantedName || normalizeHeader(item.name) === wantedName));
        if (student) return { datasetId: dataset.key, fileName: dataset.fileName, className: displayClass(dataset), ...student };
      }
      return null;
    }
    throw new Error(`Consulta não suportada pela Impressão: ${action}`);
  }

  const PRINT_LAYOUT_VERSION = 3;
  const DEFAULT_LAYOUT = {
    globalX:0, globalY:0,
    nameX:114.2, nameY:6.0, nameW:70, nameSize:5,
    totalX:153.8, totalY:37.0, totalW:24, totalSize:20,
    correctX:128.8, incorrectX:147.4, blankX:166.0, countsY:60.0, countW:18, countSize:18
  };
  const DEFAULT_MAPPING = { classCol:0, rollCol:2, nameCol:3, totalCol:4, rankCol:6, correctCol:7, incorrectCol:8, blankCol:9, headerRow:1 };
  const EMPTY_STUDENT = { roll:'', name:'', classCode:'', total:'', rank:'', correct:'', incorrect:'', blank:'', sourceIndex:0 };
  const state = {
    datasets:[], datasetIndex:0, studentIndex:0, zoom:1, showGuide:true,
    order:'asc', decimals:'auto', separator:'dot', frontContentMode:'performance', frontContentExplicit:true, classStages:{}, layout:{...DEFAULT_LAYOUT},
    savedDatasetKey:'', savedRoll:'', preferredClassName:'', preferredStudentRoll:'', preferredStudentName:'', printing:false,
    lots:[], hiddenLotIds:[], activeLotId:'', comparisonMode:'trajectory', compareLotId:'',
    performancePreset:'school', performanceSections:[], performanceTarget:60
  };
  const POSITION_CONTROLS = {
    nameX:{range:'nameXRange',min:0,max:210}, nameY:{range:'nameYRange',min:0,max:297},
    totalX:{range:'totalXRange',min:0,max:210}, totalY:{range:'totalYRange',min:0,max:297},
    correctX:{range:'correctXRange',min:0,max:210}, incorrectX:{range:'incorrectXRange',min:0,max:210},
    blankX:{range:'blankXRange',min:0,max:210}, countsY:{range:'countsYRange',min:0,max:297}
  };
  const $ = id => printDocument.getElementById(id);
  const els = {
    status:$('statusPill'), cardTab:$('cardTab'), close:$('closeBtn'),
    guideToggle:$('guideToggle'), zoomOut:$('zoomOut'), zoomReset:$('zoomReset'), zoomIn:$('zoomIn'), previewScroll:$('previewScroll'), paperViewport:$('paperViewport'), paperShell:$('paperShell'), paperScale:$('paperScale'), previewSheet:$('previewSheet'), previewChip:$('previewChip'),
    datasetSelect:$('datasetSelect'), prevDataset:$('prevDataset'), nextDataset:$('nextDataset'),
    studentSelect:$('studentSelect'), prevStudent:$('prevStudent'), nextStudent:$('nextStudent'), studentCount:$('studentCount'), classSummary:$('classSummary'), rollSummary:$('rollSummary'), scoreSummary:$('scoreSummary'), studentMatchStatus:$('studentMatchStatus'),
    printStudent:$('printStudent'), printClass:$('printClass'), printQueue:$('printQueue'), frontContentButtons:$('frontContentButtons'),
    lotName:$('lotName'), lotDate:$('lotDate'), lotFiles:$('lotFiles'), lotUpload:$('lotUpload'), lotFileTitle:$('lotFileTitle'), lotFileHint:$('lotFileHint'), lotFileList:$('lotFileList'), lotFormHelp:$('lotFormHelp'), createLot:$('createLot'), lotStatus:$('lotStatus'), lotList:$('lotList'),
    activeLotButtons:$('activeLotButtons'), activeLotSelect:$('activeLotSelect'), comparisonModeToggle:$('comparisonModeToggle'), compareOneToOneField:$('compareOneToOneField'), compareLotButtons:$('compareLotButtons'), compareLotSelect:$('compareLotSelect'), comparisonHelp:$('comparisonHelp'), selectedResultStatus:$('selectedResultStatus'),
    excludedLayer:$('excludedLayer'), excludedTitle:$('excludedTitle'), excludedSubtitle:$('excludedSubtitle'), excludedClose:$('excludedClose'), excludedSummary:$('excludedSummary'), excludedFilters:$('excludedFilters'), excludedTable:$('excludedTable'), excludedTableBody:$('excludedTableBody'), excludedEmpty:$('excludedEmpty'),
    analysisSettings:$('analysisSettings'), performanceTarget:$('performanceTarget'), performancePresetToggle:$('performancePresetToggle'), performanceSectionTable:$('performanceSectionTable'), addPerformanceSection:$('addPerformanceSection'), resetPerformanceSections:$('resetPerformanceSections'),
    moreSettings:$('moreSettings'), stageMappingList:$('stageMappingList'), resetStageMappings:$('resetStageMappings'),
    globalX:$('globalX'), globalXValue:$('globalXValue'), globalY:$('globalY'), globalYValue:$('globalYValue'), nameX:$('nameX'), nameXRange:$('nameXRange'), nameY:$('nameY'), nameYRange:$('nameYRange'), totalX:$('totalX'), totalXRange:$('totalXRange'), totalY:$('totalY'), totalYRange:$('totalYRange'), correctX:$('correctX'), correctXRange:$('correctXRange'), incorrectX:$('incorrectX'), incorrectXRange:$('incorrectXRange'), blankX:$('blankX'), blankXRange:$('blankXRange'), countsY:$('countsY'), countsYRange:$('countsYRange'), nameSize:$('nameSize'), totalSize:$('totalSize'), countSize:$('countSize'), resetGeneralCalibration:$('resetGeneralCalibration'), resetIndividualPositions:$('resetIndividualPositions'), resetSettings:$('resetSettings'), toast:$('toast')
  };

  async function init(){
    if(!skipStoredState)restoreSettings();
    if(!state.performanceSections.length)state.performanceSections=clonePerformanceSections(PERFORMANCE_SCHOOL_SECTIONS);
    if(!skipStoredState)restoreSharedAnalysisConfig();
    cleanupObsoleteHistoryStorage();
    if(!state.frontContentExplicit)state.frontContentMode=readCardFrontContentMode();
    else try{globalThis.CardaoRespostaApp?.setFrontContentMode?.(state.frontContentMode,{silent:true,reason:'print-init-sync'});}catch(_){}
    bindEvents();
    updateLotFormState(); renderLots(); renderStageMappings(); renderPerformanceSections(); syncPerformanceAnalysisControls(); syncLayoutControls(); syncFrontContentControls(); renderPreview(); requestAnimationFrame(scalePreview);
    try{
      state.lots=(await lotDbGetAll()).filter(normalizeStoredLot);
      sortLots();
      normalizeHiddenLotIds();
    }catch(error){
      console.warn('Os lotes salvos não puderam ser recuperados.',error);
      showToast('Os lotes anteriores não puderam ser recuperados; novos lotes ainda funcionarão nesta sessão.');
    }
    const preferred=visibleLots().find(item=>item.id===state.activeLotId)||visibleLots()[0]||null;
    if(preferred)activateLot(preferred.id,{silent:true,preserveStudent:true});
    else clearActiveLot({silent:true});
    renderLotSelectionControls();renderLots();renderStageMappings();renderPreview();
  }

  function bindEvents(){
    els.cardTab.addEventListener('click',()=>globalThis.GSSFResponseTools?.selectTab?.('cartao-resposta'));
    els.close.addEventListener('click',()=>printHostPanel?.closest?.('#gssf-modal')?.querySelector?.('#gssf-omr-close')?.click?.());
    els.datasetSelect.addEventListener('change',()=>selectDataset(Number(els.datasetSelect.value)));
    els.prevDataset.addEventListener('click',()=>navigateDataset(-1)); els.nextDataset.addEventListener('click',()=>navigateDataset(1));
    els.studentSelect.addEventListener('change',()=>selectStudent(Number(els.studentSelect.value)));
    els.prevStudent.addEventListener('click',()=>navigateStudent(-1)); els.nextStudent.addEventListener('click',()=>navigateStudent(1));
    printDocument.querySelectorAll('#orderButtons [data-order]').forEach(b=>b.addEventListener('click',()=>{state.order=b.dataset.order;state.studentIndex=0;syncSegmented('orderButtons','order',state.order);populateStudents();saveSettings();}));
    printDocument.querySelectorAll('#frontContentButtons [data-front-content]').forEach(b=>b.addEventListener('click',()=>setPrintFrontContentMode(b.dataset.frontContent)));
    printDocument.querySelectorAll('#decimalButtons [data-decimals]').forEach(b=>b.addEventListener('click',()=>{state.decimals=b.dataset.decimals;syncSegmented('decimalButtons','decimals',state.decimals);renderPreview();saveSettings();}));
    printDocument.querySelectorAll('#separatorButtons [data-separator]').forEach(b=>b.addEventListener('click',()=>{state.separator=b.dataset.separator;syncSegmented('separatorButtons','separator',state.separator);renderPreview();saveSettings();}));
    els.guideToggle.addEventListener('click',()=>{state.showGuide=!state.showGuide;els.guideToggle.classList.toggle('active',state.showGuide);renderPreview();saveSettings();});
    els.zoomOut.addEventListener('click',()=>setZoom(state.zoom-.1)); els.zoomReset.addEventListener('click',()=>setZoom(1)); els.zoomIn.addEventListener('click',()=>setZoom(state.zoom+.1)); addRuntimeWindowListener('resize',()=>scalePreview());
    els.printStudent.addEventListener('click',()=>printStudents([currentStudent()],false)); els.printClass.addEventListener('click',()=>printStudents(orderedStudents(),false));
    if(els.lotName)els.lotName.addEventListener('input',updateLotFormState);
    if(els.lotDate)els.lotDate.addEventListener('change',updateLotFormState);
    if(els.lotFiles)els.lotFiles.addEventListener('change',updateLotFormState);
    if(els.createLot)els.createLot.addEventListener('click',createLotFromSelection);
    if(els.activeLotButtons)els.activeLotButtons.addEventListener('click',event=>{const button=event.target.closest('[data-active-lot]');if(button)activateLot(button.dataset.activeLot);});
    if(els.compareLotButtons)els.compareLotButtons.addEventListener('click',event=>{const button=event.target.closest('[data-compare-lot]');if(button)setCompareLot(button.dataset.compareLot);});
    printDocument.querySelectorAll('[data-comparison-mode]').forEach(button=>button.addEventListener('click',()=>setComparisonMode(button.dataset.comparisonMode)));
    if(els.performanceTarget)els.performanceTarget.addEventListener('change',()=>{state.performanceTarget=clamp(Number(els.performanceTarget.value)||0,0,100);syncPerformanceAnalysisControls();persistSharedAnalysisConfig();renderPreview();saveSettings();publishSharedPrintSnapshot('analysis-target-changed');});
    if(els.performancePresetToggle)els.performancePresetToggle.addEventListener('click',event=>{const button=event.target.closest('[data-performance-preset]');if(!button)return;state.performancePreset=button.dataset.performancePreset==='generic'?'generic':'school';state.performanceSections=clonePerformanceSections(state.performancePreset==='generic'?PERFORMANCE_GENERIC_SECTIONS:PERFORMANCE_SCHOOL_SECTIONS);renderPerformanceSections();syncPerformanceAnalysisControls();persistSharedAnalysisConfig();renderPreview();saveSettings();publishSharedPrintSnapshot('analysis-preset-changed');});
    if(els.addPerformanceSection)els.addPerformanceSection.addEventListener('click',()=>{const max=Math.max(0,...state.performanceSections.map(section=>Number(section.end)||0));state.performanceSections.push({id:`p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,name:`Seção ${state.performanceSections.length+1}`,area:`Grupo ${state.performanceSections.length+1}`,start:max+1,end:max+1,enabled:true});renderPerformanceSections();persistSharedAnalysisConfig();renderPreview();saveSettings();});
    if(els.resetPerformanceSections)els.resetPerformanceSections.addEventListener('click',()=>{state.performanceSections=clonePerformanceSections(state.performancePreset==='generic'?PERFORMANCE_GENERIC_SECTIONS:PERFORMANCE_SCHOOL_SECTIONS);renderPerformanceSections();persistSharedAnalysisConfig();renderPreview();saveSettings();showToast('Seções e áreas restauradas.');});
    if(els.excludedClose)els.excludedClose.addEventListener('click',closeExcludedStudents);
    if(els.excludedLayer)els.excludedLayer.addEventListener('click',event=>{if(event.target===els.excludedLayer)closeExcludedStudents();});
    if(els.excludedFilters)els.excludedFilters.addEventListener('click',event=>{const button=event.target.closest('[data-excluded-filter]');if(!button)return;renderExcludedStudents(button.dataset.excludedFilter);});
    if(els.excludedTableBody)els.excludedTableBody.addEventListener('click',event=>{
      const saveButton=event.target.closest('[data-save-manual-match]');
      if(saveButton){saveManualMatchFromRow(saveButton.dataset.saveManualMatch,saveButton.dataset.targetLot);return;}
      const ignoreButton=event.target.closest('[data-ignore-manual-match]');
      if(ignoreButton){ignoreManualMatch(ignoreButton.dataset.ignoreManualMatch,ignoreButton.dataset.targetLot);return;}
      const removeButton=event.target.closest('[data-remove-manual-match]');
      if(removeButton){removeManualMatch(removeButton.dataset.removeManualMatch,removeButton.dataset.targetLot);return;}
    });
    if(els.stageMappingList)els.stageMappingList.addEventListener('change',event=>{
      const input=event.target.closest('[data-stage-class]');
      if(!input)return;
      const key=input.dataset.stageClass,value=clean(input.value);
      if(value)state.classStages[key]=value;else delete state.classStages[key];
      renderLots();renderPreview();saveSettings();
    });
    if(els.resetStageMappings)els.resetStageMappings.addEventListener('click',()=>{state.classStages={};renderStageMappings();persistSharedAnalysisConfig();renderLots();renderPreview();saveSettings();showToast('Etapas automáticas restauradas.');});
    printDocument.addEventListener('keydown',event=>{if(event.key==='Escape'&&els.excludedLayer&&!els.excludedLayer.hidden)closeExcludedStudents();});
    [['globalX',els.globalX],['globalY',els.globalY]].forEach(([key,el])=>el.addEventListener('input',()=>{state.layout[key]=Number(el.value);syncRangeValues();renderPreview();saveSettings();}));
    Object.entries(POSITION_CONTROLS).forEach(([key,config])=>{
      const numberInput=els[key], rangeInput=els[config.range];
      const applyPosition=(source)=>{
        const raw=Number(source.value); if(!Number.isFinite(raw))return;
        const value=Math.min(config.max,Math.max(config.min,raw));
        state.layout[key]=value; numberInput.value=String(value); rangeInput.value=String(value);
        renderPreview(); saveSettings();
      };
      rangeInput.addEventListener('input',()=>applyPosition(rangeInput));
      numberInput.addEventListener('input',()=>applyPosition(numberInput));
    });
    ['nameSize','totalSize','countSize'].forEach(key=>els[key].addEventListener('input',()=>{const v=Number(els[key].value);if(Number.isFinite(v)){state.layout[key]=v;renderPreview();saveSettings();}}));
    if(els.resetGeneralCalibration)els.resetGeneralCalibration.addEventListener('click',resetGeneralCalibration);
    if(els.resetIndividualPositions)els.resetIndividualPositions.addEventListener('click',resetIndividualPositions);
    els.resetSettings.addEventListener('click',resetSettings);
  }