
    const listenerRegistry=[];
    const appRoot=root.querySelector('.organizer-app-root');
    const document=createOrganizerDocument(root,appRoot,listenerRegistry);
    const organizerStorage=createOrganizerStorageAdapter();
    const assets=await loadOrganizerAssets();
    const runtimeWindow={
      JSZip:globalThis.JSZip,
      __ORGANIZADOR_ASSETS__:assets,
      addEventListener:(type,listener,options)=>{globalThis.addEventListener(type,listener,options);listenerRegistry.push([globalThis,type,listener,options]);},
      removeEventListener:(type,listener,options)=>globalThis.removeEventListener(type,listener,options)
    };
    const window=runtimeWindow;
    const location={search:''};
const DISCIPLINE_ORDER = [
  'ARTE','EDUCAÇÃO FÍSICA','EDUCACAO FISICA','EDUCAÇÃO RELIGIOSA','EDUCACAO RELIGIOSA','HISTÓRIA','HISTORIA',
  'MATEMÁTICA','MATEMATICA','INGLÊS','INGLES','COMPUTAÇÃO','COMPUTACAO','PORTUGUÊS','PORTUGUES','CIÊNCIAS','CIENCIAS',
  'REDAÇÃO','REDACAO','ÉTICA E CIDADANIA','ETICA E CIDADANIA','GEOGRAFIA'
];

const APP_VERSION = 'v1.0.9';
const STORAGE_PREFIX = 'conteudosAvaliacoesV5:';
const STORAGE_SETTINGS_KEY = STORAGE_PREFIX + 'settings';
const state = {
  fileName:'', sheetName:'', records:[], turmas:[], selected:new Set(), previewTurma:null, columns:null, detectedColumns:null, rawRows:null,
  assessment:'', fullTitle:'', date:'', showDate:true, edits:{}, assets:{}, lastValidation:[], ignoredValidation:[],
  ignoredValidationIds:new Set(), zoom:1.1, fitScale:1, syncEquivalentContents:true,
  currentSignature:'', legacySignature:'', fileMeta:null, originalContentByEditKey:{}, pendingSavedSnapshot:null, saveTimer:null, importGeneration:0,
  columnOverrides:{headerRow:'',turma:'',disciplina:'',conteudo:'',professor:''},
  customStageGroups:{sixth:'',seventh:'',eighth:'',ninth:'',extra:''}
};

const el = {};
function $(id){ return document.getElementById(id); }
function initEls(){ ['fileInput','fileBadge','assessmentInput','fullTitleInput','dateInput','showDateInput','columnsInfo','turmaCount','suffixActions','turmaList','selectAllBtn','clearAllBtn','downloadPdfBtn','downloadPngBtn','validationSummary','validationList','ignoredValidationBox','ignoredValidationCount','ignoredValidationList','previewTabs','previewHint','reportPreview','previewScroll','syncEquivalentBtn','zoomOutBtn','zoomResetBtn','zoomInBtn','zoomValue','downloadCurrentPdfBtn','downloadCurrentPngBtn','resetBtn','renderArea','toast','clearStorageBtn','headerInput','headerInfo','resetHeaderBtn','restoreBox','restoreSavedBtn','ignoreSavedBtn','clearSavedThisBtn','headerRowInput','turmaColInput','disciplinaColInput','conteudoColInput','professorColInput','group6Input','group7Input','group8Input','group9Input','groupExtraInput'].forEach(id=>el[id]=$(id)); }
function normalize(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
function normKey(s){ return normalize(s).replace(/[^A-Z0-9]+/g,' ').trim(); }
function cleanText(s){ return String(s||'').replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/[ \t]{2,}/g,' ').trim(); }
function splitTurmas(value){ return String(value||'').split(/[;,\n\/]+/).map(t=>normalize(t).replace(/\s/g,'')).filter(Boolean); }
function suffixOf(turma){ const m=String(turma).match(/([A-Z]+)$/i); return m ? m[1].toUpperCase() : ''; }
function safeName(s){ return String(s||'').replace(/[<>:"/\\|?*\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').slice(0,120) || 'RELATÓRIO'; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function scheduleRealtimeValidation(){ clearTimeout(scheduleRealtimeValidation.timer); scheduleRealtimeValidation.timer=setTimeout(()=>runValidations(false),140); }
function toast(msg){ el.toast.textContent=msg; el.toast.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.toast.classList.remove('show'),3000); }
function colName(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s || '?'; }
function compareTurma(a,b){ const ma=String(a).match(/^(\d+)(.*)$/), mb=String(b).match(/^(\d+)(.*)$/); if(ma&&mb&&+ma[1]!==+mb[1]) return +ma[1]-+mb[1]; return String(a).localeCompare(String(b),'pt-BR',{numeric:true,sensitivity:'base'}); }
function disciplineIndex(d){ const k=normKey(d); const idx=DISCIPLINE_ORDER.findIndex(x=>normKey(x)===k); return idx>=0?idx:999; }
function compareDisc(a,b){ const ia=disciplineIndex(a), ib=disciplineIndex(b); if(ia!==ib) return ia-ib; return String(a).localeCompare(String(b),'pt-BR',{sensitivity:'base'}); }
function displayDate(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-').map(Number); const dt=new Date(y,m-1,d); const dias=['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO']; return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y} - ${dias[dt.getDay()]}`; }
function shouldDisplayDate(){ return state.showDate && Boolean(cleanText(state.date)); }
function defaultAssessmentByToday(){ const m=new Date().getMonth()+1; if(m<=4) return 'SIMULADO DO I TRIMESTRE'; if(m<=9) return 'SIMULADO DO II TRIMESTRE'; return 'SIMULADO DO III TRIMESTRE'; }
function contentAssessmentTitle(){
  const raw=cleanText(state.assessment || 'AVALIAÇÃO');
  const n=normalize(raw);
  let a=raw.toLocaleUpperCase('pt-BR');
  if(!n.startsWith('CONTEUDOS')){
    const artigo=n.includes('AVALIACAO') ? 'DA' : 'DO';
    a=`CONTEÚDOS ${artigo} ${a}`;
  }
  return a;
}
function reportTitle(turma){
  const custom=cleanText(state.fullTitle);
  if(custom){
    if(/\{\s*TURMA\s*\}/i.test(custom)) return custom.replace(/\{\s*TURMA\s*\}/ig, turma).toLocaleUpperCase('pt-BR');
    const withCurrentClass=custom.replace(/^\s*\d+\s*[A-Z]+\s*\-\s*/i, `${turma} - `);
    return withCurrentClass.toLocaleUpperCase('pt-BR');
  }
  return `${turma} - ${contentAssessmentTitle()}`;
}
function fileBase(turma){ return `${turma} - ${normalize(state.assessment || 'AVALIACAO')}`; }
function parseGroupList(value){ return String(value||'').split(/[;,\n]+/).map(v=>normalize(v).replace(/\s/g,'')).filter(Boolean); }
function updateFullTitlePlaceholder(){
  if(!el.fullTitleInput) return;
  const turma=state.previewTurma || '{TURMA}';
  el.fullTitleInput.placeholder=`Ex.: ${turma} - ${contentAssessmentTitle()}`;
}
function getColumnOverrideNumber(value){ const n=Number.parseInt(String(value||'').trim(),10); return Number.isFinite(n) && n>0 ? n : null; }
function effectiveColumnOverrides(){ return { headerRow:getColumnOverrideNumber(state.columnOverrides.headerRow), turma:getColumnOverrideNumber(state.columnOverrides.turma), disciplina:getColumnOverrideNumber(state.columnOverrides.disciplina), conteudo:getColumnOverrideNumber(state.columnOverrides.conteudo), professor:getColumnOverrideNumber(state.columnOverrides.professor) }; }
function applyEditValueByKey(key,newValue){
  const value=cleanText(newValue);
  const original=cleanText(state.originalContentByEditKey[key] ?? '');
  if(value!==original) state.edits[key]=value;
  else delete state.edits[key];
}
function currentEditValue(key){
  return cleanText(state.edits[key] !== undefined ? state.edits[key] : (state.originalContentByEditKey[key] ?? ''));
}
function canonicalTeacherKey(value){
  return normKey(value)
    .replace(/\b(PROFESSOR|PROFESSORA|PROF|PROFA|DOCENTE)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function teacherKeysForEditKey(editKey){
  const [turma,discKey]=String(editKey||'').split('|||');
  const out=new Set();
  for(const r of state.records){
    if(!r.turmas.includes(turma)) continue;
    if(normKey(r.disciplina)!==discKey) continue;
    const teacher=canonicalTeacherKey(r.professor||'');
    if(teacher) out.add(teacher);
  }
  return Array.from(out).sort();
}
function sourceRowsForEditKey(editKey){
  const [turma,discKey]=String(editKey||'').split('|||');
  const rows=new Set();
  for(const r of state.records){
    if(!r.turmas.includes(turma)) continue;
    if(normKey(r.disciplina)!==discKey) continue;
    if(r.sourceRow) rows.add(String(r.sourceRow));
  }
  return rows;
}
function teacherSetsOverlap(a,b){
  if(!a.length || !b.length) return false;
  const bSet=new Set(b);
  return a.some(value=>bSet.has(value));
}
function rowSetsOverlap(a,b){
  if(!a.size || !b.size) return false;
  for(const value of a) if(b.has(value)) return true;
  return false;
}
function collectEquivalentEditTargets(sourceKey,baselineText){
  if(!state.syncEquivalentContents) return [];
  const [sourceTurma,discKey]=String(sourceKey||'').split('|||');
  const sourceTeachers=teacherKeysForEditKey(sourceKey);
  const sourceRows=sourceRowsForEditKey(sourceKey);
  const baseline=cleanText(baselineText);
  const targets=[];
  for(const turma of state.turmas){
    if(turma===sourceTurma) continue;
    const otherKey=`${turma}|||${discKey}`;
    if(!Object.prototype.hasOwnProperty.call(state.originalContentByEditKey,otherKey)) continue;
    if(currentEditValue(otherKey)!==baseline) continue;
    const sameProfessor=teacherSetsOverlap(sourceTeachers,teacherKeysForEditKey(otherKey));
    const sameSubmission=rowSetsOverlap(sourceRows,sourceRowsForEditKey(otherKey));
    if(!sameProfessor && !sameSubmission) continue;
    targets.push(otherKey);
  }
  return targets;
}
function updateSyncEquivalentControl(){
  if(!el.syncEquivalentBtn) return;
  const active=Boolean(state.syncEquivalentContents);
  const hasProfessorData=Boolean(state.columns?.professor && state.records.some(r=>cleanText(r.professor)));
  el.syncEquivalentBtn.classList.toggle('active',active);
  el.syncEquivalentBtn.classList.toggle('warning',active && state.records.length>0 && !hasProfessorData);
  el.syncEquivalentBtn.setAttribute('aria-pressed',String(active));
  const label=el.syncEquivalentBtn.querySelector('.sync-equivalent-label');
  if(label) label.textContent=`Sincronizar textos: ${active?'ativado':'desativado'}`;
  if(active && state.records.length>0 && !hasProfessorData){
    el.syncEquivalentBtn.title='Sincronização ativada, mas a coluna Professor não foi identificada. Configure essa coluna para permitir a propagação.';
  }else{
    el.syncEquivalentBtn.title=active
      ? 'Replicar alterações entre turmas com o mesmo professor, a mesma disciplina e o mesmo texto anterior'
      : 'Cada turma será editada independentemente';
  }
}

async function loadAssets(){
  state.assets.header = await assetToDataUrl('cabecalho.jpg');
  state.assets.logo = await assetToDataUrl('logo.png');
}
async function assetToDataUrl(path){
  const embedded = window.__ORGANIZADOR_ASSETS__ && window.__ORGANIZADOR_ASSETS__[path];
  if(embedded) return embedded;
  const blob = await fetch(path).then(r=>{ if(!r.ok) throw new Error('Recurso interno não encontrado: '+path); return r.blob(); });
  return await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=()=>rej(new Error('Não foi possível carregar o recurso interno.')); fr.readAsDataURL(blob); });
}


async function storageGetAll(){ return await organizerStorage.getAll(); }
async function storageGet(key){ return await organizerStorage.get(key); }
async function storageSet(obj){ await organizerStorage.set(obj); }
async function storageRemove(keys){ await organizerStorage.remove(keys); }
async function storageClearAppData(){ await organizerStorage.clear(); }
async function hashText(text){
  try{
    const data=new TextEncoder().encode(text);
    const buf=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    let h=0; for(let i=0;i<text.length;i++){ h=((h<<5)-h)+text.charCodeAt(i); h|=0; }
    return 'fallback-'+Math.abs(h);
  }
}
function normalizedRecordsForSignature(payload){
  return (payload.records||[]).map(r=>({
    row:r.sourceRow||0,
    turmas:[...(r.turmas||[])].map(String).sort(compareTurma),
    disciplina:cleanText(r.disciplina),
    conteudo:cleanText(r.conteudo),
    professor:cleanText(r.professor)
  }));
}
function canonicalPayloadForSignature(payload){
  const records=normalizedRecordsForSignature(payload);
  const turmas=Array.from(new Set(records.flatMap(r=>r.turmas))).sort(compareTurma);
  const disciplinas=Array.from(new Set(records.map(r=>normKey(r.disciplina)).filter(Boolean))).sort();
  const professores=Array.from(new Set(records.map(r=>normKey(r.professor)).filter(Boolean))).sort();
  return JSON.stringify({schema:'conteudos-avaliacoes-dados-v8',columns:payload.columns||{},rowCount:records.length,turmas,disciplinas,professores,records});
}
function canonicalLegacyPayloadForSignature(payload){
  const records=normalizedRecordsForSignature(payload);
  return JSON.stringify({fileName:payload.fileName||'',sheetName:payload.sheetName||'',columns:payload.columns||{},records});
}
async function computePayloadSignature(payload){ return await hashText(canonicalPayloadForSignature(payload)); }
async function computeLegacyPayloadSignature(payload){ return await hashText(canonicalLegacyPayloadForSignature(payload)); }
async function hashArrayBuffer(buffer){
  try{
    const digest=await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    const bytes=new Uint8Array(buffer); let h=2166136261;
    for(const b of bytes){ h^=b; h=Math.imul(h,16777619); }
    return 'fallback-'+(h>>>0).toString(16).padStart(8,'0');
  }
}
function shortHash(hash){ return hash ? String(hash).slice(0,10).toUpperCase() : '—'; }
function formatFileSize(bytes){
  const n=Number(bytes||0);
  if(n>=1024*1024) return (n/(1024*1024)).toFixed(2).replace('.',',')+' MB';
  if(n>=1024) return Math.ceil(n/1024)+' KB';
  return n+' B';
}
function fileLastModifiedISO(value){
  const n=Number(value||0); if(!n) return '';
  try{return new Date(n).toISOString();}catch(e){return '';}
}
function buildFileMeta(file, rawFileHash){
  return {
    name:file && file.name ? file.name : '',
    size:file && typeof file.size==='number' ? file.size : 0,
    type:file && file.type ? file.type : '',
    lastModified:file && file.lastModified ? file.lastModified : 0,
    lastModifiedISO:fileLastModifiedISO(file && file.lastModified),
    rawFileHash:rawFileHash || ''
  };
}
function buildOriginalContentMap(){
  const out={};
  for(const turma of state.turmas){
    const map=new Map();
    for(const r of state.records){
      if(!r.turmas.includes(turma)) continue;
      const disc=cleanText(r.disciplina)||'DISCIPLINA NÃO INFORMADA'; const key=normKey(disc);
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(cleanText(r.conteudo));
    }
    for(const [discKey, contents] of map.entries()) out[`${turma}|||${discKey}`]=contents.filter(Boolean).join('\n\n');
  }
  return out;
}