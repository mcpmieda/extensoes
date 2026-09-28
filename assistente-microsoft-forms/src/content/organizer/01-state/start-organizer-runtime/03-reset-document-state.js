

function resetDocumentState({preserveHeader=true}={}){
  if(state.saveTimer) clearTimeout(state.saveTimer);
  clearTimeout(scheduleRealtimeValidation.timer);
  state.importGeneration++;
  state.fileName=''; state.sheetName=''; state.records=[]; state.turmas=[]; state.selected=new Set(); state.previewTurma=null;
  state.columns=null; state.detectedColumns=null; state.rawRows=null; state.edits={}; state.lastValidation=[]; state.ignoredValidation=[];
  state.ignoredValidationIds=new Set(); state.zoom=1.1; state.currentSignature=''; state.legacySignature=''; state.fileMeta=null;
  state.originalContentByEditKey={}; state.pendingSavedSnapshot=null; state.assessment=defaultAssessmentByToday(); state.fullTitle=''; state.date='';
  state.showDate=true; state.syncEquivalentContents=true;
  state.columnOverrides={headerRow:'',turma:'',disciplina:'',conteudo:'',professor:''};
  state.customStageGroups={sixth:'',seventh:'',eighth:'',ninth:'',extra:''};
  if(!preserveHeader){ delete state.assets.customHeader; }
  hideRestoreBox();
  if(el.fileInput) el.fileInput.value='';
  if(el.headerInput) el.headerInput.value='';
  updateZoomControls();
}
function resetAll(){
  resetDocumentState({preserveHeader:true});
  renderAll();
  el.validationSummary.className='validation-summary neutral';
  el.validationSummary.textContent='Aguardando planilha.';
  el.validationList.innerHTML=''; el.ignoredValidationList.innerHTML=''; el.ignoredValidationBox.classList.add('hidden');
}
async function prepareForNewImport(){
  resetDocumentState({preserveHeader:true});
  renderAll();
  el.validationSummary.className='validation-summary neutral';
  el.validationSummary.textContent='Lendo nova planilha...';
}
async function clearEverything(){
  resetDocumentState({preserveHeader:false});
  await storageClearAppData();
  state.assets.header=await assetToDataUrl('cabecalho.jpg');
  state._assetImages={};
  renderAll();
  el.validationSummary.className='validation-summary neutral';
  el.validationSummary.textContent='Aguardando planilha.';
  el.validationList.innerHTML=''; el.ignoredValidationList.innerHTML=''; el.ignoredValidationBox.classList.add('hidden');
  updateSyncEquivalentControl();
  toast('Todos os dados, planilhas e conteúdos exibidos foram limpos.');
}
function columnOptionLabel(index,value){
  const header=cleanText(value) || 'Coluna sem título';
  const clipped=header.length>58 ? header.slice(0,55)+'…' : header;
  return `${colName(index+1)} — ${clipped}`;
}
function populateColumnSelect(select,field,{optional=false}={}){
  if(!select) return;
  const hasRows=Array.isArray(state.rawRows) && state.rawRows.length>0;
  if(!hasRows){ select.innerHTML='<option value="">Aguardando planilha</option>'; select.disabled=true; return; }
  const headerRow=Number(state.columnOverrides.headerRow || state.columns?.headerRow || state.detectedColumns?.headerRow || 1);
  const headers=state.rawRows[Math.max(0,headerRow-1)] || [];
  const maxCols=Math.max(headers.length,...state.rawRows.map(row=>(row||[]).length),0);
  const selected=state.columnOverrides[field] || state.columns?.[field] || state.detectedColumns?.[field] || '';
  const options=[];
  if(optional){
    options.push(`<option value="" ${selected?'':'selected'}>Não usar coluna de professor</option>`);
  }else{
    options.push(`<option value="" disabled ${selected?'':'selected'}>Selecione a coluna</option>`);
  }
  for(let index=0; index<maxCols; index++){
    const value=String(index+1);
    options.push(`<option value="${value}" ${String(selected)===value?'selected':''}>${escapeHtml(columnOptionLabel(index,headers[index]))}</option>`);
  }
  select.innerHTML=options.join('');
  select.disabled=false;
}
function populateColumnMappingControls(){
  if(el.headerRowInput){
    el.headerRowInput.value=state.columnOverrides.headerRow || state.columns?.headerRow || state.detectedColumns?.headerRow || (state.rawRows?1:'');
    el.headerRowInput.disabled=!state.rawRows;
  }
  populateColumnSelect(el.turmaColInput,'turma');
  populateColumnSelect(el.disciplinaColInput,'disciplina');
  populateColumnSelect(el.conteudoColInput,'conteudo');
  populateColumnSelect(el.professorColInput,'professor',{optional:true});
}

function renderAll(){
  el.fileBadge.textContent = state.fileName ? state.fileName : 'Nenhuma planilha';
  updateHeaderInfo();
  updateSyncEquivalentControl();
  el.assessmentInput.value=state.assessment; if(el.fullTitleInput) el.fullTitleInput.value=state.fullTitle || ''; el.dateInput.value=state.date; el.showDateInput.checked=state.showDate;
  populateColumnMappingControls();
  if(el.group6Input) el.group6Input.value=state.customStageGroups.sixth||'';
  if(el.group7Input) el.group7Input.value=state.customStageGroups.seventh||'';
  if(el.group8Input) el.group8Input.value=state.customStageGroups.eighth||'';
  if(el.group9Input) el.group9Input.value=state.customStageGroups.ninth||'';
  if(el.groupExtraInput) el.groupExtraInput.value=state.customStageGroups.extra||'';
  updateFullTitlePlaceholder();
  if(state.columns){
    const meta=state.fileMeta||{};
    const size=meta.size ? formatFileSize(meta.size) : '';
    const mod=meta.lastModified ? new Date(meta.lastModified).toLocaleString('pt-BR') : '';
    const identity=state.currentSignature ? `<br><b>Identificação segura:</b> dados ${shortHash(state.currentSignature)}${meta.rawFileHash ? ` · arquivo ${shortHash(meta.rawFileHash)}` : ''}${size ? ` · ${escapeHtml(size)}` : ''}${mod ? ` · modificado em ${escapeHtml(mod)}` : ''}` : '';
    const professorInfo=state.columns.professor ? ` · <b>Professor:</b> ${colName(state.columns.professor)}` : '';
    el.columnsInfo.innerHTML=`Mapeamento em uso:<br><b>Turma:</b> ${colName(state.columns.turma)} · <b>Disciplina:</b> ${colName(state.columns.disciplina)} · <b>Conteúdo:</b> ${colName(state.columns.conteudo)}${professorInfo} · <b>Cabeçalho:</b> linha ${state.columns.headerRow}${identity}`;
  }else if(state.rawRows){
    el.columnsInfo.innerHTML='<b>Planilha carregada.</b><br>Selecione a linha do cabeçalho e as colunas de turma, disciplina e conteúdo em Mais configurações.';
  }else{
    el.columnsInfo.textContent='Aguardando planilha.';
  }
  renderTurmas(); renderPreviewTabs(); renderPreview({resetPosition:true});
}

function renderTurmas(){
  el.turmaCount.textContent=String(state.turmas.length);
  if(!state.turmas.length){
    el.turmaList.className='turma-list empty';
    el.turmaList.textContent='Nenhuma turma carregada.';
    el.suffixActions.innerHTML='';
    return;
  }
  el.turmaList.className='turma-list grouped';
  const configured=[
    {label:'6º ano', values:parseGroupList(state.customStageGroups.sixth)},
    {label:'7º ano', values:parseGroupList(state.customStageGroups.seventh)},
    {label:'8º ano', values:parseGroupList(state.customStageGroups.eighth)},
    {label:'9º ano', values:parseGroupList(state.customStageGroups.ninth)},
    {label:'Outros grupos', values:parseGroupList(state.customStageGroups.extra)}
  ];
  const consumed=new Set();
  const groups=[];
  for(const cfg of configured){
    const turmas=cfg.values.filter(t=>state.turmas.includes(t) && !consumed.has(t));
    if(turmas.length){ turmas.forEach(t=>consumed.add(t)); groups.push({suffix:'', label:cfg.label, turmas:turmas.sort(compareTurma)}); }
  }
  const remaining=state.turmas.filter(t=>!consumed.has(t));
  const suffixes=Array.from(new Set(remaining.map(suffixOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
  const noSuffix=remaining.filter(t=>!suffixOf(t));
  suffixes.forEach(s=>groups.push({suffix:s, label:`Turma ${s}`, turmas:remaining.filter(t=>suffixOf(t)===s).sort(compareTurma)}));
  if(noSuffix.length) groups.push({suffix:'', label:'Outras', turmas:noSuffix.sort(compareTurma)});
  el.turmaList.innerHTML=groups.map(g=>`
    <div class="turma-group" data-suffix="${escapeAttr(g.suffix)}">
      <div class="turma-group-title">${escapeHtml(g.label)}</div>
      <div class="turma-group-items">
        ${g.turmas.map(t=>`<label class="turma-item"><input type="checkbox" data-turma="${escapeAttr(t)}" ${state.selected.has(t)?'checked':''}><span>${escapeHtml(t)}</span></label>`).join('')}
      </div>
    </div>`).join('');
  el.turmaList.querySelectorAll('input').forEach(ch=>ch.addEventListener('change',()=>{ const t=ch.dataset.turma; if(ch.checked) state.selected.add(t); else state.selected.delete(t); runValidations(false); scheduleSaveCurrentState(); }));
  el.suffixActions.innerHTML=suffixes.map((s,idx)=>`<button class="mini" data-suffix="${s}" title="Marcar turmas da coluna ${idx+1}">Marcar coluna ${idx+1}</button>`).join('');
  el.suffixActions.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{ const s=btn.dataset.suffix; state.turmas.filter(t=>suffixOf(t)===s).forEach(t=>state.selected.add(t)); renderTurmas(); runValidations(false); scheduleSaveCurrentState(); }));
}

function renderPreviewTabs(){
  const problemTurmas=new Set((state.lastValidation||[]).filter(i=>i.type==='error' && i.turma).map(i=>i.turma));
  el.previewTabs.innerHTML=state.turmas.map(t=>{
    const cls=['tab-btn'];
    if(t===state.previewTurma) cls.push('active');
    if(problemTurmas.has(t)) cls.push('has-error');
    const active=t===state.previewTurma;
    return `<button class="${cls.join(' ')}" data-turma="${escapeAttr(t)}" type="button" role="tab" aria-selected="${active}" tabindex="${active?0:-1}">${escapeHtml(t)}</button>`;
  }).join('');
  updateFullTitlePlaceholder();
  el.previewTabs.querySelectorAll('button').forEach((btn,index)=>{
    btn.addEventListener('pointerdown',()=>{ clearTimeout(scheduleRealtimeValidation.timer); });
    btn.addEventListener('click',()=>{ state.previewTurma=btn.dataset.turma; renderPreviewTabs(); renderPreview({resetPosition:true, slide:'right'}); });
    btn.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const buttons=Array.from(el.previewTabs.querySelectorAll('button'));
      let next=index;
      if(event.key==='ArrowLeft') next=(index-1+buttons.length)%buttons.length;
      if(event.key==='ArrowRight') next=(index+1)%buttons.length;
      if(event.key==='Home') next=0;
      if(event.key==='End') next=buttons.length-1;
      buttons[next]?.click();
      buttons[next]?.focus();
    });
  });
}

function getItemsForTurma(turma){
  const map=new Map();
  for(const r of state.records){
    if(!r.turmas.includes(turma)) continue;
    const disc=cleanText(r.disciplina)||'DISCIPLINA NÃO INFORMADA';
    const key=normKey(disc);
    if(!map.has(key)) map.set(key,{disciplina:disc, contents:[], rows:[]});
    const item=map.get(key); item.contents.push(cleanText(r.conteudo)); item.rows.push(r.sourceRow);
  }
  const items=Array.from(map.values()).sort((a,b)=>compareDisc(a.disciplina,b.disciplina));
  for(const it of items){
    const editKey=`${turma}|||${normKey(it.disciplina)}`;
    it.conteudo = state.edits[editKey] !== undefined ? state.edits[editKey] : it.contents.filter(Boolean).join('\n\n');
    it.duplicated = it.contents.length>1;
  }
  return items;
}

function buildReportPage(turma, opts={preview:false}){
  const page=document.createElement('div');
  page.className='report-page'+(opts.preview?' preview':'');
  page.dataset.turma=turma;
  const items=getItemsForTurma(turma);
  page.innerHTML=`
    <img class="watermark" src="${state.assets.logo||''}" alt="">
    <div class="report-content">
      <img class="school-header" src="${state.assets.header||''}" alt="Cabeçalho">
      <div class="title-red">${escapeHtml(reportTitle(turma))}</div>
      ${shouldDisplayDate()?`<div class="date-blue">DATA: ${escapeHtml(displayDate(state.date))}</div>`:''}
      <table class="content-table"><tbody>
        ${items.map(it=>`<tr data-disc-key="${escapeAttr(normKey(it.disciplina))}" data-rows="${escapeAttr(it.rows.join(','))}"><td class="disc">${escapeHtml(it.disciplina)}</td><td class="cont" ${opts.preview?'contenteditable="true" spellcheck="true"':''}>${escapeHtml(it.conteudo)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="edit-note">Clique no texto para editar antes de baixar.</div>`;
  if(opts.preview){
    page.querySelectorAll('.cont[contenteditable]').forEach(cell=>{
      let syncSession=null;
      const editKey=()=>{
        const tr=cell.closest('tr');
        return `${turma}|||${tr.dataset.discKey}`;
      };
      const startSyncSession=()=>{
        const key=editKey();
        const baseline=currentEditValue(key);
        syncSession={
          key,
          baseline,
          targets:collectEquivalentEditTargets(key,baseline),
          changed:false
        };
      };
      cell.addEventListener('focus',startSyncSession);
      cell.addEventListener('input',()=>{
        const key=editKey();
        if(!syncSession || syncSession.key!==key) startSyncSession();
        const value=cleanText(cell.innerText);
        applyEditValueByKey(key,value);
        if(state.syncEquivalentContents && syncSession){
          for(const targetKey of syncSession.targets) applyEditValueByKey(targetKey,value);
          syncSession.changed=value!==syncSession.baseline;
        }
        scheduleRealtimeValidation();
        scheduleSaveCurrentState();
      });
      cell.addEventListener('blur',()=>{
        const syncedCount=state.syncEquivalentContents && syncSession?.changed ? syncSession.targets.length : 0;
        syncSession=null;
        // O clique em outra turma ocorre depois do evento blur.
        // Adiar a validação evita reconstruir as guias antes que o primeiro clique seja concluído.
        setTimeout(()=>{
          runValidations(false);
          saveCurrentStateNow().catch(console.error);
          if(syncedCount>0) toast(`Alteração sincronizada com ${syncedCount} outra(s) turma(s).`);
        },0);
      });
    });
  }
  return page;
}

function fitReportPage(page){
  page.classList.remove('fit1','fit2','fit3','fit4');
  for(const cls of ['fit1','fit2','fit3','fit4']){
    if(page.scrollHeight <= page.clientHeight + 2) break;
    page.classList.add(cls);
  }
}

function renderPreview(options={}){
  el.reportPreview.innerHTML='';
  if(!state.previewTurma){
    el.previewHint.classList.remove('hidden');
    el.previewHint.textContent=state.rawRows
      ? 'Configure as colunas obrigatórias em Mais configurações para montar a prévia.'
      : 'Selecione uma planilha para ver a prévia.';
    resetPreviewViewport();
    return;
  }
  el.previewHint.classList.add('hidden');
  const frame=document.createElement('div');
  frame.className='report-frame';
  const page=buildReportPage(state.previewTurma,{preview:true});
  if(options.slide==='right') page.classList.add('sliding-right');
  frame.appendChild(page);
  el.reportPreview.appendChild(frame);
  const scaleOptions={resetPosition:Boolean(options.resetPosition),preserveCenter:Boolean(options.preserveCenter)};
  fitReportPage(page);
  scalePreviewFrame(frame,page,scaleOptions);
  requestAnimationFrame(()=>{ fitReportPage(page); scalePreviewFrame(frame,page,scaleOptions); });
}