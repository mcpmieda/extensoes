

  function detectHeaderAndMapping(rows){
    const defs={
      classCol:['exam','class','turma'],rollCol:['roll no','roll','student no','numero','número','nº'],nameCol:['name','student name','nome'],totalCol:['total marks','total score','score','nota','total'],rankCol:['rank','ranking'],correctCol:['correct answers','correct','acertos'],incorrectCol:['incorrect answers','incorrect','erros'],blankCol:['not attempted','blank','unattempted','em branco','branco']
    };
    let best={score:-1,row:0,map:{}};
    rows.slice(0,12).forEach((row,rowIndex)=>{
      const normalized=row.map(v=>normalizeHeader(v)); const map={};let score=0;
      Object.entries(defs).forEach(([key,syns])=>{const idx=normalized.findIndex(h=>syns.some(s=>h===s||h.includes(s)));if(idx>=0){map[key]=idx;score++;}});
      if(score>best.score)best={score,row:rowIndex,map};
    });
    return {headerRow:best.score>=3?best.row+1:1,mapping:best.score>=3?best.map:{}};
  }

  function populateDatasets(){
    els.datasetSelect.innerHTML='';
    state.datasets.forEach((dataset,index)=>{const option=printDocument.createElement('option');option.value=String(index);option.textContent=`${displayClass(dataset)} — ${dataset.students.length} aluno(s)`;els.datasetSelect.appendChild(option);});
    const has=state.datasets.length>0;
    els.datasetSelect.disabled=!has;els.prevDataset.disabled=!has;els.nextDataset.disabled=!has;
    if(has)els.datasetSelect.value=String(state.datasetIndex);else els.datasetSelect.innerHTML='<option>Selecione um lote primeiro</option>';
  }

  function preferredStudentIndex(students){
    const name=normalizeName(state.preferredStudentName),roll=clean(state.preferredStudentRoll);
    if(!name&&!roll)return -1;
    let index=students.findIndex(student=>(!name||normalizeName(student.name)===name)&&(!roll||clean(student.roll)===roll));
    if(index<0&&name)index=students.findIndex(student=>normalizeName(student.name)===name);
    if(index<0&&roll)index=students.findIndex(student=>clean(student.roll)===roll);
    return index;
  }
  function rememberCurrentPrintSelection(){
    const dataset=currentDataset(),student=currentStudent();
    if(dataset)state.preferredClassName=displayClass(dataset);
    if(student){state.preferredStudentRoll=clean(student.roll);state.preferredStudentName=clean(student.name);}
  }
  function populateStudents(options={}){
    const students=orderedStudents();els.studentSelect.innerHTML='';
    students.forEach((student,index)=>{const option=printDocument.createElement('option');option.value=String(index);option.textContent=`${padRoll(student.roll)} — ${student.name||'SEM NOME'}`;els.studentSelect.appendChild(option);});
    const has=students.length>0;
    if(has&&options.preserveIdentity!==false){const preferredIndex=preferredStudentIndex(students);if(preferredIndex>=0)state.studentIndex=preferredIndex;}
    if(has&&state.savedRoll&&datasetKey(currentDataset())===state.savedDatasetKey){const savedIndex=students.findIndex(student=>clean(student.roll)===clean(state.savedRoll));if(savedIndex>=0)state.studentIndex=savedIndex;state.savedRoll='';}
    state.studentIndex=Math.min(state.studentIndex,Math.max(0,students.length-1));
    els.studentSelect.disabled=!has;els.prevStudent.disabled=!has;els.nextStudent.disabled=!has;
    if(has)els.studentSelect.value=String(state.studentIndex);else els.studentSelect.innerHTML='<option>Nenhum aluno disponível</option>';
    [els.printStudent,els.printClass].forEach(button=>button.disabled=!has);
    updateSummary();renderPreview();
  }

  function orderedStudents(){const dataset=currentDataset();if(!dataset)return[];const students=[...dataset.students];if(state.order==='asc')students.sort((a,b)=>numericRoll(a.roll)-numericRoll(b.roll)||a.name.localeCompare(b.name));else if(state.order==='desc')students.sort((a,b)=>numericRoll(b.roll)-numericRoll(a.roll)||a.name.localeCompare(b.name));return students;}
  function currentDataset(){return state.datasets[state.datasetIndex]||null}
  function currentStudent(){return orderedStudents()[state.studentIndex]||null}
  function selectDataset(index){if(!state.datasets.length)return;state.datasetIndex=wrap(index,state.datasets.length);state.studentIndex=0;els.datasetSelect.value=String(state.datasetIndex);populateStudents({preserveIdentity:true});rememberCurrentPrintSelection();saveSettings();publishSharedPrintContext('dataset-selected');}
  function navigateDataset(delta){selectDataset(state.datasetIndex+delta)}
  function selectStudent(index){const students=orderedStudents();if(!students.length)return;state.studentIndex=wrap(index,students.length);els.studentSelect.value=String(state.studentIndex);rememberCurrentPrintSelection();updateSummary();renderPreview();saveSettings();publishSharedPrintContext('student-selected');}
  function navigateStudent(delta){selectStudent(state.studentIndex+delta)}

  function updateSummary(){const d=currentDataset(),s=currentStudent();els.studentCount.textContent=d?d.students.length:'0';els.classSummary.textContent=d?displayClass(d):'—';els.rollSummary.textContent=s?padRoll(s.roll):'—';els.scoreSummary.textContent=s?formatScore(s.total):'—';els.previewChip.textContent=s?`Nº ${padRoll(s.roll)}`:'PRÉVIA';els.previewChip.classList.toggle('hidden',getFrontContentMode()==='performance');}

  function getCardSnapshot(){
    try {
      const direct=globalThis.CardaoRespostaApp?.getSharedSnapshot?.();
      if(direct&&typeof direct==='object')return direct;
      return globalThis.GSSFSharedBridge?.getSourceSnapshot?.('card')||null;
    }catch(_){return null;}
  }
  function readCardFrontContentMode(){
    try {
      const direct=globalThis.CardaoRespostaApp?.getState?.().frontContentMode;
      if(direct==='performance'||direct==='instructions')return direct;
    }catch(_){}
    return getCardSnapshot()?.settings?.frontContentMode==='performance'?'performance':'instructions';
  }
  function getFrontContentMode(){return state.frontContentMode==='performance'?'performance':'instructions';}
  function syncFrontContentControls(){
    printDocument.querySelectorAll('#frontContentButtons [data-front-content]').forEach(button=>button.classList.toggle('active',button.dataset.frontContent===getFrontContentMode()));
  }
  function setPrintFrontContentMode(mode,options={}){
    state.frontContentMode=mode==='performance'?'performance':'instructions';
    state.frontContentExplicit=true;
    syncFrontContentControls();
    try{globalThis.CardaoRespostaApp?.setFrontContentMode?.(state.frontContentMode,{silent:true,reason:'print-front-content-mode'});}catch(_){}
    renderPreview();saveSettings();publishSharedPrintSnapshot('front-content-mode');
    if(!options.silent)showToast(state.frontContentMode==='performance'?'A área das instruções foi reservada para a devolutiva pedagógica.':'As instruções voltarão a aparecer na frente do cartão.');
    return state.frontContentMode;
  }
  let lotDbMigrationPromise = null;
  function ensureLotDbMigrated(){
    if(!lotDbMigrationPromise){
      lotDbMigrationPromise=gssfMigrateLegacyPedagogicalDb(GSSF_PEDAGOGICAL_NAMESPACES.printingLots,LOT_DB_NAME,LOT_DB_STORE)
        .catch(error=>{lotDbMigrationPromise=null;throw error;});
    }
    return lotDbMigrationPromise;
  }
  async function lotDbGetAll(){
    await ensureLotDbMigrated();
    return gssfPedagogicalDataGetAll(GSSF_PEDAGOGICAL_NAMESPACES.printingLots);
  }
  function lotDbPut(lot){return gssfPedagogicalDataPut(GSSF_PEDAGOGICAL_NAMESPACES.printingLots,lot);}
  function lotDbDelete(id){return gssfPedagogicalDataDelete(GSSF_PEDAGOGICAL_NAMESPACES.printingLots,id);}
  function cleanupObsoleteHistoryStorage(){
    try{GSSF_STORAGE.removeItem('gssf_impressao_historico_v1')}catch(_){}
  }
  function visibleLots(){const hidden=new Set(state.hiddenLotIds||[]);const visible=state.lots.filter(item=>!hidden.has(item.id));return visible.length?visible:state.lots.slice();}
  function isLotVisible(lotId){return !(state.hiddenLotIds||[]).includes(lotId);}
  function normalizeHiddenLotIds(){const existing=new Set(state.lots.map(item=>item.id));state.hiddenLotIds=(state.hiddenLotIds||[]).filter(id=>existing.has(id));if(state.lots.length&&visibleLots().length===0)state.hiddenLotIds=[];}
  function eyeIconHtml(isVisible){return isVisible?'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12 18.7 18.5 12 18.5 1.5 12 1.5 12Z"></path><circle cx="12" cy="12" r="3.2"></circle></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"></path><path d="M10.6 5.3A10.8 10.8 0 0 1 12 5.2c6.7 0 10.5 6.5 10.5 6.5a18 18 0 0 1-4.1 4.7"></path><path d="M6.2 6.2A18.6 18.6 0 0 0 1.5 12s3.8 6.5 10.5 6.5c1.9 0 3.6-.5 5-1.2"></path><path d="M9.9 9.9a3.2 3.2 0 0 0 4.2 4.2"></path></svg>'; }
  function selectedLot(){return visibleLots().find(item=>item.id===state.activeLotId)||null;}
  function datasetFromLotClass(lot,group,index){
    const students=(group.students||[]).map((student,studentIndex)=>({...student,sourceIndex:Number.isFinite(Number(student.sourceIndex))?Number(student.sourceIndex):studentIndex,classCode:group.name,className:group.name}));
    return{key:`${lot.id}|${normalizeClass(group.name)}|${index}`,sourceLotId:lot.id,fileName:(group.files||[]).join(' · ')||lot.name,classDisplay:group.name,classCode:group.name,customClass:'',students,questionCount:Math.max(Number(group.questionCount)||0,...students.map(student=>Number(student.questionCount)||0)),sourceOrder:index};
  }
  function datasetsForLotAudit(lot){return lot?(lot.classes||[]).map((group,index)=>datasetFromLotClass(lot,group,index)):[];}
  function conferenceReferenceLot(){return visibleLots().slice().sort(compareLotsByDate).at(-1)||null;}
  function conferenceReferenceDatasets(){return datasetsForLotAudit(conferenceReferenceLot());}
  function conferenceHistoricalLots(reference=conferenceReferenceLot()){if(!reference)return[];return visibleLots().filter(lot=>lot.id!==reference.id&&lotTimestamp(lot)<lotTimestamp(reference)).sort(compareLotsByDate).reverse();}
  function historyLotsForSelection(){
    const active=selectedLot();if(!active)return[];
    const available=visibleLots();
    if(state.comparisonMode==='one_to_one')return available.filter(lot=>lot.id===state.compareLotId&&lot.id!==active.id);
    return available.filter(lot=>lot.id!==active.id&&lotTimestamp(lot)<lotTimestamp(active)).sort(compareLotsByDate);
  }
  function rebuildDatasetsFromSelectedLot(options={}){
    const lot=selectedLot();
    state.datasets=lot?(lot.classes||[]).map((group,index)=>datasetFromLotClass(lot,group,index)):[];
    const preferredClass=normalizeClass(state.preferredClassName);
    const preferredIndex=options.preserveStudent!==false&&preferredClass?state.datasets.findIndex(dataset=>normalizeClass(displayClass(dataset))===preferredClass):-1;
    const savedIndex=options.preserveStudent!==false?state.datasets.findIndex(dataset=>dataset.key===state.savedDatasetKey):-1;
    state.datasetIndex=preferredIndex>=0?preferredIndex:savedIndex>=0?savedIndex:0;state.studentIndex=0;
    populateDatasets();populateStudents({preserveIdentity:options.preserveStudent!==false});renderStageMappings();
  }
  function clearActiveLot(options={}){
    state.activeLotId='';state.datasets=[];state.datasetIndex=0;state.studentIndex=0;if(!state.lots.length){state.preferredClassName='';state.preferredStudentRoll='';state.preferredStudentName='';}
    populateDatasets();populateStudents();renderLotSelectionControls();renderLots();
    if(!options.silent){showToast('Nenhum lote está selecionado para impressão.');saveSettings();publishSharedPrintSnapshot('lot-selection-cleared');}
  }
  function activateLot(id,options={}){
    normalizeHiddenLotIds();
    const lot=visibleLots().find(item=>item.id===id)||visibleLots()[0]||null;if(!lot)return clearActiveLot(options);
    state.activeLotId=lot.id;
    const previousVisible=visibleLots().filter(item=>item.id!==lot.id&&lotTimestamp(item)<lotTimestamp(lot)).sort(compareLotsByDate);
    const alternateVisible=visibleLots().filter(item=>item.id!==lot.id);
    if(state.compareLotId===lot.id||!alternateVisible.some(item=>item.id===state.compareLotId))state.compareLotId=previousVisible.at(-1)?.id||alternateVisible[0]?.id||'';
    rebuildDatasetsFromSelectedLot({...options,preserveStudent:true});renderLotSelectionControls();renderLots();renderPreview();saveSettings();publishSharedPrintSnapshot('lot-selected');
    els.status.textContent=`${lot.name} · ${lot.classes.length} turma(s) selecionada(s)`;
    if(!options.silent)showToast(`“${lot.name}” foi selecionado para impressão.`);
  }
  function setComparisonMode(mode){
    state.comparisonMode=mode==='one_to_one'?'one_to_one':'trajectory';
    renderLotSelectionControls();renderLots();renderPreview();saveSettings();
  }
  function setCompareLot(id){
    const active=selectedLot(),lot=visibleLots().find(item=>item.id===id&&item.id!==active?.id);if(!lot)return;
    state.compareLotId=lot.id;renderLotSelectionControls();renderLots();renderPreview();saveSettings();
  }
  function renderLotSelectionControls(){
    normalizeHiddenLotIds();
    const visibleOrdered=visibleLots().slice().sort(compareLotsByDate).reverse(),active=selectedLot(),latestId=visibleLots().slice().sort(compareLotsByDate).at(-1)?.id||'';
    if(els.activeLotButtons)els.activeLotButtons.innerHTML=visibleOrdered.length?visibleOrdered.map(lot=>`<button type="button" class="choice-btn ${lot.id===active?.id?'active':''}" data-active-lot="${escapeAttr(lot.id)}">${escapeHtml(lot.name)}<small>${escapeHtml(formatDateLabel(lot.date))}${lot.id===latestId?' · mais recente':''}</small></button>`).join(''):'<span class="lot-empty">Cadastre um lote na Etapa 1.</span>';
    if(els.activeLotSelect){els.activeLotSelect.innerHTML=visibleOrdered.map(lot=>`<option value="${escapeAttr(lot.id)}">${escapeHtml(lot.name)}</option>`).join('');els.activeLotSelect.value=active?.id||'';}
    printDocument.querySelectorAll('[data-comparison-mode]').forEach(button=>button.classList.toggle('active',button.dataset.comparisonMode===state.comparisonMode));
    const oneToOne=state.comparisonMode==='one_to_one';if(els.compareOneToOneField)els.compareOneToOneField.hidden=!oneToOne;
    const comparisonCandidates=visibleOrdered.filter(lot=>lot.id!==active?.id);
    if(els.compareLotButtons)els.compareLotButtons.innerHTML=comparisonCandidates.length?comparisonCandidates.map(lot=>`<button type="button" class="choice-btn ${lot.id===state.compareLotId?'active':''}" data-compare-lot="${escapeAttr(lot.id)}">${escapeHtml(lot.name)}<small>${escapeHtml(formatDateLabel(lot.date))}</small></button>`).join(''):'<span class="lot-empty">Cadastre outro lote visível para comparar.</span>';
    if(els.compareLotSelect){els.compareLotSelect.innerHTML=comparisonCandidates.map(lot=>`<option value="${escapeAttr(lot.id)}">${escapeHtml(lot.name)}</option>`).join('');els.compareLotSelect.value=comparisonCandidates.some(lot=>lot.id===state.compareLotId)?state.compareLotId:'';}
    if(els.comparisonHelp){els.comparisonHelp.hidden=!oneToOne;if(oneToOne)els.comparisonHelp.innerHTML='<strong>Comparação 1:1:</strong> usa somente a avaliação visível escolhida acima como referência histórica.';}
    if(els.selectedResultStatus){const visibleCount=visibleOrdered.length;els.selectedResultStatus.className=`selected-result-status ${active?'ready':'empty'}`;els.selectedResultStatus.innerHTML=active?`<strong>${escapeHtml(active.name)} selecionado para impressão</strong><span>${escapeHtml(formatDateLabel(active.date))} · ${active.classes.length} turma(s) · ${active.students.length} aluno(s) · ${visibleCount} lote(s) visível(is).</span>`:'<strong>Nenhum resultado selecionado</strong><span>Cadastre lotes na Etapa 1 e mantenha pelo menos um lote visível.</span>';}
  }