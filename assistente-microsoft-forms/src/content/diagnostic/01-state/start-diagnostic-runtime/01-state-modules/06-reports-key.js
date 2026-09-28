

const REPORTS_KEY='gssf_pedagogico_reports_v1';

function reportRestoreData(){
  try{
    const saved=JSON.parse(storageGet(REPORTS_KEY)||'null');
    if(saved&&Array.isArray(saved.teachers))state.reportTeachers=saved.teachers.map(reportNormalizeTeacher).filter(Boolean);
    if(saved&&Array.isArray(saved.selectedIds))state.reportSelectedIds=saved.selectedIds.filter(id=>state.reportTeachers.some(t=>t.id===id));
    if(saved&&Array.isArray(saved.massColumns))state.reportMassColumns=saved.massColumns.map(c=>({id:clean(c.id)||uid(),className:clean(c.className)}));
    if(saved&&Array.isArray(saved.hiddenClasses))state.reportMassHiddenClasses=saved.hiddenClasses.map(clean).filter(Boolean);
  }catch(e){console.warn('Não foi possível restaurar os cadastros de relatórios.',e)}
}
function reportSaveData(){storageSet(REPORTS_KEY,JSON.stringify({version:2,teachers:state.reportTeachers,selectedIds:state.reportSelectedIds,massColumns:state.reportMassColumns,hiddenClasses:state.reportMassHiddenClasses}))}
function reportNormalizeTeacher(item){
  if(!item||!clean(item.name))return null;
  const assignments=Array.isArray(item.assignments)?item.assignments.map(a=>({sectionId:clean(a.sectionId),classes:[...new Set((a.classes||[]).map(clean).filter(Boolean))]})).filter(a=>a.sectionId&&a.classes.length):[];
  return{id:item.id||uid(),name:clean(item.name),assignments,createdAt:item.createdAt||new Date().toISOString(),updatedAt:item.updatedAt||new Date().toISOString(),autoCreated:Boolean(item.autoCreated)};
}
function reportEnabledSections(){return state.sections.filter(s=>s.enabled).slice().sort((a,b)=>+a.start-+b.start)}
function reportAllClasses(){
  const map=new Map();
  visibleBatches().slice().sort(compareBatchChronology).forEach(batch=>batch.classes.forEach(cls=>map.set(normalizeClass(cls.name),cls.name)));
  return [...map.values()].sort(natural);
}
function reportSectionById(id){return state.sections.find(s=>s.id===id)||null}
function reportUniqueAssignments(assignments){
  const map=new Map();
  (assignments||[]).forEach(a=>{if(!a.sectionId)return;const key=a.sectionId;if(!map.has(key))map.set(key,new Set());(a.classes||[]).forEach(c=>{if(clean(c))map.get(key).add(clean(c))})});
  return [...map.entries()].map(([sectionId,classes])=>({sectionId,classes:[...classes].sort(natural)})).filter(a=>a.classes.length);
}
function reportTeacherScopeText(teacher){
  const components=teacher.assignments.map(a=>reportSectionById(a.sectionId)?.name).filter(Boolean),classes=[...new Set(teacher.assignments.flatMap(a=>a.classes))];
  return `${components.length} componente(s) · ${classes.length} turma(s)`;
}
function reportTeacherByName(name){const key=normName(name);return state.reportTeachers.find(t=>normName(t.name)===key)||null}
function reportEnsureTeacher(name,autoCreated=true){
  let teacher=reportTeacherByName(name);
  if(!teacher){teacher={id:uid(),name:clean(name),assignments:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),autoCreated};state.reportTeachers.push(teacher)}
  return teacher;
}
function reportAddAssignmentToTeacher(teacher,sectionId,className){
  let assignment=teacher.assignments.find(a=>a.sectionId===sectionId);
  if(!assignment){assignment={sectionId,classes:[]};teacher.assignments.push(assignment)}
  if(!assignment.classes.some(c=>classEquivalent(c,className)))assignment.classes.push(className);
  assignment.classes.sort(natural);teacher.updatedAt=new Date().toISOString();
}
function reportRemoveAssignmentFromTeacher(teacher,sectionId,className){
  const assignment=teacher.assignments.find(a=>a.sectionId===sectionId);if(!assignment)return;
  assignment.classes=assignment.classes.filter(c=>!classEquivalent(c,className));
  teacher.assignments=teacher.assignments.filter(a=>a.classes.length);teacher.updatedAt=new Date().toISOString();
}
function reportCellTeachers(sectionId,className){return state.reportTeachers.filter(t=>t.assignments.some(a=>a.sectionId===sectionId&&a.classes.some(c=>classEquivalent(c,className))))}
function reportSetMatrixCellNames(sectionId,className,value,persist=true){
  const desired=[...new Set(String(value||'').split(/[;\n|]+/).map(clean).filter(Boolean))];
  const current=reportCellTeachers(sectionId,className);
  current.forEach(t=>{if(!desired.some(name=>normName(name)===normName(t.name)))reportRemoveAssignmentFromTeacher(t,sectionId,className)});
  desired.forEach(name=>reportAddAssignmentToTeacher(reportEnsureTeacher(name,true),sectionId,className));
  state.reportTeachers=state.reportTeachers.filter(t=>t.assignments.length||!t.autoCreated);
  state.reportSelectedIds=state.reportSelectedIds.filter(id=>state.reportTeachers.some(t=>t.id===id));
  if(persist)reportSaveData();
}
function reportSelectedTeachers(){return state.reportTeachers.filter(t=>state.reportSelectedIds.includes(t.id))}
function reportDraftAssignmentsWithSelection(){const assignments=clone(state.reportDraft.assignments||[]),sectionId=state.reportDraftSectionId,classes=(state.reportDraftClasses||[]).filter(Boolean);if(sectionId&&classes.length){const existing=assignments.find(a=>a.sectionId===sectionId);if(existing)existing.classes=[...new Set([...existing.classes,...classes])].sort(natural);else assignments.push({sectionId,classes:[...classes].sort(natural)})}return reportUniqueAssignments(assignments)}
function reportDraftIsValid(){return Boolean(clean(state.reportDraft.name)&&reportDraftAssignmentsWithSelection().some(a=>a.classes.length))}
function reportResetDraft(){state.reportDraft={name:'',assignments:[]};state.reportEditingId='';state.reportDraftClasses=[]}
function reportLoadDraft(id){const t=state.reportTeachers.find(x=>x.id===id);if(!t)return;state.reportEditingId=id;state.reportDraft={name:t.name,assignments:clone(t.assignments)};state.reportDraftSectionId=t.assignments[0]?.sectionId||state.reportDraftSectionId;state.reportDraftClasses=[];renderReports(filterBatchData(activeBatch()))}

function reportAssignmentCardsHtml(){
  if(!state.reportDraft.assignments.length)return '';
  return `<div class="report-assignment-list">${state.reportDraft.assignments.map((a,i)=>`<div class="report-assignment"><div><b>${esc(reportSectionById(a.sectionId)?.name||'Componente indisponível')}</b><span>${esc(a.classes.join(', '))}</span></div><button type="button" data-report-remove-assignment="${i}" title="Remover">×</button></div>`).join('')}</div>`;
}
function reportTeacherCardsHtml(){
  if(!state.reportTeachers.length)return '<div class="report-empty">Nenhum professor cadastrado. Utilize o passo a passo acima ou o cadastro em massa.</div>';
  return `<div class="teacher-list">${state.reportTeachers.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(t=>{const selected=state.reportSelectedIds.includes(t.id);return `<article class="teacher-card ${selected?'selected':''}" data-report-card="${t.id}" tabindex="0" role="checkbox" aria-checked="${selected}"><input type="checkbox" data-report-select="${t.id}" ${selected?'checked':''} aria-label="Selecionar ${esc(t.name)}"><div class="teacher-main"><b title="${esc(t.name)}">${esc(t.name)}</b><p>${esc(reportTeacherScopeText(t))}</p><div class="teacher-tags">${t.assignments.slice(0,5).map(a=>`<span class="teacher-tag">${esc(shortName(reportSectionById(a.sectionId)?.name||'Componente',18))} · ${a.classes.length} turma(s)</span>`).join('')}${t.assignments.length>5?`<span class="teacher-tag">+${t.assignments.length-5}</span>`:''}</div></div><div class="teacher-actions"><button type="button" data-report-edit="${t.id}" title="Editar">✎</button><button type="button" class="delete" data-report-delete="${t.id}" title="Excluir">×</button></div></article>`}).join('')}</div>`;
}
function reportMassKey(sectionId,columnId){return `${sectionId}|${columnId}`}
function reportEnsureMassColumns(){
  const classes=reportAllClasses(),normalized=[];
  (Array.isArray(state.reportMassColumns)?state.reportMassColumns:[]).forEach(col=>{if(!col||normalized.some(x=>x.id===col.id))return;normalized.push({id:clean(col.id)||uid(),className:clean(col.className)})});
  classes.forEach(className=>{if(!state.reportMassHiddenClasses.includes(normalizeClass(className))&&!normalized.some(col=>col.className&&classEquivalent(col.className,className)))normalized.push({id:uid(),className})});
  state.reportMassColumns=normalized;return normalized;
}
function reportMassColumnById(id){return reportEnsureMassColumns().find(c=>c.id===id)||null}
function reportMassCell(sectionId,column){
  const key=reportMassKey(sectionId,column.id);
  if(!state.reportMassGrid[key]){
    const legacy=column.className?state.reportMassGrid[`${sectionId}|${normalizeClass(column.className)}`]:null;
    const names=legacy?.value??(column.className?reportCellTeachers(sectionId,column.className).map(t=>t.name).join('; '):'');
    state.reportMassGrid[key]={value:names,status:legacy?.status||(names?'mass-saved':'mass-empty')};
  }
  return state.reportMassGrid[key];
}
function reportMassColumnOptions(column){
  const classes=reportAllClasses(),used=reportEnsureMassColumns().filter(c=>c.id!==column.id&&c.className).map(c=>c.className);
  return `<option value="">Selecionar turma</option>${classes.map(className=>`<option value="${esc(className)}" ${column.className&&classEquivalent(column.className,className)?'selected':''} ${used.some(x=>classEquivalent(x,className))?'disabled':''}>${esc(className)}</option>`).join('')}`;
}
function reportMatrixHtml(){
  const sections=reportEnabledSections(),columns=reportEnsureMassColumns();
  if(!sections.length)return '<div class="report-empty">Os componentes serão preenchidos automaticamente a partir da estrutura pedagógica salva pelo Assistente de Simulado.</div>';
  if(!reportAllClasses().length)return '<div class="report-empty">Cadastre avaliações para preencher automaticamente as colunas de turmas.</div>';
  return `<div class="report-matrix-toolbar"><div class="report-matrix-legend"><span><i class="mass-empty"></i>Campo vazio</span><span><i class="mass-imported"></i>Preenchido e ainda não salvo</span><span><i class="mass-saved"></i>Cadastro salvo</span></div><button class="btn small" id="reportAddMassColumn" type="button">ADICIONAR COLUNA</button></div><div class="report-matrix-shell"><table class="report-matrix-table"><thead><tr><th>Componente</th>${columns.map((column,index)=>`<th><div class="report-column-head"><select data-report-column-class="${column.id}" data-no-nav>${reportMassColumnOptions(column)}</select><div class="report-column-tools"><button type="button" class="report-column-move" data-report-move-column-left="${column.id}" title="Mover coluna para a esquerda" ${index===0?'disabled':''}>‹</button><button type="button" class="report-column-move" data-report-move-column-right="${column.id}" title="Mover coluna para a direita" ${index===columns.length-1?'disabled':''}>›</button><button type="button" class="report-column-remove" data-report-remove-column="${column.id}" title="Remover coluna">×</button></div></div></th>`).join('')}</tr></thead><tbody>${sections.map(section=>`<tr><th>${esc(section.name)}</th>${columns.map(column=>{const cell=reportMassCell(section.id,column);return `<td class="report-matrix-cell ${cell.status}"><input value="${esc(cell.value)}" data-report-matrix-section="${section.id}" data-report-matrix-column="${column.id}" placeholder="Professor"></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function reportAddMassColumn(){const represented=reportEnsureMassColumns().filter(c=>c.className).map(c=>c.className),next=reportAllClasses().find(className=>!represented.some(x=>classEquivalent(x,className)))||'';if(next)state.reportMassHiddenClasses=state.reportMassHiddenClasses.filter(x=>x!==normalizeClass(next));state.reportMassColumns.push({id:uid(),className:next});state.reportMassDirty=true;reportSaveData();renderReports()}
function reportMoveMassColumn(id,direction){const index=state.reportMassColumns.findIndex(c=>c.id===id);if(index<0)return;const target=index+direction;if(target<0||target>=state.reportMassColumns.length)return;const [column]=state.reportMassColumns.splice(index,1);state.reportMassColumns.splice(target,0,column);state.reportMassDirty=true;reportSaveData();renderReports()}
function reportRemoveMassColumn(id){if(state.reportMassColumns.length<=1)return showToast('A grade precisa manter pelo menos uma coluna.');const removed=state.reportMassColumns.find(c=>c.id===id);if(removed?.className&&!state.reportMassHiddenClasses.includes(normalizeClass(removed.className)))state.reportMassHiddenClasses.push(normalizeClass(removed.className));state.reportMassColumns=state.reportMassColumns.filter(c=>c.id!==id);Object.keys(state.reportMassGrid).filter(key=>key.endsWith(`|${id}`)).forEach(key=>delete state.reportMassGrid[key]);state.reportMassDirty=true;reportSaveData();renderReports()}
function reportChangeMassColumn(id,className){const column=reportMassColumnById(id);if(!column)return;if(className&&state.reportMassColumns.some(c=>c.id!==id&&c.className&&classEquivalent(c.className,className))){showToast('Essa turma já está representada em outra coluna.');return renderReports()}column.className=clean(className);if(column.className)state.reportMassHiddenClasses=state.reportMassHiddenClasses.filter(x=>x!==normalizeClass(column.className));state.reportMassDirty=true;reportSaveData();renderReports()}
function renderReports(){
  const sections=reportEnabledSections(),classes=reportAllClasses(),selected=reportSelectedTeachers(),valid=reportDraftIsValid();reportEnsureMassColumns();
  const draftSection=state.reportDraftSectionId&&sections.some(s=>s.id===state.reportDraftSectionId)?state.reportDraftSectionId:(sections[0]?.id||'');state.reportDraftSectionId=draftSection;
  els.dashboard.innerHTML=`<div class="report-page">
    <section class="panel"><h3>${state.reportEditingId?'Editar professor':'Cadastrar professor'}</h3><p class="panel-sub">Complete os três passos. O botão principal adiciona o componente e as turmas marcadas ao cadastro do professor.</p><div class="report-builder-grid"><article class="report-step report-step-combined"><div class="report-step-block"><div class="report-step-head"><div class="report-step-index">1</div><div><strong>Professor</strong><span>Digite o nome que aparecerá no relatório.</span></div></div><label class="field"><span>Nome do professor</span><input id="reportTeacherName" value="${esc(state.reportDraft.name)}" placeholder="Ex.: Maria da Silva"></label></div><div class="report-step-block"><div class="report-step-head"><div class="report-step-index">2</div><div><strong>Componente</strong><span>Escolha a disciplina ou componente pedagógico.</span></div></div><label class="field"><span>Componente</span><select id="reportComponentSelect" data-no-nav>${sections.map(s=>`<option value="${s.id}" ${s.id===draftSection?'selected':''}>${esc(s.name)} · Q${s.start}–Q${s.end}</option>`).join('')}</select></label></div></article><article class="report-step"><div class="report-step-head"><div class="report-step-index">3</div><div><strong>Turmas</strong><span>Marque as turmas atendidas nesse componente.</span></div></div><div class="actions" style="margin-bottom:10px"><button class="btn small" id="reportCheckAllClasses" type="button">MARCAR TODAS</button><button class="btn small" id="reportClearClasses" type="button">LIMPAR</button></div><div class="report-class-grid">${classes.map(c=>`<label class="report-check"><input type="checkbox" data-report-class="${esc(c)}" ${(state.reportDraftClasses||[]).some(x=>classEquivalent(x,c))?'checked':''}>${esc(c)}</label>`).join('')||'<span class="muted">Nenhuma turma disponível.</span>'}</div></article></div>${reportAssignmentCardsHtml()}<div class="report-builder-actions"><span class="report-validation ${valid?'ok':'warn'}" id="reportValidationText">${valid?'Cadastro pronto para salvar.':'Informe o professor, um componente e pelo menos uma turma.'}</span><div class="actions"><button class="btn" id="reportCancelEdit" type="button" ${state.reportEditingId||state.reportDraft.name||state.reportDraft.assignments.length||state.reportDraftClasses.length?'':'disabled'}>LIMPAR</button><button class="btn primary" id="reportSaveTeacher" type="button" ${valid?'':'disabled'}>${state.reportEditingId?'SALVAR ALTERAÇÕES':'CADASTRAR PROFESSOR'}</button></div></div></section>
    <section class="panel report-generation-panel"><div class="teacher-toolbar"><div class="teacher-toolbar-left"><div><h3>Professores cadastrados</h3><p class="panel-sub" style="margin-bottom:0">Clique em qualquer parte do cadastro para selecionar. Os botões de editar e excluir continuam independentes.</p></div></div><div class="teacher-toolbar-right"><button class="btn small" id="reportSelectAll" type="button">SELECIONAR TODOS</button><button class="btn small" id="reportClearSelection" type="button">LIMPAR SELEÇÃO</button><button class="btn small danger" id="reportDeleteSelected" type="button" ${selected.length?'':'disabled'}>EXCLUIR SELEÇÃO</button><button class="btn primary" id="reportExportSelected" type="button" ${selected.length&&visibleBatches().length?'':'disabled'}>EXPORTAR RELATÓRIO(S)</button></div></div>${reportTeacherCardsHtml()}<div class="report-export-note">Cada professor selecionado recebe um arquivo PDF individual. Os relatórios consideram somente as avaliações com o olho aberto, organizadas pela data.</div><div class="report-progress" id="reportProgress"><div class="report-progress-head"><span id="reportProgressText">Preparando…</span><b id="reportProgressPercent">0%</b></div><div class="report-progress-track"><div class="report-progress-fill" id="reportProgressFill"></div></div><small id="reportProgressDetail">Aguarde enquanto os dados são organizados.</small></div></section>
    <details class="panel report-mass-panel" id="reportMassPanel" ${state.reportMassOpen?'open':''}><summary><div class="report-mass-title"><strong>Cadastro em massa por grade de professores</strong><span>Selecione uma tabela, ou preencha a grade manualmente.</span></div></summary><div class="report-mass-body"><div class="report-import-tools"><label class="report-file-drop ${state.reportMassFileName?'has-file':''}" id="reportMassFileDrop"><input id="reportMassFile" type="file" accept=".xlsb,.xlsx,.xls,.xlsm,.csv"><div><strong>${state.reportMassFileName?'Tabela carregada':'Clique aqui para selecionar a tabela'}</strong><span>${state.reportMassFileName?esc(state.reportMassFileName):'Formatos aceitos: XLSB, XLSX, XLS, XLSM e CSV. A primeira grade de professores encontrada será usada.'}</span></div></label><div class="report-import-status"><b>${state.reportMassFileName?'Campos pré-preenchidos para revisão':'Grade pronta para preenchimento'}</b><p>${state.reportMassFileName?'Confira os campos amarelos e clique em salvar.':'As linhas acompanham automaticamente os componentes pedagógicos; as colunas acompanham as turmas encontradas nas avaliações.'}</p><div class="report-import-warnings">${state.reportMassWarnings.map(w=>`<div class="report-import-warning">${esc(w)}</div>`).join('')}</div></div></div><div class="report-mass-actions"><button class="btn" id="reportClearMassFile" type="button" ${state.reportMassFileName?'':'disabled'}>LIMPAR ENVIO</button><button class="btn" id="reportClearMassGrid" type="button">LIMPAR GRADE</button><button class="btn primary" id="reportSaveMassGrid" type="button" ${state.reportMassDirty?'':'disabled'}>SALVAR CADASTROS DA GRADE</button></div>${reportMatrixHtml()}</div></details>
  </div>`;
  bindReportView();
}