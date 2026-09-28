
function currentEditSnapshot(){
  const edits={};
  for(const [key,value] of Object.entries(state.edits)){
    const edited=cleanText(value); const original=state.originalContentByEditKey[key] ?? '';
    if(edited!==cleanText(original)) edits[key]={original, edited, updatedAt:new Date().toISOString()};
  }
  return {
    version:APP_VERSION,
    signature:state.currentSignature,
    dataSignature:state.currentSignature,
    legacySignature:state.legacySignature,
    fileName:state.fileName,
    sheetName:state.sheetName,
    fileMeta:state.fileMeta,
    columns:state.columns,
    assessment:state.assessment,
    fullTitle:state.fullTitle,
    date:state.date,
    showDate:state.showDate,
    syncEquivalentContents:Boolean(state.syncEquivalentContents),
    customStageGroups:{...state.customStageGroups},
    edits,
    ignoredValidationIds:Array.from(state.ignoredValidationIds),
    savedAt:new Date().toISOString()
  };
}
async function saveCurrentStateNow(){
  if(!state.currentSignature) return;
  const snap=currentEditSnapshot();
  const hasUseful=Object.keys(snap.edits).length || snap.assessment || snap.fullTitle || snap.date || snap.showDate===false || snap.ignoredValidationIds.length;
  if(!hasUseful) return;
  await storageSet({[STORAGE_PREFIX+'doc:'+state.currentSignature]:snap});
}
function scheduleSaveCurrentState(){
  if(state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(()=>saveCurrentStateNow().catch(console.error),320);
}
function hideRestoreBox(){ if(el.restoreBox) el.restoreBox.classList.add('hidden'); }
function showRestoreBox(snapshot){
  state.pendingSavedSnapshot=snapshot;
  if(!el.restoreBox) return;
  el.restoreBox.classList.remove('hidden');
}
function snapshotMatchesCurrent(snapshot){
  if(!snapshot || !state.currentSignature) return false;
  return snapshot.dataSignature===state.currentSignature ||
         snapshot.signature===state.currentSignature ||
         snapshot.signature===state.legacySignature ||
         snapshot.legacySignature===state.legacySignature;
}
function applySavedSnapshot(snapshot){
  if(!snapshotMatchesCurrent(snapshot)) return toast('O salvamento não pertence a esta planilha.');
  const next={}; let skipped=0;
  for(const [key,obj] of Object.entries(snapshot.edits||{})){
    const currentOriginal=cleanText(state.originalContentByEditKey[key] ?? '');
    const savedOriginal=cleanText(obj.original ?? '');
    if(currentOriginal && currentOriginal===savedOriginal) next[key]=cleanText(obj.edited);
    else skipped++;
  }
  state.edits=next;
  if(snapshot.assessment) state.assessment=snapshot.assessment;
  state.fullTitle=snapshot.fullTitle || '';
  if(Object.prototype.hasOwnProperty.call(snapshot,'date')) state.date=snapshot.date||'';
  if(typeof snapshot.showDate==='boolean') state.showDate=snapshot.showDate;
  if(typeof snapshot.syncEquivalentContents==='boolean') state.syncEquivalentContents=snapshot.syncEquivalentContents;
  state.customStageGroups={sixth:'',seventh:'',eighth:'',ninth:'',extra:'',...(snapshot.customStageGroups||{})};
  state.ignoredValidationIds=new Set(Array.isArray(snapshot.ignoredValidationIds)?snapshot.ignoredValidationIds:[]);
  hideRestoreBox();
  renderAll(); runValidations(false);
  saveCurrentStateNow().catch(console.error);
  toast(skipped ? `Edições restauradas. ${skipped} item(ns) ignorado(s) por segurança.` : 'Edições salvas restauradas.');
}
async function checkSavedForCurrentSignature(){
  hideRestoreBox(); state.pendingSavedSnapshot=null;
  if(!state.currentSignature) return;
  const candidates=[];
  const primary=await storageGet(STORAGE_PREFIX+'doc:'+state.currentSignature);
  if(primary && snapshotMatchesCurrent(primary) && (Object.keys(primary.edits||{}).length || primary.assessment || primary.fullTitle || primary.date || primary.showDate===false || (primary.ignoredValidationIds||[]).length)) candidates.push(primary);
  if(state.legacySignature && state.legacySignature!==state.currentSignature){
    const legacy=await storageGet(STORAGE_PREFIX+'doc:'+state.legacySignature);
    if(legacy && snapshotMatchesCurrent(legacy) && (Object.keys(legacy.edits||{}).length || legacy.assessment || legacy.fullTitle || legacy.date || legacy.showDate===false || (legacy.ignoredValidationIds||[]).length)) candidates.push(legacy);
  }
  if(candidates.length) showRestoreBox(candidates[0]);
}
async function saveSettings(){
  const settings={
    version:APP_VERSION,
    customHeader:state.assets.customHeader||'',
    savedAt:new Date().toISOString()
  };
  await storageSet({[STORAGE_SETTINGS_KEY]:settings});
}
async function loadSettings(){
  const settings=await storageGet(STORAGE_SETTINGS_KEY);
  if(settings && settings.customHeader){ state.assets.header=settings.customHeader; state.assets.customHeader=settings.customHeader; }
  updateHeaderInfo();
}
function updateHeaderInfo(){
  if(!el.headerInfo) return;
  el.headerInfo.textContent=state.assets.customHeader ? 'Cabeçalho personalizado salvo neste navegador.' : 'Cabeçalho padrão carregado.';
}
function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=()=>reject(new Error('Não foi possível ler a imagem.')); fr.readAsDataURL(file); });
}
async function prepareHeaderDataUrl(file){
  const raw=await readFileAsDataUrl(file);
  const img=await loadImage(raw);
  const maxW=2400, maxH=420;
  const ratio=Math.min(1, maxW/img.width, maxH/img.height);
  const w=Math.max(1, Math.round(img.width*ratio));
  const h=Math.max(1, Math.round(img.height*ratio));
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
  return canvas.toDataURL('image/jpeg',0.9);
}

function xmlDoc(txt){ return new DOMParser().parseFromString(txt,'application/xml'); }
function nodesByLocalName(node, localName){ return Array.from(node.getElementsByTagName('*')).filter(x=>x.localName===localName); }
function firstByLocalName(node, localName){ return nodesByLocalName(node, localName)[0] || null; }
function getText(node, tag){ const x=firstByLocalName(node, tag); return x ? x.textContent : ''; }
function cellCol(ref){ const m=String(ref||'').match(/^([A-Z]+)/); if(!m) return 0; let n=0; for(const ch of m[1]) n=n*26+(ch.charCodeAt(0)-64); return n-1; }
function normalizeTarget(base,target){ target=target.replace(/^\//,''); if(target.startsWith('xl/')) return target; return 'xl/'+target.replace(/^\.\//,''); }

async function parseXlsxFile(file, arrayBuffer){
  if(!window.JSZip) throw new Error('Biblioteca de leitura não carregou. Reabra o app.');
  const buffer=arrayBuffer||await gssfReadSpreadsheetArrayBuffer(file,{preflightZip:false});
  const zip = gssfAssertZipArchive(await JSZip.loadAsync(buffer));
  const shared=[];
  if(zip.file('xl/sharedStrings.xml')){
    const ss=xmlDoc(await gssfSafeZipEntryText(zip.file('xl/sharedStrings.xml'),'sharedStrings.xml'));
    for(const si of nodesByLocalName(ss, 'si')){
      shared.push(nodesByLocalName(si, 't').map(t=>t.textContent||'').join(''));
    }
  }
  const wb=xmlDoc(await gssfSafeZipEntryText(zip.file('xl/workbook.xml'),'workbook.xml'));
  const rels=xmlDoc(await gssfSafeZipEntryText(zip.file('xl/_rels/workbook.xml.rels'),'workbook.xml.rels'));
  const relMap={};
  for(const r of nodesByLocalName(rels, 'Relationship')){ relMap[r.getAttribute('Id')] = r.getAttribute('Target'); }
  const sheets=nodesByLocalName(wb, 'sheet');
  let best=null;
  for(const sh of sheets){
    const rid=sh.getAttribute('r:id') || sh.getAttribute('id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const target=relMap[rid]; if(!target) continue;
    const path=normalizeTarget('xl', target);
    const f=zip.file(path); if(!f) continue;
    const rows=parseWorksheet(xmlDoc(await gssfSafeZipEntryText(f,path)), shared);
    const det=detectColumns(rows);
    const score=det.score + Math.min(rows.length,200)/100;
    if(!best || score>best.score) best={sheetName:sh.getAttribute('name')||path, rows, det, score};
  }
  if(!best) throw new Error('Não encontrei uma aba válida na planilha.');
  const overrides=effectiveColumnOverrides();
  if(best.det.score<1 && !overrides.turma && !overrides.disciplina && !overrides.conteudo){
    return {
      fileName:file.name,
      sheetName:best.sheetName,
      columns:null,
      detectedColumns:{score:best.det.score,headerRow:null,turma:null,disciplina:null,conteudo:null,professor:null},
      rawRows:best.rows,
      records:[],
      needsMapping:true
    };
  }
  return rowsToRecords(best.rows, best.det, file.name, best.sheetName, overrides);
}

function parseWorksheet(doc, shared){
  const rows=[];
  const rowNodes=nodesByLocalName(doc, 'row');
  for(const row of rowNodes){
    const vals={}; let max=-1;
    for(const c of nodesByLocalName(row, 'c')){
      const idx=cellCol(c.getAttribute('r')); max=Math.max(max,idx);
      const t=c.getAttribute('t'); let val='';
      if(t==='s') val=shared[Number(getText(c,'v'))] || '';
      else if(t==='inlineStr') val=nodesByLocalName(c, 't').map(x=>x.textContent||'').join('');
      else val=getText(c,'v');
      vals[idx]=val;
    }
    if(max>=0){ const arr=[]; for(let i=0;i<=max;i++) arr.push(vals[i]||''); rows.push(arr); }
  }
  return rows;
}

function detectColumns(rows){
  let best={score:-1, headerRow:0, turma:null, disciplina:null, conteudo:null, professor:null};
  rows.slice(0,15).forEach((row,ri)=>{
    const cand={turma:null,disciplina:null,conteudo:null,professor:null};
    const scores={turma:-999,disciplina:-999,conteudo:-999,professor:-999};
    row.forEach((val,ci)=>{
      const n=normalize(val); const bad=/\b(PONTOS|COMENTARIOS|COMENTÁRIOS|TOTAL|EMAIL|HORA)\b/.test(n);
      let st=0; if(n.includes('TURMA')) st+=10; if(n.includes('SERIE')||n.includes('SÉRIE')||n.includes('ANO')) st+=3; if(n.includes('SELECIONE')||n.includes('ESCOLHA')) st+=2; if(bad) st-=60; if(st>scores.turma){ scores.turma=st; cand.turma=ci; }
      let sd=0; if(n.includes('DISCIPLINA')) sd+=10; if(n.includes('MATÉRIA')||n.includes('MATERIA')||n.includes('COMPONENTE')) sd+=6; if(n.includes('ESCOLHA')||n.includes('SELECIONE')) sd+=2; if(bad) sd-=60; if(sd>scores.disciplina){ scores.disciplina=sd; cand.disciplina=ci; }
      let sc=0; if(n.includes('CONTEUDO')||n.includes('CONTEÚDO')) sc+=12; if(n.includes('ASSUNTO')||n.includes('OBJETO')) sc+=8; if(n.includes('FORMA ORGANIZADA')||n.includes('REVISAR ORTOGRAFIA')) sc+=3; if(bad) sc-=60; if(sc>scores.conteudo){ scores.conteudo=sc; cand.conteudo=ci; }
      const rowContext=normalize(row.join(' | '));
      const formsContext=(rowContext.includes('DISCIPLINA') && rowContext.includes('TURMA') && (rowContext.includes('CONTEUDO')||rowContext.includes('CONTEÚDO')));
      let sp=0; if(n.includes('PROFESSOR')) sp+=12; if(n.includes('DOCENTE')) sp+=10; if(n.includes('PROFESSORA')) sp+=12; if(n.includes('RESPONSAVEL')||n.includes('RESPONSÁVEL')) sp+=3; if(formsContext && n==='NOME') sp+=9; if(bad) sp-=60; if(sp>0 && sp>scores.professor){ scores.professor=sp; cand.professor=ci; }
    });
    const total = Math.max(0,scores.turma)+Math.max(0,scores.disciplina)+Math.max(0,scores.conteudo)+Math.max(0,scores.professor);
    if(scores.turma>0 && scores.disciplina>0 && scores.conteudo>0 && total>best.score){ best={score:total, headerRow:ri, ...cand}; }
  });
  return best;
}

function rowsToRecords(rows, det, fileName, sheetName, overrides={}){
  const detectedValid=Boolean(det && det.score>=1);
  const resolved={
    headerRow:overrides.headerRow || (detectedValid ? det.headerRow+1 : 1),
    turma:overrides.turma || (detectedValid && det.turma!==null ? det.turma+1 : null),
    disciplina:overrides.disciplina || (detectedValid && det.disciplina!==null ? det.disciplina+1 : null),
    conteudo:overrides.conteudo || (detectedValid && det.conteudo!==null ? det.conteudo+1 : null),
    professor:overrides.professor || (detectedValid && det.professor!==null && det.professor!==undefined ? det.professor+1 : null)
  };
  if(!resolved.turma || !resolved.disciplina || !resolved.conteudo){
    throw new Error('Não consegui identificar as colunas obrigatórias. Informe manualmente a linha do cabeçalho e as colunas de turma, disciplina e conteúdo em Mais configurações.');
  }
  const maxCols=Math.max(...rows.map(row=>(row||[]).length),0);
  for(const [label,value] of [['turma',resolved.turma],['disciplina',resolved.disciplina],['conteúdo',resolved.conteudo],['professor',resolved.professor]]){
    if(value && value>maxCols) throw new Error(`A coluna de ${label} (${value}) não existe nesta planilha, que possui ${maxCols} coluna(s).`);
  }
  if(resolved.headerRow<1 || resolved.headerRow>rows.length) throw new Error(`A linha de cabeçalho ${resolved.headerRow} não existe nesta planilha.`);
  const turmaIdx=resolved.turma-1, disciplinaIdx=resolved.disciplina-1, conteudoIdx=resolved.conteudo-1, professorIdx=resolved.professor ? resolved.professor-1 : null;
  const records=[];
  for(let i=resolved.headerRow;i<rows.length;i++){
    const row=rows[i]||[];
    const disciplina=cleanText(row[disciplinaIdx]||'').replace(/;+$/,'').trim();
    const conteudo=cleanText(row[conteudoIdx]||'');
    const professor=professorIdx!==null ? cleanText(row[professorIdx]||'') : '';
    const turmas=splitTurmas(row[turmaIdx]||'');
    if(!disciplina && !conteudo && !turmas.length && !professor) continue;
    records.push({sourceRow:i+1, turmas, disciplina, conteudo, professor});
  }
  return {
    fileName,
    sheetName,
    columns:resolved,
    detectedColumns:{score:det?.score??-1,headerRow:detectedValid?det.headerRow+1:null,turma:detectedValid&&det.turma!==null?det.turma+1:null,disciplina:detectedValid&&det.disciplina!==null?det.disciplina+1:null,conteudo:detectedValid&&det.conteudo!==null?det.conteudo+1:null,professor:detectedValid&&det.professor!==null&&det.professor!==undefined?det.professor+1:null},
    rawRows:rows,
    records
  };
}

async function applyPayload(payload){
  state.fileName=payload.fileName||'';
  state.sheetName=payload.sheetName||'';
  state.columns=payload.columns||null;
  state.detectedColumns=payload.detectedColumns||payload.columns||null;
  state.rawRows=Array.isArray(payload.rawRows)?payload.rawRows:null;
  state.fileMeta=payload.fileMeta||null;
  state.records=(payload.records||[]).map(r=>({sourceRow:r.sourceRow, turmas:r.turmas||[], disciplina:cleanText(r.disciplina).replace(/;+$/,'').trim(), conteudo:cleanText(r.conteudo), professor:cleanText(r.professor)}));
  state.edits={};
  state.ignoredValidationIds=new Set();
  state.ignoredValidation=[];
  state.zoom=1.1;
  updateZoomControls();
  if(state.columns){
    const signaturePayload={...payload, records:state.records};
    state.currentSignature=await computePayloadSignature(signaturePayload);
    state.legacySignature=await computeLegacyPayloadSignature(signaturePayload);
  }else{
    state.currentSignature='';
    state.legacySignature='';
  }
  const turmaSet=new Set();
  state.records.forEach(r=>r.turmas.forEach(t=>turmaSet.add(t)));
  state.turmas=Array.from(turmaSet).sort(compareTurma);
  state.originalContentByEditKey=buildOriginalContentMap();
  state.selected=new Set(state.turmas);
  state.previewTurma=state.turmas[0]||null;
  renderAll();
  runValidations(false);
  if(state.currentSignature) await checkSavedForCurrentSignature();
}