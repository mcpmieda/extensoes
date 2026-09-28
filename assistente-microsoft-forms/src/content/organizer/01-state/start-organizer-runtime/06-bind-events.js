

function bindEvents(){
  const handleRealtimePreview=()=>{ renderPreview({preserveCenter:true}); runValidations(false); scheduleSaveCurrentState(); };
  const rebuildFromOverrides=async(showToastMessage=false)=>{
    state.columnOverrides={headerRow:el.headerRowInput?.value||'', turma:el.turmaColInput?.value||'', disciplina:el.disciplinaColInput?.value||'', conteudo:el.conteudoColInput?.value||'', professor:el.professorColInput?.value||''};
    if(!state.rawRows || !state.detectedColumns){ scheduleSaveCurrentState(); return; }
    const overrides=effectiveColumnOverrides();
    if(!overrides.turma || !overrides.disciplina || !overrides.conteudo){
      populateColumnMappingControls();
      runValidations(false);
      if(showToastMessage) toast('Selecione as colunas de turma, disciplina e conteúdo.');
      return;
    }
    try{
      const payload=rowsToRecords(
        state.rawRows,
        {score:state.detectedColumns.score??-1, headerRow:state.detectedColumns.headerRow?state.detectedColumns.headerRow-1:0, turma:state.detectedColumns.turma?state.detectedColumns.turma-1:null, disciplina:state.detectedColumns.disciplina?state.detectedColumns.disciplina-1:null, conteudo:state.detectedColumns.conteudo?state.detectedColumns.conteudo-1:null, professor:state.detectedColumns.professor?state.detectedColumns.professor-1:null},
        state.fileName,
        state.sheetName,
        overrides
      );
      payload.fileMeta=state.fileMeta;
      await applyPayload(payload);
      if(showToastMessage) toast('Colunas reaplicadas ao arquivo atual.');
      scheduleSaveCurrentState();
    }catch(err){
      console.error(err);
      runValidations(false);
      toast(err.message||'Não foi possível reaplicar as colunas.');
    }
  };
  const saveGroups=()=>{
    state.customStageGroups={sixth:el.group6Input?.value||'', seventh:el.group7Input?.value||'', eighth:el.group8Input?.value||'', ninth:el.group9Input?.value||'', extra:el.groupExtraInput?.value||''};
    renderTurmas();
    scheduleSaveCurrentState();
  };

  el.fileInput.addEventListener('change',e=>handleFile(e.target.files[0]));
  el.assessmentInput.addEventListener('input',()=>{ state.assessment=el.assessmentInput.value; handleRealtimePreview(); });
  if(el.fullTitleInput) el.fullTitleInput.addEventListener('input',()=>{ state.fullTitle=el.fullTitleInput.value; handleRealtimePreview(); });
  el.dateInput.addEventListener('input',()=>{ state.date=el.dateInput.value; handleRealtimePreview(); });
  el.showDateInput.addEventListener('change',()=>{ state.showDate=el.showDateInput.checked; handleRealtimePreview(); });
  el.headerInput.addEventListener('change',async e=>{
    const file=e.target.files && e.target.files[0]; if(!file) return;
    try{ state.assets.header=await prepareHeaderDataUrl(file); state.assets.customHeader=state.assets.header; state._assetImages={}; await saveSettings(); renderPreview({preserveCenter:true}); el.headerInput.value=''; toast('Cabeçalho personalizado salvo neste navegador.'); }
    catch(err){ toast(err.message||'Erro ao importar cabeçalho.'); }
  });
  el.resetHeaderBtn.addEventListener('click',async()=>{
    state.assets.header=await assetToDataUrl('cabecalho.jpg'); delete state.assets.customHeader; state._assetImages={}; await saveSettings(); renderPreview({preserveCenter:true}); toast('Cabeçalho padrão restaurado.');
  });
  el.selectAllBtn.addEventListener('click',()=>{ state.selected=new Set(state.turmas); renderTurmas(); runValidations(false); scheduleSaveCurrentState(); });
  el.clearAllBtn.addEventListener('click',()=>{ state.selected=new Set(); renderTurmas(); runValidations(false); scheduleSaveCurrentState(); });
  if(el.syncEquivalentBtn) el.syncEquivalentBtn.addEventListener('click',async()=>{
    state.syncEquivalentContents=!state.syncEquivalentContents;
    updateSyncEquivalentControl();
    scheduleSaveCurrentState();
    toast(state.syncEquivalentContents
      ? 'Sincronização ativada: conteúdos equivalentes acompanharão as alterações.'
      : 'Sincronização desativada: cada turma será editada separadamente.');
  });
  el.zoomOutBtn.addEventListener('click',()=>setZoom(state.zoom-.1));
  el.zoomResetBtn.addEventListener('click',()=>setZoom(1));
  el.zoomInBtn.addEventListener('click',()=>setZoom(state.zoom+.1));
  el.downloadPdfBtn.addEventListener('click',()=>downloadSelected('pdf'));
  el.downloadPngBtn.addEventListener('click',()=>downloadSelected('png'));
  el.downloadCurrentPdfBtn.addEventListener('click',()=>downloadCurrent('pdf'));
  el.downloadCurrentPngBtn.addEventListener('click',()=>downloadCurrent('png'));
  el.resetBtn.addEventListener('click',resetAll);
  el.clearStorageBtn.addEventListener('click',()=>clearEverything().catch(err=>{ console.error(err); toast('Não foi possível limpar todos os dados.'); }));
  el.restoreSavedBtn.addEventListener('click',()=>applySavedSnapshot(state.pendingSavedSnapshot));
  el.ignoreSavedBtn.addEventListener('click',()=>{ hideRestoreBox(); toast('Salvamento ignorado nesta abertura.'); });
  el.clearSavedThisBtn.addEventListener('click',async()=>{ if(!state.currentSignature) return; const keys=[STORAGE_PREFIX+'doc:'+state.currentSignature]; if(state.legacySignature && state.legacySignature!==state.currentSignature) keys.push(STORAGE_PREFIX+'doc:'+state.legacySignature); await storageRemove(keys); hideRestoreBox(); state.pendingSavedSnapshot=null; toast('Salvamento desta planilha apagado.'); });
  ['headerRowInput','turmaColInput','disciplinaColInput','conteudoColInput','professorColInput'].forEach(id=>{ if(el[id]) el[id].addEventListener('change',()=>rebuildFromOverrides(true)); });
  ['group6Input','group7Input','group8Input','group9Input','groupExtraInput'].forEach(id=>{ if(el[id]) el[id].addEventListener('input',saveGroups); });
  window.addEventListener('resize',()=>{
    const frame=el.reportPreview && el.reportPreview.querySelector('.report-frame');
    const page=frame && frame.querySelector('.report-page');
    if(frame && page) scalePreviewFrame(frame,page,{preserveCenter:true});
  });
}

async function init(){
  initEls(); updateZoomControls(); bindEvents();
  await loadAssets();
  await loadSettings();
  resetAll();
  updateSyncEquivalentControl();
  const params=new URLSearchParams(location.search);
  if(params.has('demo') && DEMO_PAYLOAD){
    state.assessment='SIMULADO DO I TRIMESTRE'; state.date='2026-06-23';
    await applyPayload(DEMO_PAYLOAD);
    if(params.get('turma') && state.turmas.includes(params.get('turma'))) state.previewTurma=params.get('turma');
    renderAll(); runValidations(false);
    if(params.get('snapshot')==='report') document.body.classList.add('preview-only');
  }
}
await init();

    const api=Object.freeze({
      activate:()=>{const frame=el.reportPreview?.querySelector?.('.report-frame');const page=frame?.querySelector?.('.report-page');if(frame&&page)scalePreviewFrame(frame,page,{preserveCenter:true});},
      resize:()=>{const frame=el.reportPreview?.querySelector?.('.report-frame');const page=frame?.querySelector?.('.report-page');if(frame&&page)scalePreviewFrame(frame,page,{preserveCenter:true});},
      flushBackupState:async()=>{if(state.saveTimer){clearTimeout(state.saveTimer);state.saveTimer=null;}await saveCurrentStateNow();await saveSettings();await globalThis.GSSF_STORAGE?.flush?.();},
      reloadBackupState:async()=>{await loadSettings();if(state.currentSignature)await checkSavedForCurrentSignature();renderAll();},
      clearRuntime:async()=>{await storageClearAppData();resetDocumentState({preserveHeader:false});state.assets.header=await assetToDataUrl('cabecalho.jpg');state.assets.logo=await assetToDataUrl('logo.png');state._assetImages={};renderAll();updateSyncEquivalentControl();},
      getSnapshot:()=>organizerSnapshot(state),
      destroy:async()=>{clearTimeout(state.saveTimer);clearTimeout(scheduleRealtimeValidation.timer);clearTimeout(toast._t);listenerRegistry.splice(0).forEach(([target,type,listener,options])=>target.removeEventListener(type,listener,options));}
    });
    return api;
  