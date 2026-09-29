
  function updateLotFormState(){
    if(!els.lotFiles)return;
    const files=[...(els.lotFiles.files||[])],name=clean(els.lotName?.value),date=clean(els.lotDate?.value),validDate=isValidDateInput(date),ready=Boolean(name&&validDate&&files.length);
    els.createLot.disabled=!ready;
    els.lotUpload.classList.toggle('has-files',files.length>0);
    els.lotFileList.hidden=!files.length;
    if(files.length){
      els.lotFileTitle.textContent=`${files.length} arquivo(s) selecionado(s)`;
      els.lotFileHint.textContent='Clique aqui para substituir a seleção.';
      els.lotFileList.textContent=files.map(file=>file.name).join(' · ');
    }else{
      els.lotFileTitle.innerHTML='Selecionar arquivos do EvalBee<span class="required-mark">*</span>';
      els.lotFileHint.textContent='Um arquivo por turma; vários arquivos formam um lote.';
      els.lotFileList.textContent='';
    }
    const missing=[];
    if(!name)missing.push('nome');
    if(!date)missing.push('data');else if(!validDate)missing.push('data válida');
    if(!files.length)missing.push('arquivos');
    els.lotFormHelp.textContent=missing.length?`Para cadastrar, complete: ${missing.join(', ')}.`:'Tudo pronto. Clique em “Cadastrar lote”.';
    els.lotFormHelp.classList.toggle('invalid',missing.length>0);
  }
  function clearLotForm(showMessage=false){
    if(els.lotName)els.lotName.value='';
    if(els.lotDate)els.lotDate.value='';
    if(els.lotFiles)els.lotFiles.value='';
    updateLotFormState();
    if(showMessage)showToast('Campos do novo lote limpos.');
  }
  async function createLotFromSelection(){
    const files=[...(els.lotFiles?.files||[])],name=clean(els.lotName?.value),date=clean(els.lotDate?.value);
    if(!name||!isValidDateInput(date)||!files.length){updateLotFormState();return showToast('Preencha o nome, selecione uma data válida e adicione os arquivos do lote.');}
    if(!globalThis.XLSX)return showToast('O leitor de planilhas ainda não foi carregado. Aguarde alguns segundos e tente novamente.');
    els.createLot.disabled=true;els.createLot.textContent='LENDO ARQUIVOS…';
    try{
      const parsed=[];
      for(const file of files){
        const item=await parseLotFile(file);
        if(!item.students.length)throw new Error(`${file.name}: nenhum aluno válido foi encontrado.`);
        parsed.push(item);
      }
      const lot=buildLot(name,date,parsed);
      if(!lot.students.length)throw new Error('Nenhum aluno válido foi encontrado nos arquivos selecionados.');
      const identityAudit=lot.identityAudit||auditLotIdentities(lot);
      if(identityAudit.blockingRecords>0&&!confirm(`Foram encontrados ${identityAudit.blockingRecords} registro(s) com número duplicado ou identidade ambígua. Eles serão bloqueados nas comparações. Deseja cadastrar o lote mesmo assim?`))return;
      const existing=state.lots.find(item=>item.id===lot.id);
      if(existing&&!confirm(`Já existe o lote “${existing.name}” na data ${formatDateLabel(existing.date)}. Deseja substituí-lo?`))return;
      let persisted=true;
      if(existing)lot._gssfRevision=Math.max(0,Number(existing._gssfRevision)||0);
      try{await lotDbPut(lot)}catch(error){
        if(existing){console.warn(error);return showToast(error?.code==='CONFLICT'?'Este lote mudou em outra aba. Reabra a Impressão antes de substituí-lo.':'Não foi possível substituir o lote salvo.')}
        persisted=false;lot.sessionOnly=true;console.warn('Persistência indisponível; lote mantido somente nesta sessão.',error);
      }
      state.lots=state.lots.filter(item=>item.id!==lot.id);
      state.lots.push(lot);sortLots();clearLotForm();
      const latestInsertedReference=visibleLots().slice().sort(compareLotsByDate).at(-1)||lot;
      activateLot(latestInsertedReference.id,{silent:true,preserveStudent:false});
      showToast(persisted?`Lote “${name}” cadastrado com ${lot.students.length} alunos. O lote visível mais recente foi selecionado automaticamente para impressão.`:`Lote “${name}” carregado nesta sessão. O lote visível mais recente foi selecionado automaticamente, mas não pôde ser salvo permanentemente.`);
    }catch(error){
      console.error(error);showToast(`Falha ao ler os arquivos: ${error.message}`);
    }finally{
      els.createLot.textContent='CADASTRAR LOTE';updateLotFormState();
    }
  }
  async function parseLotFile(file){
    const workbook=await gssfReadSpreadsheetWorkbook(file,XLSX,{cellDates:false,cellNF:false,cellText:true});
    const sheetName=workbook.SheetNames.includes('Reports')?'Reports':workbook.SheetNames[0];
    const sheet=workbook.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:false});
    const detected=detectHeaderAndMapping(rows),mapping=detected.mapping||{};
    if(!Number.isInteger(mapping.rollCol)||!Number.isInteger(mapping.nameCol))throw new Error(`${file.name}: cabeçalho Roll No/Name não encontrado.`);
    const headerRow=Math.max(1,detected.headerRow||1),headers=(rows[headerRow-1]||[]).map(clean),qMap=new Map();
    headers.forEach((header,index)=>{
      const match=String(header).match(/^Q\s*(\d+)\s+(Options|Key|Marks)$/i);
      if(!match)return;
      const question=Number(match[1]),kind=match[2].toLowerCase();
      if(!qMap.has(question))qMap.set(question,{});
      qMap.get(question)[kind]=index;
    });
    if(!qMap.size)throw new Error(`${file.name}: nenhuma coluna de questão foi reconhecida. Verifique se existem cabeçalhos como “Q1 Options” e “Q1 Key”.`);
    const incomplete=[...qMap].filter(([,columns])=>columns.options==null||columns.key==null).map(([question])=>question).sort((a,b)=>a-b);
    if(incomplete.length)throw new Error(`${file.name}: colunas incompletas nas questões ${incomplete.slice(0,12).map(question=>`Q${question}`).join(', ')}${incomplete.length>12?'…':''}. Cada questão precisa de Options e Key.`);
    const qCount=Math.max(...qMap.keys()),missing=[],students=[];
    gssfAssertQuestionCount(Math.max(qCount,qMap.size),file.name);
    for(let question=1;question<=qCount;question++)if(!qMap.has(question))missing.push(question);
    if(missing.length)throw new Error(`${file.name}: sequência de questões incompleta. Não foram encontradas ${missing.slice(0,12).map(question=>`Q${question}`).join(', ')}${missing.length>12?'…':''}.`);
    for(let rowIndex=headerRow;rowIndex<rows.length;rowIndex++){
      const row=rows[rowIndex]||[],name=clean(row[mapping.nameCol]),roll=clean(row[mapping.rollCol]);
      if(!name&&!roll)continue;
      const exam=Number.isInteger(mapping.classCol)?clean(row[mapping.classCol]):'';
      const className=normalizeClass(exam||file.name.replace(/\.[^.]+$/,''));
      const questions={};
      for(const [number,columns] of qMap){
        const option=clean(row[columns.options]),key=clean(row[columns.key]),marks=columns.marks==null?0:toNumeric(row[columns.marks]);
        const blank=!option,multi=/[,;/]|\b[A-D]\s+[A-D]\b/i.test(option),same=normalizeAnswerOption(option)===normalizeAnswerOption(key);
        questions[number]={option,key,marks,blank,multi,correct:!blank&&!multi&&(marks>0||same)};
      }
      const derivedCorrect=Object.values(questions).filter(item=>item.correct).length;
      const derivedBlank=Object.values(questions).filter(item=>item.blank).length;
      const derivedIncorrect=qCount?Math.max(0,qCount-derivedCorrect-derivedBlank):0;
      const correct=Number.isInteger(mapping.correctCol)?Math.max(0,toNumeric(row[mapping.correctCol])):derivedCorrect;
      const blank=Number.isInteger(mapping.blankCol)?Math.max(0,toNumeric(row[mapping.blankCol])):derivedBlank;
      const incorrect=Number.isInteger(mapping.incorrectCol)?Math.max(0,toNumeric(row[mapping.incorrectCol])):derivedIncorrect;
      const total=Number.isInteger(mapping.totalCol)?clean(row[mapping.totalCol]):'';
      const totalQuestions=qCount||correct+incorrect+blank;
      students.push({id:lotUid(),className,roll,name,total,correct,incorrect,blank,questionCount:totalQuestions,questions,fileName:file.name});
    }
    const className=students[0]?.className||normalizeClass(file.name.replace(/\.[^.]+$/,''));
    return{fileName:file.name,sheetName,className,questionCount:Math.max(qCount,...students.map(item=>item.questionCount||0)),students,headers};
  }
  function buildLot(name,date,files){
    const classMap=new Map();
    for(const file of files){
      if(!classMap.has(file.className))classMap.set(file.className,{name:file.className,questionCount:file.questionCount,students:[],files:[]});
      const group=classMap.get(file.className);
      group.students.push(...file.students.map(student=>({...student,className:file.className})));
      group.files.push(file.fileName);group.questionCount=Math.max(group.questionCount,file.questionCount);
    }
    const classes=[...classMap.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
    const lot={id:stableLotId(name,date),name,date,createdAt:new Date().toISOString(),files:files.map(file=>({fileName:file.fileName,className:file.className,questionCount:file.questionCount,studentCount:file.students.length})),classes,students:classes.flatMap(group=>group.students),manualMatches:{}};
    lot.identityAudit=auditLotIdentities(lot);
    return lot;
  }
  function normalizeStoredLot(lot){
    if(!lot||!lot.id||!Array.isArray(lot.classes))return false;
    lot.classes.forEach(group=>{group.students=(group.students||[]).map(student=>({...student,id:student.id||lotUid(),className:student.className||group.name,correct:Math.max(0,toNumeric(student.correct)),incorrect:Math.max(0,toNumeric(student.incorrect)),blank:Math.max(0,toNumeric(student.blank)),questionCount:Math.max(0,toNumeric(student.questionCount))}))});
    lot.students=lot.classes.flatMap(group=>group.students);
    lot.manualMatches=lot.manualMatches&&typeof lot.manualMatches==='object'?lot.manualMatches:{};
    lot.identityAudit=auditLotIdentities(lot);
    return true;
  }
  function renderLots(){
    normalizeHiddenLotIds();
    const ordered=state.lots.slice().sort(compareLotsByDate),reference=conferenceReferenceLot(),targets=conferenceHistoricalLots(reference),active=selectedLot(),referenceDatasets=conferenceReferenceDatasets(),hasReference=Boolean(reference&&referenceDatasets.some(dataset=>dataset.students.length));
    const audits=new Map();
    if(hasReference)targets.forEach(lot=>audits.set(lot.id,auditCurrentAgainstLot(lot,referenceDatasets)));
    const aggregate={exact:0,adjusted:0,blocked:0,notFound:0,transferred:0,manual:0,total:0};
    audits.forEach(audit=>Object.keys(aggregate).forEach(key=>aggregate[key]+=audit[key]||0));
    if(els.lotStatus){
      if(!ordered.length)els.lotStatus.innerHTML='<strong>Nenhum lote cadastrado</strong>Cadastre uma avaliação para liberar a seleção da impressão.';
      else if(reference&&targets.length)els.lotStatus.innerHTML=`<strong>${ordered.length} lote(s) cadastrado(s)</strong>As conferências usam automaticamente “${escapeHtml(reference.name)}”, o lote visível mais recente. A seleção da Etapa 2 serve apenas para a impressão.`;
      else if(reference)els.lotStatus.innerHTML=`<strong>${ordered.length} lote(s) cadastrado(s)</strong>“${escapeHtml(reference.name)}” está pronto para impressão. Cadastre outra avaliação anterior para construir a trajetória.`;
      else els.lotStatus.innerHTML=`<strong>${ordered.length} lote(s) cadastrado(s)</strong>Abra o olho de um lote para calcular as conferências.`;
    }
    if(!els.lotList){renderCurrentStudentMatchStatus();return;}
    if(!ordered.length){els.lotList.innerHTML='<div class="lot-empty">Nenhum lote cadastrado.</div>';renderLotSelectionControls();renderCurrentStudentMatchStatus();return;}
    els.lotList.innerHTML=ordered.slice().reverse().map(lot=>{
      const compatibility=audits.get(lot.id),isReference=lot.id===reference?.id,summary=isReference&&audits.size?aggregate:compatibility;
      const exact=summary?.exact||0,pending=summary?pendingMatchCount(summary):0,hasBlocked=pending>0,badges=[];
      if(summary){badges.push(`<span class="match-badge ok">${exact} exata(s)</span>`);badges.push(`<span class="match-badge ${pending?'warning':'ok'}">${pending} a conferir</span>`);}
      const auditButton=isReference&&audits.size?`<button class="lot-excluded-btn ${pending?'':'complete'}" type="button" data-view-conference="latest">${pending?`Conferir ${pending} correspondência(s)`:'Revisar correspondências'}</button>`:'';
      const historyNote=!isReference&&compatibility?`<span class="lot-history-note">Histórico comparado com ${escapeHtml(reference?.name||'a avaliação mais recente')}</span>`:'';
      const isVisible=isLotVisible(lot.id);
      return `<div class="lot-item ${isReference?'latest':''} ${hasBlocked?'has-blocked':''} ${isVisible?'':'is-hidden'}"><div class="lot-main"><strong>${escapeHtml(lot.name)}</strong><span>${escapeHtml(formatDateLabel(lot.date))} · ${lot.classes.length} turma(s) · ${lot.students.length} aluno(s)</span>${badges.length?`<div class="match-badges">${badges.join('')}</div>`:''}${historyNote}${auditButton}</div><div class="lot-actions"><button class="lot-icon-btn visibility ${isVisible?'is-visible':'is-hidden'}" type="button" data-toggle-lot-visibility="${escapeAttr(lot.id)}" title="${isVisible?'Ocultar lote dos resultados':'Mostrar lote nos resultados'}">${eyeIconHtml(isVisible)}</button><button class="lot-icon-btn" type="button" data-edit-lot="${escapeAttr(lot.id)}" title="Editar nome e data">✎</button><button class="lot-icon-btn delete" type="button" data-delete-lot="${escapeAttr(lot.id)}" title="Excluir lote">×</button></div></div>`;
    }).join('');
    els.lotList.querySelectorAll('[data-toggle-lot-visibility]').forEach(button=>button.addEventListener('click',()=>toggleLotVisibility(button.dataset.toggleLotVisibility)));
    els.lotList.querySelectorAll('[data-edit-lot]').forEach(button=>button.addEventListener('click',()=>editLot(button.dataset.editLot)));
    els.lotList.querySelectorAll('[data-delete-lot]').forEach(button=>button.addEventListener('click',()=>deleteLot(button.dataset.deleteLot)));
    els.lotList.querySelectorAll('[data-view-conference]').forEach(button=>button.addEventListener('click',()=>openExcludedStudents()));
    renderLotSelectionControls();renderCurrentStudentMatchStatus();
  }
  function toggleLotVisibility(id){
    const lot=state.lots.find(item=>item.id===id);if(!lot)return;
    normalizeHiddenLotIds();
    const hidden=new Set(state.hiddenLotIds||[]),currentlyVisible=!hidden.has(id),visibleCount=visibleLots().length;
    if(currentlyVisible&&visibleCount<=1)return showToast('Mantenha pelo menos um lote visível.');
    if(currentlyVisible)hidden.add(id);else hidden.delete(id);
    state.hiddenLotIds=[...hidden];normalizeHiddenLotIds();
    const stillVisible=visibleLots();
    if(currentlyVisible&&state.activeLotId===id){const fallback=stillVisible.slice().sort(compareLotsByDate).at(-1)||stillVisible[0]||null;if(fallback)activateLot(fallback.id,{silent:true,preserveStudent:true});else clearActiveLot({silent:true});}
    else{if(state.compareLotId===id&&!stillVisible.some(item=>item.id===state.compareLotId))state.compareLotId=stillVisible.find(item=>item.id!==state.activeLotId)?.id||'';renderLotSelectionControls();renderLots();renderPreview();saveSettings();}
    publishSharedPrintSnapshot('assessment-visibility-changed');
    showToast(currentlyVisible?`Lote “${lot.name}” ocultado dos resultados.`:`Lote “${lot.name}” reexibido. A seleção para impressão foi mantida.`);
  }
  async function editLot(id){
    const lot=state.lots.find(item=>item.id===id);if(!lot)return;
    const typedName=prompt('Editar nome do lote:',lot.name||'');if(typedName===null)return;
    const name=clean(typedName);if(!name)return showToast('O nome do lote não pode ficar vazio.');
    const typedDate=prompt('Editar data do lote (DD/MM/AAAA):',formatDateLabel(lot.date));if(typedDate===null)return;
    const date=parseDateLabel(typedDate);if(!date)return showToast('Informe uma data válida no formato DD/MM/AAAA.');
    const newId=stableLotId(name,date),conflict=state.lots.find(item=>item.id===newId&&item.id!==id);
    if(conflict&&!confirm(`Já existe o lote “${conflict.name}” nessa data. Deseja substituí-lo?`))return;
    const sourceRevision=Math.max(0,Number(lot._gssfRevision)||0),updated={...lot,id:newId,name,date};
    if(newId!==id){if(conflict)updated._gssfRevision=Math.max(0,Number(conflict._gssfRevision)||0);else delete updated._gssfRevision;}
    try{
      await lotDbPut(updated);
      if(id!==newId&&!lot.sessionOnly){
        try{await lotDbDelete(id,sourceRevision)}
        catch(deleteError){
          try{
            if(conflict){
              const restoreConflict={...conflict,_gssfRevision:updated._gssfRevision};
              await lotDbPut(restoreConflict);
            }else await lotDbDelete(newId,updated._gssfRevision);
          }catch(rollbackError){console.warn('Falha ao reverter destino após erro na renomeação.',rollbackError)}
          throw deleteError;
        }
      }
      // conflict.id === newId: o put já realizou a substituição confirmada.
    }catch(error){console.warn(error);return showToast(error?.code==='CONFLICT'?'O lote foi alterado em outra aba. Reabra a Impressão antes de editar novamente.':'Não foi possível salvar a edição do lote.')}
    const wasActive=state.activeLotId===id,wasComparison=state.compareLotId===id;state.lots=state.lots.filter(item=>item.id!==id&&item.id!==newId);state.lots.push(updated);sortLots();if(wasActive)state.activeLotId=newId;if(wasComparison)state.compareLotId=newId;if(wasActive)activateLot(newId,{silent:true,preserveStudent:true});else{renderLotSelectionControls();renderStageMappings();renderLots();renderPreview();saveSettings();}showToast('Lote atualizado.');
  }