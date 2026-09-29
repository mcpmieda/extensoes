
  function summarizeMatches(matches){
    const summary={exact:0,adjusted:0,blocked:0,notFound:0,transferred:0,manual:0,ignored:0,total:matches.length};
    matches.forEach(item=>{
      if(item.match.status==='matched'&&item.match.confidence==='exact')summary.exact++;
      else if(item.match.status==='matched')summary.adjusted++;
      else if(item.match.status==='blocked')summary.blocked++;
      else if(item.match.status==='ignored')summary.ignored++;
      else summary.notFound++;
      if(item.match.status==='matched'&&item.match.classChanged)summary.transferred++;
      if(item.match.status==='matched'&&item.match.manual)summary.manual++;
    });
    return summary;
  }
  function pendingMatchCount(summary){return Math.max(0,Number(summary?.blocked)||0)+Math.max(0,Number(summary?.notFound)||0);} // ignorados não contam como pendência
  function getStudentHistoryAudit(student,dataset){
    const currentIndex=buildIdentityIndex(dataset?.students||[]);
    const matches=historyLotsForSelection().map(lot=>{const match=matchStudentInLot(student,dataset,lot,createLotMatchContext(lot),currentIndex);return{lot,match};});
    const history=matches.filter(item=>item.match.status==='matched').map(({lot,match})=>{
      const metrics=basicPerformanceMetrics(match.record);
      return{lotId:lot.id,name:lot.name,date:lot.date,percentage:metrics.percentage,scoreValue:metrics.scoreValue,correct:metrics.correct,incorrect:metrics.incorrect,blank:metrics.blank,questionCount:metrics.totalQuestions,questions:match.record?.questions||{},confidence:match.confidence,classChanged:match.classChanged};
    });
    return{matches,history,...summarizeMatches(matches)};
  }
  function auditCurrentAgainstLot(lot,datasets=state.datasets){
    const context=createLotMatchContext(lot),matches=[];
    (datasets||[]).forEach(dataset=>{const currentIndex=buildIdentityIndex(dataset.students);dataset.students.forEach(student=>matches.push({match:matchStudentInLot(student,dataset,lot,context,currentIndex)}));});
    return summarizeMatches(matches);
  }
  function auditCurrentAgainstLotDetails(lot,datasets=state.datasets){
    const context=createLotMatchContext(lot),details=[];
    (datasets||[]).forEach(dataset=>{
      const currentIndex=buildIdentityIndex(dataset.students);
      dataset.students.forEach(student=>{
        const match=matchStudentInLot(student,dataset,lot,context,currentIndex),currentKey=match.currentKey||currentIdentityKey(dataset,student);
        details.push({dataset,student,match,currentKey,className:displayClass(dataset),roll:clean(student.roll),name:clean(student.name),transferred:Boolean(match.classChanged)});
      });
    });
    return details;
  }
  function reviewableMatchDetails(lot){return auditCurrentAgainstLotDetails(lot,conferenceReferenceDatasets()).filter(item=>item.match.status!=='matched'||item.transferred||item.match.manual);}
  function openExcludedStudents(){
    const reference=conferenceReferenceLot(),targets=conferenceHistoricalLots(reference);if(!reference||!targets.length)return showToast('Cadastre ao menos duas avaliações visíveis, em datas diferentes, para conferir correspondências.');
    els.excludedLayer.dataset.referenceLotId=reference.id;delete els.excludedLayer.dataset.lotId;els.excludedLayer.dataset.filter='all';
    els.excludedTitle.textContent=`Conferência de correspondências — ${reference.name}`;
    els.excludedSubtitle.textContent=`Avaliação atual: ${reference.name} · confira os alunos desta avaliação nos lotes anteriores visíveis.`;
    els.excludedLayer.hidden=false;renderExcludedStudents('all');requestAnimationFrame(()=>els.excludedClose?.focus());
  }
  function closeExcludedStudents(){
    if(!els.excludedLayer)return;els.excludedLayer.hidden=true;delete els.excludedLayer.dataset.lotId;delete els.excludedLayer.dataset.referenceLotId;els.excludedLayer._matchGroups=null;
  }
  function candidateOptionsHtml(item,lot){
    const context=createLotMatchContext(lot),candidates=candidateRowsForStudent(item.student,item.dataset,context),currentStage=getClassStage(item.className),preferredId=clean(item.match?.suggestedTargetId);
    const safeRows=context.allRows.filter(row=>!isBlockedIdentity(row,row.indexRef));
    const stageRows=safeRows.filter(row=>sameStage(item.className,row.groupName));
    const pool=currentStage?stageRows:safeRows;
    const suggestedIds=new Set(candidates.slice(0,6).map(row=>row.student.id));
    const optionHtml=(row,label)=>`<option value="${escapeAttr(row.student.id)}" ${row.student.id===preferredId?'selected':''}>${escapeHtml(label)} · ${escapeHtml(row.groupName)} · Nº ${escapeHtml(padRoll(row.student.roll)||'—')} · ${escapeHtml(row.student.name)}</option>`;
    const suggestionOptions=candidates.slice(0,6).map(row=>optionHtml(row,row.student.id===preferredId?'Sugerido pelo sistema':`Sugestão ${Math.round(row.score*100)}%`)).join('');
    const otherOptions=pool.filter(row=>!suggestedIds.has(row.student.id)).sort((a,b)=>a.groupName.localeCompare(b.groupName,'pt-BR',{numeric:true})||numericRoll(a.student.roll)-numericRoll(b.student.roll)||clean(a.student.name).localeCompare(clean(b.student.name),'pt-BR')).map(row=>optionHtml(row,'Outro aluno')).join('');
    const groups=`${suggestionOptions?`<optgroup label="Sugestões por nome e número">${suggestionOptions}</optgroup>`:''}${otherOptions?`<optgroup label="Todos os alunos da etapa ${escapeAttr(currentStage||'configurada')}">${otherOptions}</optgroup>`:''}`;
    return `<select data-manual-candidate="${escapeAttr(item.currentKey)}" data-target-lot="${escapeAttr(lot.id)}"><option value="" ${preferredId?'':'selected'}>Selecione a turma e o aluno correspondente…</option>${groups}</select>`;
  }
  function cloneLotManualMatches(lot){try{return JSON.parse(JSON.stringify(lot?.manualMatches||{}))}catch(_){return{...(lot?.manualMatches||{})}}}
  async function persistLotAfterManualChange(lot,message,beforeManualMatches){
    try{
      await lotDbPut(lot);
      delete lot.sessionOnly;
    }catch(error){
      console.warn(error);
      lot.manualMatches=beforeManualMatches||{};
      showToast(error?.code==='CONFLICT'?'Este lote mudou em outra aba. A alteração local foi desfeita; reabra a Impressão.':'A correspondência não pôde ser salva e foi desfeita.');
      renderLots();renderStageMappings();renderPreview();
      if(!els.excludedLayer.hidden)renderExcludedStudents(els.excludedLayer.dataset.filter||'all');
      return false;
    }
    renderLots();renderStageMappings();renderPreview();
    if(!els.excludedLayer.hidden)renderExcludedStudents(els.excludedLayer.dataset.filter||'all');
    if(message)showToast(message);
    return true;
  }
  async function saveManualMatchFromRow(currentKey,lotId){
    const lot=state.lots.find(item=>item.id===lotId);if(!lot)return;
    const select=[...els.excludedTableBody.querySelectorAll('[data-manual-candidate]')].find(element=>element.dataset.manualCandidate===currentKey&&element.dataset.targetLot===lotId);
    const targetId=clean(select?.value);if(!targetId)return showToast('Selecione a turma e o aluno correspondente.');
    const context=createLotMatchContext(lot),target=context.allRows.find(row=>row.student.id===targetId),detail=auditCurrentAgainstLotDetails(lot,conferenceReferenceDatasets()).find(item=>item.currentKey===currentKey);
    if(!target||!detail)return showToast('A correspondência escolhida não está mais disponível.');
    const currentStage=getClassStage(detail.className),targetStage=getClassStage(target.groupName);
    if(currentStage&&targetStage&&currentStage!==targetStage&&!confirm(`A turma atual pertence à etapa “${currentStage}” e o aluno escolhido pertence à etapa “${targetStage}”. Deseja vincular mesmo assim?`))return;
    const beforeManualMatches=cloneLotManualMatches(lot);
    lot.manualMatches=lot.manualMatches&&typeof lot.manualMatches==='object'?lot.manualMatches:{};
    lot.manualMatches[currentKey]={status:'matched',targetStudentId:target.student.id,targetClassName:target.groupName,targetRoll:clean(target.student.roll),targetName:clean(target.student.name),updatedAt:new Date().toISOString()};
    await persistLotAfterManualChange(lot,`Correspondência manual salva em “${lot.name}”.`,beforeManualMatches);
  }
  async function removeManualMatch(currentKey,lotId){
    const lot=state.lots.find(item=>item.id===lotId);if(!lot?.manualMatches?.[currentKey])return;const beforeManualMatches=cloneLotManualMatches(lot);delete lot.manualMatches[currentKey];await persistLotAfterManualChange(lot,`Correspondência manual removida de “${lot.name}”.`,beforeManualMatches);
  }
  async function ignoreManualMatch(currentKey,lotId){
    const lot=state.lots.find(item=>item.id===lotId);if(!lot)return;const beforeManualMatches=cloneLotManualMatches(lot);lot.manualMatches=lot.manualMatches&&typeof lot.manualMatches==='object'?lot.manualMatches:{};lot.manualMatches[currentKey]={status:'ignored',updatedAt:new Date().toISOString()};await persistLotAfterManualChange(lot,`Aluno ignorado em “${lot.name}”.`,beforeManualMatches);
  }
  function renderExcludedStudents(filter='all'){
    if(!els.excludedLayer)return;const reference=state.lots.find(item=>item.id===els.excludedLayer.dataset.referenceLotId)||conferenceReferenceLot(),targets=conferenceHistoricalLots(reference);if(!reference||!targets.length)return closeExcludedStudents();
    const groups=targets.map(lot=>({lot,details:reviewableMatchDetails(lot),summary:auditCurrentAgainstLot(lot,conferenceReferenceDatasets())}));els.excludedLayer._matchGroups=groups;
    const normalizedFilter=['blocked','not-found','transferred'].includes(filter)?filter:'all';els.excludedLayer.dataset.filter=normalizedFilter;els.excludedFilters.querySelectorAll('[data-excluded-filter]').forEach(button=>button.classList.toggle('active',button.dataset.excludedFilter===normalizedFilter));
    const pending=groups.reduce((total,group)=>total+group.details.filter(item=>item.match.status!=='matched'&&item.match.status!=='ignored').length,0),manual=groups.reduce((total,group)=>total+group.details.filter(item=>item.match.status==='matched'&&item.match.manual).length,0);
    els.excludedSummary.innerHTML=`<span class="match-badge ${pending?'warning':'ok'}">${pending} a conferir</span>${manual?`<span class="match-badge ok">${manual} confirmado(s)</span>`:''}`;
    const statusPriority=item=>{if(item.match.status==='ignored')return 90;if(item.match.suggestedTargetId)return 0;if(item.match.status==='blocked')return 1;if(item.match.status==='not-found')return 2;if(item.transferred)return 3;if(item.match.status==='matched'&&item.match.manual)return 10;return 20;};
    els.excludedTable.hidden=false;els.excludedEmpty.hidden=true;
    els.excludedTableBody.innerHTML=groups.map(({lot,details,summary})=>{const visible=details.filter(item=>normalizedFilter==='all'||(normalizedFilter==='transferred'?item.transferred:item.match.status===normalizedFilter)).sort((a,b)=>statusPriority(a)-statusPriority(b)||a.className.localeCompare(b.className,'pt-BR',{numeric:true})||numericRoll(a.roll)-numericRoll(b.roll)||a.name.localeCompare(b.name,'pt-BR')),groupPending=pendingMatchCount(summary),heading=`<tr class="excluded-lot-group"><td colspan="5"><div class="excluded-lot-group-meta"><span>${escapeHtml(lot.name)}</span><small>${summary.exact||0} exata(s) · ${groupPending} a conferir</small></div></td></tr>`;if(!visible.length)return `${heading}<tr class="excluded-lot-empty"><td colspan="5">Nenhuma correspondência exige conferência nesta avaliação.</td></tr>`;return heading+visible.map(item=>{
      const matched=item.match.status==='matched',ignored=item.match.status==='ignored',manual=item.match.manual,target=item.match.record,pendingSuggestion=Boolean(item.match.suggestedTargetId);
      const statusClass=ignored?'ignored':matched?'manual':pendingSuggestion?'pending':item.match.status,statusLabel=ignored?'Ignorado':matched?'Confirmado':pendingSuggestion?'Confirmar':item.match.status==='blocked'?'A conferir':'Não localizado';
      const targetHtml=matched&&target?`<div class="excluded-match-card"><div class="excluded-match-target"><strong>${escapeHtml(item.match.targetClassName||target.className||'Outra turma')}</strong> · Nº ${escapeHtml(padRoll(target.roll)||'—')}<br>${escapeHtml(target.name||'Sem nome')}</div><button class="excluded-unlink" type="button" data-remove-manual-match="${escapeAttr(item.currentKey)}" data-target-lot="${escapeAttr(lot.id)}">DESFAZER VÍNCULO</button></div>`:ignored?`<div class="excluded-match-card"><span>${escapeHtml(item.match.reason||'Este aluno foi ignorado pelo usuário.')}</span><div class="excluded-actions"><button class="excluded-unlink" type="button" data-remove-manual-match="${escapeAttr(item.currentKey)}" data-target-lot="${escapeAttr(lot.id)}">DESFAZER IGNORAR</button></div><small class="excluded-suggestion">Use essa opção quando o aluno não estiver mais presente neste resultado do EvalBee.</small></div>`:`<div class="excluded-match-card"><span>${escapeHtml(item.match.reason||'Sem motivo informado.')}</span><div class="excluded-resolver">${candidateOptionsHtml(item,lot)}<div class="excluded-actions"><button type="button" data-save-manual-match="${escapeAttr(item.currentKey)}" data-target-lot="${escapeAttr(lot.id)}">${pendingSuggestion?'CONFIRMAR':'VINCULAR'}</button><button class="excluded-ignore" type="button" data-ignore-manual-match="${escapeAttr(item.currentKey)}" data-target-lot="${escapeAttr(lot.id)}">IGNORAR</button></div></div><small class="excluded-suggestion">${pendingSuggestion?'A sugestão já está selecionada. Confirme, escolha outro aluno ou ignore este caso.':'Escolha o aluno correto; nomes parecidos nunca são vinculados automaticamente. Se o aluno não fez esta prova, use Ignorar.'}</small></div>`;
      const reason=matched?`${escapeHtml(item.match.reason||'Correspondência confirmada.')} ${item.match.rollChanged?'O número do aluno também mudou.':''}`:ignored?'':'';
      return `<tr><td>${escapeHtml(item.className||'—')}</td><td class="roll">${escapeHtml(padRoll(item.roll)||'—')}</td><td><strong>${escapeHtml(item.name||'Sem nome')}</strong></td><td class="status"><span class="excluded-status ${statusClass}">${statusLabel}</span></td><td class="reason match">${reason}${targetHtml}</td></tr>`;
    }).join('')}).join('');
  }
  function renderCurrentStudentMatchStatus(){
    if(!els.studentMatchStatus)return;
    const dataset=currentDataset(),student=currentStudent();
    els.studentMatchStatus.className='student-match-status empty';
    if(!dataset||!student){els.studentMatchStatus.innerHTML='<strong>Correspondência histórica ainda não conferida</strong>Selecione um lote e uma turma para verificar os alunos.';return;}
    if(!historyLotsForSelection().length){els.studentMatchStatus.innerHTML='<strong>Sem avaliação de referência</strong>Cadastre outro lote ou ajuste a comparação na Etapa 2 para construir a trajetória deste aluno.';return;}
    const audit=getStudentHistoryAudit(student,dataset),safe=audit.exact+audit.adjusted,badges=[];
    if(audit.exact)badges.push(`<span class="match-badge ok">${audit.exact} exata(s)</span>`);
    if(audit.adjusted)badges.push(`<span class="match-badge adjusted">${audit.adjusted} ajustada(s)</span>`);
    if(audit.blocked)badges.push(`<span class="match-badge blocked">${audit.blocked} bloqueada(s)</span>`);
    if(audit.notFound)badges.push(`<span class="match-badge muted">${audit.notFound} não localizada(s)</span>`);
    els.studentMatchStatus.classList.remove('empty');
    els.studentMatchStatus.classList.add(audit.blocked?'warning':audit.adjusted?'adjusted':safe?'ok':'empty');
    const detail=audit.blocked?'As divergências foram excluídas automaticamente e não entrarão na impressão.':safe?'Somente correspondências confirmadas serão usadas em Meu desempenho.':'Nenhum histórico foi associado a este aluno.';
    els.studentMatchStatus.innerHTML=`<strong>${safe} de ${audit.total} lote(s) com correspondência segura</strong>${detail}<div class="match-badges">${badges.join('')}</div>`;
  }