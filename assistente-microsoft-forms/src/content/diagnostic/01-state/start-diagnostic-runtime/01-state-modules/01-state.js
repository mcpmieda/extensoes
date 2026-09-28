
'use strict';
const SCHOOL_SECTIONS = [
  {id:'s1',name:'Português',area:'Linguagens',start:1,end:5,enabled:true},
  {id:'s2',name:'Inglês',area:'Linguagens',start:6,end:8,enabled:true},
  {id:'s3',name:'Computação',area:'Linguagens',start:9,end:10,enabled:true},
  {id:'s4',name:'Arte',area:'Linguagens',start:11,end:14,enabled:true},
  {id:'s5',name:'Educação Física',area:'Linguagens',start:15,end:17,enabled:true},
  {id:'s6',name:'Matemática',area:'Matemática',start:18,end:22,enabled:true},
  {id:'s7',name:'Ciências',area:'Ciências da Natureza',start:23,end:26,enabled:true},
  {id:'s8',name:'História',area:'Ciências Humanas',start:27,end:30,enabled:true},
  {id:'s9',name:'Geografia',area:'Ciências Humanas',start:31,end:34,enabled:true},
  {id:'s10',name:'Educação Religiosa',area:'Ciências Humanas',start:35,end:37,enabled:true},
  {id:'s11',name:'Ética e Cidadania',area:'Ciências Humanas',start:38,end:40,enabled:true}
];
const GENERIC_SECTIONS = [
  {id:'g1',name:'Seção 1',area:'Grupo 1',start:1,end:10,enabled:true},
  {id:'g2',name:'Seção 2',area:'Grupo 2',start:11,end:20,enabled:true},
  {id:'g3',name:'Seção 3',area:'Grupo 3',start:21,end:30,enabled:true},
  {id:'g4',name:'Seção 4',area:'Grupo 4',start:31,end:40,enabled:true}
];
const SETTINGS_KEY='gssf_pedagogico_settings_v1';
const ANALYSIS_CONFIG_KEY='gssf_pedagogical_analysis_config_v1';

const SHARED_PROTOCOL='gssf-shared-data-v1';
let sharedDiagnosticTimer=0;
function sharedDiagnosticPost(type,payload,reason=''){if(window.parent===window)return;window.parent.publish({protocol:SHARED_PROTOCOL,type,source:'diagnostic',payload,reason})}
function getSharedDiagnosticSnapshot(){
  const batches=visibleBatches();
  const assessments=batches.map(batch=>({id:batch.id,name:batch.name,date:batch.date||'',createdAt:batch.createdAt||'',studentCount:(batch.students||[]).length,classes:(batch.classes||[]).map(group=>({name:group.name,questionCount:group.questionCount||0,studentCount:(group.students||[]).length,files:[...(group.files||[])]})),files:(batch.files||[]).map(file=>({fileName:file.fileName,className:file.className,questionCount:file.questionCount,studentCount:file.studentCount}))}));
  const students=batches.flatMap(batch=>(batch.students||[]).map(student=>({sourceId:student.id||studentKey(student),assessmentId:batch.id,assessmentName:batch.name,date:batch.date||'',className:student.className,roll:clean(student.roll),name:student.name,totalMarks:student.totalMarks,correct:Math.max(0,toNum(student.correct)),incorrect:Math.max(0,toNum(student.incorrect)),blank:Math.max(0,toNum(student.blank)),questionCount:Math.max(0,toNum(student.questionCount))})));
  return{schemaVersion:1,source:'diagnostic',assessments,students,sections:state.sections.map(section=>({id:section.id,name:section.name,area:section.area,start:+section.start,end:+section.end,enabled:Boolean(section.enabled)})),selection:{assessmentId:state.activeBatchId||'',comparisonAssessmentId:state.compareBatchId||'',comparisonMode:state.comparisonMode,className:state.selectedClass||'',studentKey:state.selectedStudent||'',sectionId:state.selectedSection||'',view:state.view},settings:{target:state.target,matchMode:state.matchMode,classNormalization:state.classNormalization}};
}
function publishSharedDiagnosticSnapshot(reason='update'){clearTimeout(sharedDiagnosticTimer);sharedDiagnosticTimer=setTimeout(()=>sharedDiagnosticPost('snapshot',getSharedDiagnosticSnapshot(),reason),60)}
function publishSharedDiagnosticContext(reason='selection'){sharedDiagnosticPost('context',{assessmentId:state.activeBatchId||'',comparisonAssessmentId:state.compareBatchId||'',comparisonMode:state.comparisonMode,className:state.selectedClass||'',studentKey:state.selectedStudent||'',sectionId:state.selectedSection||'',view:state.view},reason)}
function handleSharedDiagnosticQuery(action,params={}){
  if(action==='get-assessments')return getSharedDiagnosticSnapshot();
  if(action==='get-sections')return clone(state.sections);
  if(action==='get-assessment'){const batch=params.assessmentId?visibleBatches().find(item=>item.id===params.assessmentId):activeBatch();return batch?clone(batch):null}
  if(action==='get-student-performance'){
    const batch=params.assessmentId?visibleBatches().find(item=>item.id===params.assessmentId):activeBatch();if(!batch)return null;
    const wantedClass=normalizeClass(params.className||''),wantedRoll=clean(params.roll),wantedName=normName(params.name||'');
    const student=(batch.students||[]).find(item=>(params.studentKey&&studentKey(item)===params.studentKey)||((!wantedClass||normalizeClass(item.className)===wantedClass)&&(!wantedRoll||clean(item.roll)===wantedRoll)&&(!wantedName||normName(item.name)===wantedName)));
    if(!student)return null;return{assessment:{id:batch.id,name:batch.name,date:batch.date},student:clone(student),sections:clone(state.sections),classStudents:clone((batch.classes.find(group=>classEquivalent(group.name,student.className))?.students)||[])};
  }
  throw new Error(`Consulta não suportada pelo Diagnóstico: ${action}`)
}
// Consultas ao Diagnóstico são feitas exclusivamente pela ponte interna GSSFSharedBridge.
// Não existe listener de window.message nem canal de mensagens com a página hospedeira.

const DB_NAME='gssf_pedagogico_db_v1';
const DB_STORE='batches';
const state={
  batches:[],hiddenBatchIds:[],activeBatchId:'',compareBatchId:'',comparisonMode:'trajectory',view:'overview',selectedClass:'',selectedStudent:'',selectedSection:'',rememberedClass:'',rememberedStudentRoll:'',rememberedStudentName:'',
  preset:'school',sections:clone(SCHOOL_SECTIONS),target:60,excludedStudents:[],
  columns:{exam:'Exam',roll:'Roll No',name:'Name',marks:'Total Marks',correct:'Correct Answers',incorrect:'Incorrect Answers',blank:'Not attempted'},
  matchMode:'class_roll_name',classNormalization:'auto',
  reportTeachers:[],reportSelectedIds:[],reportDraft:{name:'',assignments:[]},reportEditingId:'',reportDraftSectionId:'',reportDraftClasses:[],reportMassOpen:false,reportMassFileName:'',reportMassColumns:[],reportMassHiddenClasses:[],reportMassGrid:{},reportMassWarnings:[],reportMassDirty:false
};
const $=id=>document.getElementById(id);
const els={dashboard:$('dashboard'),viewTitle:$('viewTitle'),viewSubtitle:$('viewSubtitle'),analysisContext:$('analysisContext'),filterControls:$('filterControls'),classFilter:$('classFilter'),studentFilter:$('studentFilter'),sectionFilter:$('sectionFilter'),viewTabs:$('viewTabs'),viewIndicator:$('viewIndicator'),libraryStatus:$('libraryStatus'),dataStatus:$('dataStatus'),batchName:$('batchName'),batchDate:$('batchDate'),batchFiles:$('batchFiles'),batchUpload:$('batchUpload'),batchFileTitle:$('batchFileTitle'),batchFileHint:$('batchFileHint'),batchFileList:$('batchFileList'),batchFormHelp:$('batchFormHelp'),createBatch:$('createBatch'),loadDemo:$('loadDemo'),batchList:$('batchList'),activeBatch:$('activeBatch'),activeBatchButtons:$('activeBatchButtons'),compareBatch:$('compareBatch'),compareBatchButtons:$('compareBatchButtons'),comparisonModeToggle:$('comparisonModeToggle'),compareOneToOneField:$('compareOneToOneField'),comparisonHelp:$('comparisonHelp'),targetPercent:$('targetPercent'),presetToggle:$('presetToggle'),addSection:$('addSection'),resetSections:$('resetSections'),sectionTable:$('sectionTable').querySelector('tbody'),auditList:$('auditList'),auditCard:$('auditCard'),importMapBtn:$('importMapBtn'),exportMapBtn:$('exportMapBtn'),importMapFile:$('importMapFile'),colExam:$('colExam'),colRoll:$('colRoll'),colName:$('colName'),colMarks:$('colMarks'),colCorrect:$('colCorrect'),colIncorrect:$('colIncorrect'),colBlank:$('colBlank'),matchMode:$('matchMode'),classNormalization:$('classNormalization'),exportSummary:$('exportSummary'),resetApp:$('resetApp'),excludeStudentSelect:$('excludeStudentSelect'),excludeStudentBtn:$('excludeStudentBtn'),clearExcludedBtn:$('clearExcludedBtn'),excludedStudentList:$('excludedStudentList'),matchReviewLayer:$('matchReviewLayer'),matchReviewTitle:$('matchReviewTitle'),matchReviewSubtitle:$('matchReviewSubtitle'),matchReviewSummary:$('matchReviewSummary'),matchReviewTable:$('matchReviewTable'),matchReviewBody:$('matchReviewBody'),matchReviewEmpty:$('matchReviewEmpty'),matchReviewClose:$('matchReviewClose'),toast:$('toast')};
let dbPromise=null;
let storageWarningShown=false;
function storageGet(key){try{return diagnosticStorage.getItem(key)}catch(e){if(!storageWarningShown){console.warn('Armazenamento local indisponível; as configurações permanecerão somente nesta sessão.',e);storageWarningShown=true}return null}}
function storageSet(key,value){try{diagnosticStorage.setItem(key,value);return true}catch(e){if(!storageWarningShown){console.warn('Armazenamento local indisponível; as configurações permanecerão somente nesta sessão.',e);storageWarningShown=true}return false}}
function storageRemove(key){try{diagnosticStorage.removeItem(key);return true}catch(e){if(!storageWarningShown){console.warn('Armazenamento local indisponível; não foi possível remover as configurações persistentes.',e);storageWarningShown=true}return false}}
let sectionRefreshTimer=null;
function scheduleSectionRefresh(){clearTimeout(sectionRefreshTimer);sectionRefreshTimer=setTimeout(()=>{sectionRefreshTimer=null;refreshAll();saveSettings();publishSharedDiagnosticSnapshot('sections-updated')},140)}

async function init(){
  restoreSettings();reportRestoreData();
  els.batchDate.value='';
  bindEvents(); installSelectNavigators(); renderSections(); updateBatchFormState();
  refreshAll(); applyViewState(state.view); requestAnimationFrame(moveViewIndicator);
  setLibrary('Carregando leitor de planilhas…','');
  const xlsxReady=await window.ensureXlsxLibrary();
  setLibrary(xlsxReady?'Leitor de planilhas pronto':'Leitor de planilhas indisponível',xlsxReady?'ok':'warn');
  updateBatchFormState();
  try{state.batches=await dbGetAll();const corrected=state.batches.filter(normalizeStoredBatch);sortBatches();if(corrected.length)await Promise.allSettled(corrected.filter(b=>!b.sessionOnly).map(dbPut));}catch(e){console.warn(e);showToast('Os lotes salvos não puderam ser recuperados; os novos lotes ainda funcionarão nesta sessão.')}
  reconcileBatchVisibility();
  refreshAll(); applyViewState(state.view); requestAnimationFrame(moveViewIndicator);publishSharedDiagnosticSnapshot('init-loaded');
}

function installSelectNavigators(){
  document.querySelectorAll('select:not(.hidden):not([data-no-nav])').forEach(select=>{
    if(select.closest('.select-stepper'))return;
    const wrap=document.createElement('div');wrap.className='select-stepper';
    const prev=document.createElement('button');prev.type='button';prev.className='select-nav-btn';prev.title='Opção anterior';prev.setAttribute('aria-label','Opção anterior');prev.textContent='‹';
    const next=document.createElement('button');next.type='button';next.className='select-nav-btn';next.title='Próxima opção';next.setAttribute('aria-label','Próxima opção');next.textContent='›';
    select.parentNode.insertBefore(wrap,select);wrap.append(select,prev,next);
    const step=direction=>{const options=[...select.options].filter(o=>!o.disabled);if(!options.length)return;let index=options.indexOf(select.selectedOptions[0]);if(index<0)index=0;const target=index+direction;if(target<0||target>=options.length)return;select.value=options[target].value;select.dispatchEvent(new Event('change',{bubbles:true}));updateSelectNavigator(select)};
    prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));select.addEventListener('change',()=>updateSelectNavigator(select));
    new MutationObserver(()=>updateSelectNavigator(select)).observe(select,{childList:true,subtree:true,attributes:true});
    updateSelectNavigator(select);
  });
}
function updateSelectNavigator(select){const wrap=select.closest('.select-stepper');if(!wrap)return;const buttons=wrap.querySelectorAll('.select-nav-btn');if(buttons.length<2)return;const options=[...select.options].filter(o=>!o.disabled),index=options.indexOf(select.selectedOptions[0]);buttons[0].disabled=select.disabled||index<=0;buttons[1].disabled=select.disabled||index<0||index>=options.length-1;wrap.style.display=select.dataset.hiddenByView==='true'?'none':''}
function updateAllSelectNavigators(){document.querySelectorAll('.select-stepper select').forEach(updateSelectNavigator)}
function setSelectVisible(select,visible){select.dataset.hiddenByView=visible?'false':'true';const wrap=select.closest('.select-stepper');if(wrap)wrap.style.display=visible?'':'none';else select.style.display=visible?'':'none'}

function bindEvents(){
  els.viewTabs.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;setView(b.dataset.view)});
  els.classFilter.addEventListener('change',()=>{state.selectedClass=els.classFilter.value;state.rememberedClass=state.selectedClass;state.selectedStudent='';refreshFilters();renderDashboard();saveSettings()});
  els.studentFilter.addEventListener('change',()=>{state.selectedStudent=els.studentFilter.value;const batch=filterBatchData(activeBatch()),students=state.selectedClass?(batch?.classes.find(c=>c.name===state.selectedClass)?.students||[]):batch?.students||[];rememberDiagnosticStudent(students.find(student=>studentKey(student)===state.selectedStudent)||null);if(state.view!=='student')setView('student');else renderDashboard();saveSettings()});
  els.sectionFilter.addEventListener('change',()=>{state.selectedSection=els.sectionFilter.value;if(state.view!=='sections')setView('sections');else renderDashboard();saveSettings()});
  els.createBatch.addEventListener('click',createBatchFromSelection);els.loadDemo.addEventListener('click',loadDemoData);
  els.batchFiles.addEventListener('change',updateBatchFormState);els.batchName.addEventListener('input',updateBatchFormState);els.batchDate.addEventListener('change',updateBatchFormState);
  els.activeBatch.addEventListener('change',()=>{state.activeBatchId=els.activeBatch.value;refreshAll();saveSettings()});
  els.comparisonModeToggle.addEventListener('click',e=>{const b=e.target.closest('[data-comparison-mode]');if(!b)return;state.comparisonMode=b.dataset.comparisonMode;refreshAll();saveSettings()});
  els.compareBatch.addEventListener('change',()=>{state.compareBatchId=els.compareBatch.value;refreshAll();saveSettings()});
  els.targetPercent.addEventListener('change',()=>{state.target=clamp(+els.targetPercent.value,0,100);refreshAll();saveSettings()});
  els.presetToggle.addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(!b)return;state.preset=b.dataset.preset;state.sections=clone(state.preset==='school'?SCHOOL_SECTIONS:GENERIC_SECTIONS);renderSections();refreshAll();saveSettings();publishSharedDiagnosticSnapshot('preset-changed')});
  els.addSection.addEventListener('click',()=>{const max=Math.max(0,...state.sections.map(s=>+s.end||0));state.sections.push({id:uid(),name:`Disciplina ${state.sections.length+1}`,area:`Grupo ${state.sections.length+1}`,start:max+1,end:max+1,enabled:true});renderSections();refreshAll();saveSettings();publishSharedDiagnosticSnapshot('section-added')});
  els.resetSections.addEventListener('click',()=>{state.sections=clone(state.preset==='school'?SCHOOL_SECTIONS:GENERIC_SECTIONS);renderSections();refreshAll();saveSettings();publishSharedDiagnosticSnapshot('sections-reset')});
  els.sectionTable.addEventListener('input',handleSectionEdit);els.sectionTable.addEventListener('click',handleSectionRemove);
  els.importMapBtn.addEventListener('click',()=>els.importMapFile.click());els.importMapFile.addEventListener('change',importMap);els.exportMapBtn.addEventListener('click',exportMap);
  ['colExam','colRoll','colName','colMarks','colCorrect','colIncorrect','colBlank'].forEach(id=>els[id].addEventListener('change',updateColumnSettings));
  els.matchMode.addEventListener('change',()=>{state.matchMode=els.matchMode.value;refreshAll();saveSettings()});
  els.classNormalization.addEventListener('change',()=>{state.classNormalization=els.classNormalization.value;refreshAll();saveSettings()});
  els.exportSummary.addEventListener('click',exportSummaryCsv);els.resetApp.addEventListener('click',resetApp);els.excludeStudentBtn?.addEventListener('click',()=>{const key=els.excludeStudentSelect?.value||'';if(!key)return showToast('Selecione um aluno para excluir da análise.');if(!state.excludedStudents.includes(key))state.excludedStudents.push(key);refreshAll();saveSettings()});els.clearExcludedBtn?.addEventListener('click',()=>{state.excludedStudents=[];refreshAll();saveSettings()});
  els.matchReviewClose?.addEventListener('click',closeMatchReview);els.matchReviewLayer?.addEventListener('click',event=>{if(event.target===els.matchReviewLayer)closeMatchReview()});els.matchReviewBody?.addEventListener('click',handleMatchReviewAction);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!els.matchReviewLayer?.hidden)closeMatchReview()});
  window.addEventListener('resize',moveViewIndicator);
}