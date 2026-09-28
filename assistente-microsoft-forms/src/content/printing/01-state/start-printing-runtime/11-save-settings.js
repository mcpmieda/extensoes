
  function saveSettings(){clearTimeout(saveSettings.t);saveSettings.t=setTimeout(persistSettingsNow,120)}
  function restoreSettings(){try{const raw=GSSF_STORAGE.getItem(STORAGE_KEY);if(!raw)return;const p=JSON.parse(raw);state.zoom=clamp(Number(p.zoom)||1,.5,1.8);state.showGuide=p.showGuide!==false;state.order=['asc','desc','file'].includes(p.order)?p.order:'asc';state.decimals=['auto','1','2'].includes(String(p.decimals))?String(p.decimals):'auto';state.separator=p.separator==='comma'?'comma':'dot';if(p.frontContentMode==='performance'||p.frontContentMode==='instructions'){state.frontContentMode=p.frontContentMode;state.frontContentExplicit=true;}state.classStages=p.classStages&&typeof p.classStages==='object'?p.classStages:{};state.hiddenLotIds=Array.isArray(p.hiddenLotIds)?p.hiddenLotIds.map(String):[];const savedLayout=p.layout&&typeof p.layout==='object'?p.layout:{};const savedLayoutVersion=Number(p.layoutVersion);state.layout={...DEFAULT_LAYOUT,...savedLayout};if(savedLayoutVersion===2){state.layout={...state.layout,nameX:DEFAULT_LAYOUT.nameX,nameY:DEFAULT_LAYOUT.nameY,nameW:DEFAULT_LAYOUT.nameW,nameSize:DEFAULT_LAYOUT.nameSize};}else if(savedLayoutVersion!==PRINT_LAYOUT_VERSION){state.layout={...DEFAULT_LAYOUT,globalX:Number.isFinite(Number(savedLayout.globalX))?Number(savedLayout.globalX):0,globalY:Number.isFinite(Number(savedLayout.globalY))?Number(savedLayout.globalY):0,nameSize:DEFAULT_LAYOUT.nameSize,totalSize:Number.isFinite(Number(savedLayout.totalSize))?Number(savedLayout.totalSize):DEFAULT_LAYOUT.totalSize,countSize:Number.isFinite(Number(savedLayout.countSize))?Number(savedLayout.countSize):DEFAULT_LAYOUT.countSize};}state.activeLotId=p.activeLotId||'';state.comparisonMode=p.comparisonMode==='one_to_one'?'one_to_one':'trajectory';state.compareLotId=p.compareLotId||'';state.performancePreset=p.performancePreset==='generic'?'generic':'school';state.performanceSections=Array.isArray(p.performanceSections)?clonePerformanceSections(p.performanceSections):[];state.performanceTarget=normalizePerformanceTarget(p.performanceTarget);state.savedDatasetKey=p.savedDatasetKey||'';state.savedRoll=p.savedRoll||'';state.preferredClassName=p.preferredClassName||'';state.preferredStudentRoll=p.preferredStudentRoll||p.savedRoll||'';state.preferredStudentName=p.preferredStudentName||'';}catch(e){console.warn(e)}}

  function displayClass(d){return d?(d.classDisplay||d.classCode||d.fileName):'—'}
  function datasetKey(d){return d?.key||''}
  function formatScore(value){const text=clean(value);if(text==='')return'';const normalized=text.replace(',','.');const num=Number(normalized);let out=text;if(Number.isFinite(num)){if(state.decimals==='1')out=num.toFixed(1);else if(state.decimals==='2')out=num.toFixed(2);else out=String(num);}if(state.separator==='comma')out=out.replace('.',',');else out=out.replace(',','.');return out}
  function normalizeClass(value){const t=clean(value).toUpperCase().replace(/\s+/g,' ').trim();let m=t.match(/^(\d{1,2})\s*[º°O]?\s*(?:ANO\s*)?([A-Z])$/i);if(!m)m=t.match(/^(\d{1,2})\s*[-_. ]\s*([A-Z])$/i);return m?`${Number(m[1])}º ANO ${m[2].toUpperCase()}`:t}
  function normalizeHeader(v){return clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()}
  function clean(v){return v==null?'':String(v).trim()}
  function numericRoll(v){const n=Number(String(v).replace(/\D+/g,''));return Number.isFinite(n)?n:999999}
  function padRoll(v){const t=clean(v);const n=numericRoll(t);return n!==999999?String(n).padStart(2,'0'):t}
  function wrap(i,len){return((i%len)+len)%len}
  function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
  function numLabel(v){return Number(v)%1===0?String(Number(v)):Number(v).toFixed(1)}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function escapeAttr(v){return escapeHtml(v)}
  function showToast(msg){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>els.toast.classList.remove('show'),2600)}

  globalThis.ImpressaoPreviewApp=Object.freeze({resetPreviewPosition:()=>scalePreview({resetPosition:true}),scalePreview:()=>scalePreview(),getSelectedLot:()=>selectedLot(),selectLot:(lotId)=>activateLot(lotId,{silent:true}),getComparisonLots:()=>historyLotsForSelection()});

  globalThis.ImpressaoCorrespondenciaSegura=Object.freeze({
    matchStudentInLot:(student,dataset,lot)=>matchStudentInLot(student,dataset,lot),
    auditLotIdentities,
    getClassStage:(className)=>getClassStage(className),
    getIdentityKey:(student,dataset)=>currentIdentityKey(dataset,student),
    getCandidateSuggestions:(student,dataset,lot)=>candidateRowsForStudent(student,dataset,createLotMatchContext(lot)).map(row=>({studentId:row.student.id,className:row.groupName,roll:row.student.roll,name:row.student.name,score:row.score,sameStage:row.sameStage})),
    getStudentHistoryAudit:()=>{const dataset=currentDataset(),student=currentStudent();return dataset&&student?getStudentHistoryAudit(student,dataset):null;},
    getExcludedForLot:(lotId)=>{const lot=state.lots.find(item=>item.id===lotId);return lot?reviewableMatchDetails(lot).map(item=>({className:item.className,roll:item.roll,name:item.name,status:item.match.status,code:item.match.code,reason:item.match.reason,transferred:item.transferred,targetClassName:item.match.targetClassName||''})):[];}
  });
  globalThis.ImpressaoAnalisePedagogica=Object.freeze({getCurrentInsights:()=>{const dataset=currentDataset(),student=currentStudent();return dataset&&student?buildPerformanceInsights(student,dataset):null;},analyseWithAudit:(student,dataset,matchAudit)=>composePerformanceInsights(student,dataset,matchAudit||{history:[],total:0,blocked:0,notFound:0}),renderWithAudit:(student,dataset,matchAudit)=>performanceHtmlFromInsights(composePerformanceInsights(student,dataset,matchAudit||{history:[],total:0,blocked:0,notFound:0})),getConfig:()=>getPerformanceConfig(currentDataset(),currentStudent()),classifyTrajectory:(values)=>classifyTrajectory(Array.isArray(values)?values:[])});

  sharedPrintPost('register', { schemaVersion: 1 }, 'init');
  await init();
  publishSharedPrintSnapshot('init');
  return {
    resetPreviewPosition:()=>scalePreview({resetPosition:true}),
    activate:()=>{restoreSharedAnalysisConfig();renderPerformanceSections();renderStageMappings();syncPerformanceAnalysisControls();try{globalThis.CardaoRespostaApp?.setFrontContentMode?.(state.frontContentMode,{silent:true,reason:'print-activate-sync'});}catch(_){}syncFrontContentControls();renderLots();renderPreview();publishSharedPrintSnapshot('analysis-config-activate-sync');requestAnimationFrame(()=>scalePreview({resetPosition:false}));},
    flushBackupState:()=>{clearTimeout(saveSettings.t);saveSettings.t=0;persistSettingsNow();},
    reloadBackupState:()=>{restoreSettings();restoreSharedAnalysisConfig();renderPerformanceSections();renderStageMappings();syncPerformanceAnalysisControls();syncLayoutControls();syncFrontContentControls();populateDatasets();populateStudents();renderLotSelectionControls();renderLots();renderPreview();publishSharedPrintSnapshot('backup-restored');requestAnimationFrame(()=>scalePreview({resetPosition:false}));},
    clearRuntime:()=>{state.datasets=[];state.datasetIndex=0;state.studentIndex=0;state.lots=[];state.hiddenLotIds=[];state.activeLotId='';state.compareLotId='';state.preferredClassName='';state.preferredStudentRoll='';state.preferredStudentName='';clearActiveLot({silent:true});renderLotSelectionControls();renderLots();renderStageMappings();renderPreview();},
    destroy:()=>{cleanupRuntimeWindowListeners();clearTimeout(sharedPrintTimer);clearTimeout(saveSettings.t);try{lotDbPromise?.then?.(db=>db.close()).catch(()=>{});}catch(_){}lotDbPromise=null;},
    getSnapshot:getSharedPrintSnapshot,
    handleQuery:handleSharedPrintQuery
  };
  