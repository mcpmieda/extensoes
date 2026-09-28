

function clampScroll(value,maximum){ return Math.min(Math.max(0,value),Math.max(0,maximum)); }

function resetPreviewViewport(){
  if(!el.previewScroll) return;
  const apply=()=>{ el.previewScroll.scrollTop=0; const maxLeft=Math.max(0,el.previewScroll.scrollWidth-el.previewScroll.clientWidth); el.previewScroll.scrollLeft=maxLeft/2; };
  apply();
  requestAnimationFrame(apply);
  clearTimeout(resetPreviewViewport.timer);
  resetPreviewViewport.timer=setTimeout(apply,70);
}

function updateZoomControls(){
  if(!el.zoomValue) return;
  el.zoomValue.textContent=`${Math.round(state.zoom*100)}%`;
  el.zoomOutBtn.disabled=state.zoom<=.5;
  el.zoomInBtn.disabled=state.zoom>=1.8;
}

function setZoom(value){
  const previous=state.zoom;
  state.zoom=Math.round(Math.min(1.8,Math.max(.5,Number(value)||1))*10)/10;
  updateZoomControls();
  const frame=el.reportPreview && el.reportPreview.querySelector('.report-frame');
  const page=frame && frame.querySelector('.report-page');
  if(page && state.zoom!==previous){
    page.classList.remove('zooming-in','zooming-out');
    void page.offsetWidth;
    page.classList.add(state.zoom>previous?'zooming-in':'zooming-out');
    clearTimeout(setZoom.effectTimer);
    setZoom.effectTimer=setTimeout(()=>page.classList.remove('zooming-in','zooming-out'),320);
  }
  if(frame && page) scalePreviewFrame(frame,page,{preserveCenter:true});
}

function scalePreviewFrame(frame,page,options={}){
  if(!frame || !page || !el.reportPreview || !el.previewScroll) return;
  const oldWidth=Math.max(1,el.previewScroll.scrollWidth);
  const oldHeight=Math.max(1,el.previewScroll.scrollHeight);
  const centerX=(el.previewScroll.scrollLeft+el.previewScroll.clientWidth/2)/oldWidth;
  const centerY=(el.previewScroll.scrollTop+el.previewScroll.clientHeight/2)/oldHeight;
  const naturalW=794;
  const naturalH=1123;
  const availableW=Math.max(260,el.previewScroll.clientWidth-24);
  const availableH=Math.max(300,el.previewScroll.clientHeight-24);
  const usableW=Math.max(240,availableW-20);
  const usableH=Math.max(280,availableH-20);
  const fitScale=Math.min(1,usableW/naturalW,usableH/naturalH);
  state.fitScale=fitScale;
  const scale=state.zoom>1 ? state.zoom : fitScale*state.zoom;
  const scaledW=Math.ceil(naturalW*scale);
  const scaledH=Math.ceil(naturalH*scale);
  frame.style.width=scaledW+'px';
  frame.style.height=scaledH+'px';
  page.style.setProperty('--org-scale', String(scale));
  page.style.transform=`scale(${scale})`;
  const stack=el.reportPreview.parentElement;
  const contentW=Math.max(availableW,scaledW+20);
  const contentH=Math.max(availableH,scaledH+20);
  stack.style.width=contentW+'px';
  stack.style.height=contentH+'px';
  el.reportPreview.style.width=contentW+'px';
  el.reportPreview.style.height=contentH+'px';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(options.resetPosition){ resetPreviewViewport(); return; }
    const maxTop=Math.max(0,el.previewScroll.scrollHeight-el.previewScroll.clientHeight);
    const maxLeft=Math.max(0,el.previewScroll.scrollWidth-el.previewScroll.clientWidth);
    if(options.preserveCenter){
      el.previewScroll.scrollTop=clampScroll(centerY*el.previewScroll.scrollHeight-el.previewScroll.clientHeight/2,maxTop);
      el.previewScroll.scrollLeft=clampScroll(centerX*el.previewScroll.scrollWidth-el.previewScroll.clientWidth/2,maxLeft);
    }else{
      el.previewScroll.scrollTop=clampScroll(el.previewScroll.scrollTop,maxTop);
      el.previewScroll.scrollLeft=clampScroll(el.previewScroll.scrollLeft,maxLeft);
    }
  }));
}


function canonicalDisciplineKey(disciplina){
  const k=normKey(disciplina);
  if(!k) return '';
  if(/^(LINGUA\s+)?PORTUGUES(A)?$/.test(k) || k==='PORTUGUES') return 'PORTUGUES';
  if(/^MATEMATICA/.test(k)) return 'MATEMATICA';
  if(/^CIENCIAS(\s+DA\s+NATUREZA)?/.test(k)) return 'CIENCIAS';
  if(/^HISTORIA/.test(k)) return 'HISTORIA';
  if(/^GEOGRAFIA/.test(k)) return 'GEOGRAFIA';
  if(/^(LINGUA\s+)?INGLESA?$/.test(k) || k==='INGLES') return 'INGLES';
  if(/^ARTE(S)?$/.test(k)) return 'ARTE';
  if(/^EDUCACAO\s+FISICA/.test(k)) return 'EDUCACAO FISICA';
  if(/^EDUCACAO\s+RELIGIOSA/.test(k) || /^ENSINO\s+RELIGIOSO/.test(k)) return 'EDUCACAO RELIGIOSA';
  if(/^ETICA(\s+E\s+CIDADANIA)?/.test(k)) return 'ETICA E CIDADANIA';
  if(/^REDACAO/.test(k) || /^PRODUCAO\s+TEXTUAL/.test(k)) return 'REDACAO';
  if(/^COMPUTACAO/.test(k) || /^INFORMATICA/.test(k)) return 'COMPUTACAO';
  return k;
}

function preferredDisciplineName(names){
  const counts=new Map();
  for(const n of names||[]){
    const clean=cleanText(n);
    if(!clean) continue;
    counts.set(clean,(counts.get(clean)||0)+1);
  }
  const ranked=Array.from(counts.entries()).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'pt-BR',{sensitivity:'base'}));
  return ranked.length ? ranked[0][0] : 'Disciplina';
}

function addMissingDisciplineValidations(items){
  if(!state.records.length || state.turmas.length<2) return;
  const turmaMaps=new Map();
  const disciplineStats=new Map();
  for(const turma of state.turmas){
    const map=new Map();
    for(const it of getItemsForTurma(turma)){
      const discKey=canonicalDisciplineKey(it.disciplina);
      if(!discKey) continue;
      if(!map.has(discKey)) map.set(discKey,{names:[],rows:[]});
      const entry=map.get(discKey);
      entry.names.push(it.disciplina);
      entry.rows.push(...(it.rows||[]));
      if(!disciplineStats.has(discKey)) disciplineStats.set(discKey,{names:[],turmas:new Set()});
      const stats=disciplineStats.get(discKey);
      stats.names.push(it.disciplina);
      stats.turmas.add(turma);
    }
    turmaMaps.set(turma,map);
  }
  for(const [discKey,stats] of disciplineStats.entries()){
    if(!stats.turmas.size || stats.turmas.size===state.turmas.length) continue;
    const disciplina=preferredDisciplineName(stats.names);
    const presentTurmas=Array.from(stats.turmas).sort(compareTurma);
    const presentList=presentTurmas.join(', ');
    for(const turma of state.turmas){
      if(stats.turmas.has(turma)) continue;
      const issueId=`missing-discipline|||${normKey(turma)}|||${discKey}`;
      items.push({
        type:'error',
        title:`${turma}: falta ${disciplina}`,
        message:`${disciplina} possui conteúdo em ${presentList}, mas não aparece em ${turma}. Como o padrão é todas as disciplinas terem conteúdo em todas as turmas, confira esse preenchimento.`,
        turma,
        disciplina,
        missingDiscipline:true,
        ignorable:true,
        issueId
      });
    }
  }
}

function measureReportLayout(turma){
  try{
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    const layout=computeCanvasLayout(ctx,getItemsForTurma(turma),shouldDisplayDate());
    return {overflow:layout.totalRowsH>layout.tableMaxH+1,compact:layout.contentFont<11 || layout.discFont<9.5,fontSize:layout.contentFont};
  }catch(error){
    console.warn('Não foi possível medir a ocupação do relatório:',error);
    return {overflow:false,compact:false,fontSize:19.5};
  }
}

function runValidations(showToast=false){
  const items=[];
  const selected=Array.from(state.selected);
  const hasWorkbook=Array.isArray(state.rawRows) && state.rawRows.length>0;
  if(!hasWorkbook && !state.records.length){
    items.push({type:'error',title:'Selecione a planilha',message:'Escolha uma planilha antes de baixar os relatórios.',turma:null});
  }
  if(hasWorkbook && !state.columns){
    items.push({type:'error',title:'Configure as colunas obrigatórias',message:'Selecione a linha do cabeçalho e as colunas de turma, disciplina e conteúdo em Mais configurações.',turma:null});
  }
  if(!cleanText(state.assessment)) items.push({type:'error',title:'Nome da avaliação vazio',message:'Preencha o nome da avaliação antes de baixar os relatórios.',turma:null});
  if(state.columns && state.records.length && !selected.length) items.push({type:'error',title:'Nenhuma turma marcada',message:'Marque pelo menos uma turma para baixar.',turma:null});
  for(const r of state.records){
    if(!r.turmas.length) items.push({type:'error',title:`Linha ${r.sourceRow}: falta turma`,message:'Esta linha da planilha está sem turma.',row:r.sourceRow});
    if(!cleanText(r.disciplina)) items.push({type:'error',title:`Linha ${r.sourceRow}: falta disciplina`,message:'Esta linha está sem disciplina.',row:r.sourceRow,turma:r.turmas[0]});
    if(!cleanText(r.conteudo)) items.push({type:'error',title:`Linha ${r.sourceRow}: falta conteúdo`,message:'Esta linha está sem conteúdo.',row:r.sourceRow,turma:r.turmas[0],disciplina:r.disciplina});
  }
  const group=new Map();
  for(const r of state.records){
    for(const t of r.turmas){
      const k=`${t}|||${normKey(r.disciplina)}`;
      if(!group.has(k)) group.set(k,{turma:t,disciplina:r.disciplina,rows:[],contents:[]});
      const entry=group.get(k);
      entry.rows.push(r.sourceRow);
      entry.contents.push(cleanText(r.conteudo));
    }
  }
  for(const g of group.values()){
    if(g.rows.length>1){
      const editKey=`${g.turma}|||${normKey(g.disciplina)}`;
      const hasEdit=state.edits[editKey] !== undefined;
      const normalizedContents=g.contents.map(normKey).filter(Boolean);
      const exactDuplicate=new Set(normalizedContents).size<normalizedContents.length;
      items.push({
        type:exactDuplicate && !hasEdit?'error':'warn',
        title:`${g.turma}: ${g.disciplina} aparece em mais de uma linha`,
        message:exactDuplicate && !hasEdit
          ? `Existe conteúdo idêntico repetido para ${g.disciplina} nas linhas ${g.rows.join(', ')}. Revise para evitar duplicação no relatório.`
          : hasEdit
            ? `Há mais de uma linha para ${g.disciplina}. O texto consolidado e editado na prévia será usado.`
            : `Há mais de uma linha para ${g.disciplina} (linhas ${g.rows.join(', ')}). Os conteúdos serão consolidados no mesmo campo.`,
        turma:g.turma,
        disciplina:g.disciplina,
        rows:g.rows
      });
    }
  }
  addMissingDisciplineValidations(items);
  for(const t of selected){
    const pageItems=getItemsForTurma(t);
    if(!pageItems.length) items.push({type:'error',title:`${t}: sem conteúdo`,message:'Esta turma está marcada, mas não tem conteúdo para gerar.',turma:t});
    for(const it of pageItems){
      const editKey=`${t}|||${normKey(it.disciplina)}`;
      if(state.edits[editKey]!==undefined && !cleanText(it.conteudo)){
        items.push({type:'error',title:`${t}: ${it.disciplina} sem conteúdo`,message:'O conteúdo desta disciplina foi apagado na prévia. Preencha o texto ou restaure o conteúdo original antes de baixar.',turma:t,disciplina:it.disciplina});
      }
    }
    const layoutStatus=measureReportLayout(t);
    if(layoutStatus.overflow){
      items.push({type:'error',title:`${t}: conteúdo não cabe em uma página`,message:'Mesmo após a redução automática da fonte, o relatório ultrapassa a área imprimível. Resuma algum conteúdo antes de baixar.',turma:t});
    }else if(layoutStatus.compact){
      items.push({type:'warn',title:`${t}: relatório muito compacto`,message:`O relatório caberá em uma página, mas usará fonte reduzida (${layoutStatus.fontSize.toFixed(1).replace('.',',')} px). Confira a legibilidade na prévia.`,turma:t});
    }
  }
  const validIssueIds=new Set(items.filter(i=>i.ignorable&&i.issueId).map(i=>i.issueId));
  let pruned=false;
  for(const id of Array.from(state.ignoredValidationIds)){ if(!validIssueIds.has(id)){ state.ignoredValidationIds.delete(id); pruned=true; } }
  const ignored=items.filter(i=>i.ignorable&&i.issueId&&state.ignoredValidationIds.has(i.issueId));
  const active=items.filter(i=>!(i.ignorable&&i.issueId&&state.ignoredValidationIds.has(i.issueId)));
  state.lastValidation=active;
  state.ignoredValidation=ignored;
  renderValidation(active,ignored);
  renderPreviewTabs();
  if(pruned) scheduleSaveCurrentState();
  if(showToast){
    const ignoredText=ignored.length?` · ${ignored.length} ignorado(s)`:'';
    toast(active.length?`Validação concluída: ${active.length} pendência(s) ativa(s)${ignoredText}.`:`Validação concluída: nenhuma pendência ativa${ignoredText}.`);
  }
  return active;
}

function renderValidation(items,ignored=[]){
  const errors=items.filter(i=>i.type==='error').length;
  const warns=items.filter(i=>i.type==='warn').length;
  if(!items.length){
    el.validationSummary.className='validation-summary ok';
    el.validationSummary.textContent=ignored.length?`Nenhum erro ativo. ${ignored.length} erro(s) ignorado(s).`:'Tudo certo. Nenhum erro encontrado.';
    el.validationList.innerHTML='';
  }else{
    el.validationSummary.className='validation-summary '+(errors?'error':'warn');
    const ignoredText=ignored.length?` · ${ignored.length} ignorado(s)`:'';
    el.validationSummary.textContent=errors?`${errors} erro(s) e ${warns} aviso(s) encontrados${ignoredText}.`:`${warns} aviso(s) encontrados${ignoredText}.`;
    el.validationList.innerHTML=items.map((it,idx)=>{
      const canGo=it.turma||it.disciplina||it.row;
      const ignoreButton=it.ignorable&&it.issueId?`<button class="ignore-error" data-idx="${idx}">Ignorar</button>`:'';
      const goButton=canGo?`<button class="go-error" data-idx="${idx}">Ir para erro</button>`:'';
      return `<div class="validation-item ${it.type==='error'?'error':''}"><div class="row"><strong>${escapeHtml(it.title)}</strong><div class="validation-actions">${goButton}${ignoreButton}</div></div><div>${escapeHtml(it.message)}</div></div>`;
    }).join('');
    el.validationList.querySelectorAll('.go-error').forEach(btn=>btn.addEventListener('click',()=>goToValidation(items[Number(btn.dataset.idx)])));
    el.validationList.querySelectorAll('.ignore-error').forEach(btn=>btn.addEventListener('click',()=>ignoreValidation(items[Number(btn.dataset.idx)])));
  }
  if(ignored.length){
    el.ignoredValidationBox.classList.remove('hidden');
    el.ignoredValidationCount.textContent=String(ignored.length);
    el.ignoredValidationList.innerHTML=ignored.map((it,idx)=>`<div class="validation-item ignored"><div class="row"><strong>${escapeHtml(it.title)}</strong><div class="validation-actions"><button class="go-error" data-ignored-idx="${idx}">Ir para turma</button><button class="restore-error" data-ignored-idx="${idx}">Reativar</button></div></div><div>${escapeHtml(it.message)}</div></div>`).join('');
    el.ignoredValidationList.querySelectorAll('.go-error').forEach(btn=>btn.addEventListener('click',()=>goToValidation(ignored[Number(btn.dataset.ignoredIdx)])));
    el.ignoredValidationList.querySelectorAll('.restore-error').forEach(btn=>btn.addEventListener('click',()=>restoreIgnoredValidation(ignored[Number(btn.dataset.ignoredIdx)])));
  }else{
    el.ignoredValidationBox.classList.add('hidden');
    el.ignoredValidationCount.textContent='0';
    el.ignoredValidationList.innerHTML='';
  }
}