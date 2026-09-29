
  async function deleteLot(id){
    const lot=state.lots.find(item=>item.id===id);if(!lot||!confirm(`Excluir o lote “${lot.name}”?`))return;
    if(!lot.sessionOnly||Object.prototype.hasOwnProperty.call(lot,'_gssfRevision')){try{await lotDbDelete(id,Math.max(0,Number(lot._gssfRevision)||0))}catch(error){console.warn(error);return showToast(error?.code==='CONFLICT'?'Este lote mudou em outra aba e não foi excluído. Reabra a Impressão.':'Não foi possível excluir o lote do armazenamento.');}}
    const wasActive=state.activeLotId===id;state.lots=state.lots.filter(item=>item.id!==id);state.hiddenLotIds=(state.hiddenLotIds||[]).filter(hiddenId=>hiddenId!==id);if(state.compareLotId===id)state.compareLotId='';if(wasActive)clearActiveLot({silent:true});else{renderLotSelectionControls();renderStageMappings();renderLots();renderPreview();saveSettings();}showToast(`Lote “${lot.name}” excluído.`);
  }
  function stableLotId(name,date){return `lot_${slugifyLot(name)}__${date||'sem-data'}`;}
  function slugifyLot(value){return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'avaliacao';}
  function compareLotsByDate(a,b){return lotTimestamp(a)-lotTimestamp(b)||clean(a.createdAt).localeCompare(clean(b.createdAt))||clean(a.name).localeCompare(clean(b.name),'pt-BR');}
  function lotTimestamp(lot){const raw=clean(lot?.date),iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw),br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);if(iso)return Date.UTC(+iso[1],+iso[2]-1,+iso[3]);if(br)return Date.UTC(+br[3],+br[2]-1,+br[1]);const timestamp=Date.parse(raw||lot?.createdAt||'');return Number.isFinite(timestamp)?timestamp:0;}
  function sortLots(){state.lots.sort(compareLotsByDate);}
  function isValidDateInput(value){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));if(!match)return false;const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),date=new Date(year,month-1,day);return year>=1900&&year<=2100&&date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;}
  function formatDateLabel(value){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));return match?`${match[3]}/${match[2]}/${match[1]}`:clean(value)||'Sem data';}
  function parseDateLabel(value){const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(clean(value));if(!match)return '';const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]),date=new Date(year,month-1,day);if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return '';return `${match[3]}-${match[2]}-${match[1]}`;}
  function lotUid(){return `student_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;}
  function toNumeric(value){const number=Number(String(value??'').replace(',','.'));return Number.isFinite(number)?number:0;}
  function normalizeAnswerOption(value){return clean(value).toUpperCase().replace(/\s+/g,'');}
  function normalizeRoll(value){const digits=String(value??'').replace(/\D+/g,'');return digits?String(Number(digits)):'';}
  function normalizeName(value){return normalizeHeader(value||'');}
  function inferStageFromClass(value){
    const normalized=normalizeClass(value),year=normalized.match(/^(\d{1,2})\s*[º°O]?\s*(?:ANO)?/i);
    if(year)return `${Number(year[1])}º`;
    const series=normalized.match(/^(\d{1,2})\s*[ªA]?\s*(?:SERIE|SÉRIE)/i);
    return series?`${Number(series[1])}ª SÉRIE`:normalized;
  }
  function normalizeStage(value){return normalizeHeader(value||'').replace(/\s+/g,' ').trim();}
  function getClassStage(value){
    const key=normalizeClass(value),configured=clean(state.classStages?.[key]);
    return normalizeStage(configured||inferStageFromClass(key));
  }
  function sameStage(left,right){const a=getClassStage(left),b=getClassStage(right);return Boolean(a&&b&&a===b);}
  function detectedClassNames(){
    const names=new Set();
    state.datasets.forEach(dataset=>{const value=displayClass(dataset);if(value)names.add(normalizeClass(value));});
    state.lots.forEach(lot=>(lot.classes||[]).forEach(group=>{if(group.name)names.add(normalizeClass(group.name));}));
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  }
  function renderStageMappings(){
    if(!els.stageMappingList)return;
    const classes=detectedClassNames();
    els.stageMappingList.innerHTML=classes.length?classes.map(className=>{const key=normalizeClass(className),value=clean(state.classStages[key])||inferStageFromClass(className);return `<label class="stage-map-row"><strong title="${escapeAttr(className)}">${escapeHtml(className)}</strong><input type="text" data-stage-class="${escapeAttr(key)}" value="${escapeAttr(value)}" aria-label="Etapa de ${escapeAttr(className)}"></label>`}).join(''):'<div class="stage-map-empty">As turmas aparecerão aqui depois que um lote for selecionado.</div>';
  }
  function currentIdentityKey(dataset,student){return `${normalizeClass(displayClass(dataset))}|${normalizeRoll(student?.roll)}|${normalizeName(student?.name)}`;}
  function levenshteinDistance(a,b){
    const left=String(a||''),right=String(b||'');if(!left)return right.length;if(!right)return left.length;
    let previous=Array.from({length:right.length+1},(_,index)=>index);
    for(let i=1;i<=left.length;i++){const current=[i];for(let j=1;j<=right.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(left[i-1]===right[j-1]?0:1));previous=current;}
    return previous[right.length];
  }
  function nameSimilarity(leftValue,rightValue){
    const left=normalizeName(leftValue),right=normalizeName(rightValue);if(!left||!right)return 0;if(left===right)return 1;
    const distanceScore=1-levenshteinDistance(left,right)/Math.max(left.length,right.length,1),a=coreNameTokens(left),b=coreNameTokens(right),setA=new Set(a),setB=new Set(b),intersection=[...setA].filter(token=>setB.has(token)).length,union=new Set([...a,...b]).size||1,tokenScore=intersection/union,edgeScore=(a[0]&&a[0]===b[0]?0.1:0)+(a.at(-1)&&a.at(-1)===b.at(-1)?0.15:0);
    return Math.min(1,Math.max(0,distanceScore*.62+tokenScore*.38+edgeScore));
  }
  function coreNameTokens(value){const particles=new Set(['da','de','do','das','dos','e']);return normalizeName(value).split(' ').filter(token=>token&&!particles.has(token));}
  function buildIdentityIndex(students){
    const rows=(students||[]).map((student,index)=>({student,index,roll:normalizeRoll(student.roll),name:normalizeName(student.name)}));
    const pairMap=new Map(),rollMap=new Map(),nameMap=new Map();
    rows.forEach(row=>{
      if(row.roll&&row.name){const key=`${row.roll}|${row.name}`;if(!pairMap.has(key))pairMap.set(key,[]);pairMap.get(key).push(row);}
      if(row.roll){if(!rollMap.has(row.roll))rollMap.set(row.roll,[]);rollMap.get(row.roll).push(row);}
      if(row.name){if(!nameMap.has(row.name))nameMap.set(row.name,[]);nameMap.get(row.name).push(row);}
    });
    const duplicatePairs=new Set([...pairMap].filter(([,items])=>items.length>1).map(([key])=>key));
    const conflictingRolls=new Set([...rollMap].filter(([,items])=>new Set(items.map(item=>item.name).filter(Boolean)).size>1).map(([key])=>key));
    const conflictingNames=new Set([...nameMap].filter(([,items])=>new Set(items.map(item=>item.roll).filter(Boolean)).size>1).map(([key])=>key));
    return{rows,pairMap,rollMap,nameMap,duplicatePairs,conflictingRolls,conflictingNames};
  }
  function auditLotIdentities(lot){
    const blocked=new Set();let duplicatePairGroups=0,rollConflictGroups=0,nameConflictGroups=0,missingIdentityRecords=0;
    const normalizedClasses=new Map();
    (lot.classes||[]).forEach(group=>{const key=normalizeClass(group.name);if(!normalizedClasses.has(key))normalizedClasses.set(key,[]);normalizedClasses.get(key).push(group);const index=buildIdentityIndex(group.students);duplicatePairGroups+=index.duplicatePairs.size;rollConflictGroups+=index.conflictingRolls.size;nameConflictGroups+=index.conflictingNames.size;index.rows.forEach(row=>{if(!row.roll||!row.name)missingIdentityRecords++;if(index.duplicatePairs.has(`${row.roll}|${row.name}`)||index.conflictingRolls.has(row.roll))blocked.add(row.student.id||`${key}:${row.index}`);});});
    const duplicateClassEntries=[...normalizedClasses.entries()].filter(([,groups])=>groups.length>1);
    duplicateClassEntries.forEach(([key,groups])=>groups.forEach(group=>(group.students||[]).forEach((student,index)=>blocked.add(student.id||`${key}:${index}`))));
    return{duplicatePairGroups,rollConflictGroups,nameConflictGroups,missingIdentityRecords,duplicateClassGroups:duplicateClassEntries.length,blockingRecords:blocked.size};
  }
  function createLotMatchContext(lot){
    const groups=new Map(),allRows=[];
    (lot.classes||[]).forEach(group=>{const classKey=normalizeClass(group.name),entry={group,classKey,index:buildIdentityIndex(group.students)};if(!groups.has(classKey))groups.set(classKey,[]);groups.get(classKey).push(entry);entry.index.rows.forEach(row=>allRows.push({...row,classKey,groupName:group.name,indexRef:entry.index}));});
    return{lot,groups,allRows,identityAudit:lot.identityAudit||auditLotIdentities(lot)};
  }
  function isBlockedIdentity(row,index){return Boolean(row&&(index.duplicatePairs.has(`${row.roll}|${row.name}`)||index.conflictingRolls.has(row.roll)));}
  function matchResult(status,code,reason,record=null,confidence=null,classChanged=false,extra={}){return{status,code,reason,record,confidence,classChanged,...extra};}
  function candidateRowsForStudent(student,dataset,context){
    const currentClass=displayClass(dataset),roll=normalizeRoll(student?.roll),name=normalizeName(student?.name),currentStage=getClassStage(currentClass),sameStageRows=context.allRows.filter(row=>sameStage(currentClass,row.groupName)&&!isBlockedIdentity(row,row.indexRef));
    const pool=currentStage?sameStageRows:context.allRows.filter(row=>!isBlockedIdentity(row,row.indexRef));
    return pool.map(row=>{
      const similarity=nameSimilarity(name,row.name),sameRoll=Boolean(roll&&row.roll===roll),exactName=Boolean(name&&row.name===name),score=Math.min(1,similarity+(sameRoll?0.2:0)+(exactName?0.18:0));
      return{...row,similarity,score,sameRoll,exactName,sameStage:sameStage(currentClass,row.groupName)};
    }).filter(row=>row.exactName||row.sameRoll||row.similarity>=.52).sort((a,b)=>b.score-a.score||Number(b.sameStage)-Number(a.sameStage)||a.groupName.localeCompare(b.groupName,'pt-BR',{numeric:true})||numericRoll(a.student.roll)-numericRoll(b.student.roll));
  }
  function manualMatchForStudent(student,dataset,lot,context){
    const key=currentIdentityKey(dataset,student),manual=lot.manualMatches?.[key];
    if(!manual)return null;
    if(manual.status==='excluded'||manual.status==='ignored')return matchResult('ignored','manual-ignored','Este registro foi ignorado pelo usuário e não entrará na comparação deste lote.',null,'manual',false,{manual:true,ignored:true,currentKey:key});
    const target=context.allRows.find(row=>row.student.id===manual.targetStudentId);
    if(!target)return matchResult('blocked','manual-target-missing','A correspondência manual salva não existe mais neste lote. Escolha outro aluno.',null,'manual',false,{manual:true,currentKey:key});
    if(isBlockedIdentity(target,target.indexRef))return matchResult('blocked','manual-target-ambiguous','O aluno escolhido manualmente está duplicado ou possui conflito de número no lote.',null,'manual',false,{manual:true,currentKey:key});
    const currentClass=normalizeClass(displayClass(dataset)),classChanged=target.classKey!==currentClass,rollChanged=target.roll!==normalizeRoll(student?.roll);
    return matchResult('matched','manual-confirmed','Correspondência confirmada manualmente pelo usuário.',target.student,'manual',classChanged,{manual:true,currentKey:key,rollChanged,targetClassName:target.groupName});
  }
  function matchStudentInLot(student,dataset,lot,context=createLotMatchContext(lot),currentIndex=buildIdentityIndex(dataset?.students||[])){
    const currentRow=currentIndex.rows.find(row=>row.student===student)||currentIndex.rows.find(row=>row.student.sourceIndex===student?.sourceIndex&&row.name===normalizeName(student?.name)&&row.roll===normalizeRoll(student?.roll));
    const roll=normalizeRoll(student?.roll),name=normalizeName(student?.name),currentClass=displayClass(dataset),classKey=normalizeClass(currentClass),currentKey=currentIdentityKey(dataset,student);
    if(!roll||!name||!classKey)return matchResult('blocked','current-incomplete','O aluno atual não possui turma, número e nome suficientes para uma comparação segura.',null,null,false,{currentKey});
    if(currentRow&&(currentIndex.duplicatePairs.has(`${roll}|${name}`)||currentIndex.conflictingRolls.has(roll)))return matchResult('blocked','current-ambiguous','A avaliação atual possui identidade duplicada ou o mesmo número associado a nomes diferentes.',null,null,false,{currentKey});
    const manual=manualMatchForStudent(student,dataset,lot,context);if(manual)return manual;
    const classEntries=context.groups.get(classKey)||[];
    if(classEntries.length>1)return matchResult('blocked','class-ambiguous','O lote possui mais de um grupo correspondente à mesma turma.',null,null,false,{currentKey});
    let pendingConflict=null;
    if(classEntries.length===1){
      const entry=classEntries[0],index=entry.index;
      const exact=(index.pairMap.get(`${roll}|${name}`)||[]);
      if(exact.length===1&&!isBlockedIdentity(exact[0],index))return matchResult('matched','exact','Turma, número e nome coincidem.',exact[0].student,'exact',false,{currentKey,targetClassName:entry.group.name});
      if(exact.length>1||exact.some(row=>isBlockedIdentity(row,index)))return matchResult('blocked','duplicate-identity','Há mais de um registro com a mesma turma, número e nome no lote.',null,null,false,{currentKey});
      const sameRoll=index.rollMap.get(roll)||[];
      if(sameRoll.length){
        pendingConflict=sameRoll.length>1||sameRoll.some(row=>isBlockedIdentity(row,index))
          ?matchResult('blocked','roll-conflict','O mesmo número está associado a mais de um nome neste lote.',null,null,false,{currentKey})
          :matchResult('blocked','roll-name-conflict','O número coincide, mas o nome é diferente. Confira as sugestões e confirme manualmente se for o mesmo aluno.',null,null,false,{currentKey});
      }
      const sameName=index.nameMap.get(name)||[];
      if(!pendingConflict&&sameName.length){
        pendingConflict=sameName.length>1
          ?matchResult('blocked','name-ambiguous','O mesmo nome aparece mais de uma vez na turma do lote.',null,null,false,{currentKey})
          :matchResult('blocked','name-roll-conflict','O nome coincide, mas o número é diferente. Confirme manualmente antes de usar o histórico.',null,null,false,{currentKey});
      }
    }
    const stageRows=context.allRows.filter(row=>sameStage(currentClass,row.groupName)&&row.classKey!==classKey&&!isBlockedIdentity(row,row.indexRef));
    const exactIdentityAcross=stageRows.filter(row=>row.roll===roll&&row.name===name);
    if(exactIdentityAcross.length===1)return matchResult('blocked','stage-transfer-confirmation','Número e nome exatos foram encontrados em outra turma da mesma etapa. Confirme a sugestão do sistema ou escolha outro aluno.',exactIdentityAcross[0].student,'suggested',true,{currentKey,rollChanged:false,targetClassName:exactIdentityAcross[0].groupName,suggestedTargetId:exactIdentityAcross[0].student.id});
    if(exactIdentityAcross.length>1)return matchResult('blocked','stage-transfer-ambiguous','Número e nome aparecem em mais de uma turma da mesma etapa.',null,null,false,{currentKey});
    const exactNameAcross=stageRows.filter(row=>row.name===name);
    if(exactNameAcross.length===1)return matchResult('blocked','stage-name-confirmation','O nome exato foi encontrado em outra turma da mesma etapa. Confirme a sugestão do sistema; nenhuma vinculação será feita automaticamente.',exactNameAcross[0].student,'suggested',true,{currentKey,rollChanged:exactNameAcross[0].roll!==roll,targetClassName:exactNameAcross[0].groupName,suggestedTargetId:exactNameAcross[0].student.id});
    if(exactNameAcross.length>1)return matchResult('blocked','stage-name-ambiguous','O nome exato aparece em mais de uma turma da mesma etapa. Confirme manualmente o registro correto.',null,null,false,{currentKey});
    if(pendingConflict)return pendingConflict;
    const candidates=candidateRowsForStudent(student,dataset,context);
    return matchResult('not-found',classEntries.length?'student-not-found':'class-not-found',candidates.length?'Não houve correspondência exata. Há nomes ou números parecidos aguardando confirmação manual.':`O aluno não foi localizado nas turmas configuradas para a etapa ${clean(state.classStages[classKey])||inferStageFromClass(currentClass)}.`,null,null,false,{currentKey,candidateCount:candidates.length});
  }