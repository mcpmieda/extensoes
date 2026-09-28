
  function performancePolarPoint(cx,cy,r,angleDeg){
    const angle=(angleDeg-90)*(Math.PI/180);
    return {x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle)};
  }
  function performanceArcPath(cx,cy,r,startAngle,endAngle){
    const start=performancePolarPoint(cx,cy,r,endAngle),end=performancePolarPoint(cx,cy,r,startAngle),large=endAngle-startAngle<=180?0:1;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  function performanceCurrentDonutSvg(percent){
    const totalSegments=24,segmentAngle=360/totalSegments,gapAngle=2.3,drawAngle=segmentAngle-gapAngle,cx=42,cy=42,r=28,stroke=10.5,minOpenGap=.028;
    const rawRatio=clamp(Number(percent)||0,0,100)/100;
    let remaining=Math.min(rawRatio,1-minOpenGap);
    const background=[];
    const foreground=[];
    for(let index=0;index<totalSegments;index++){
      const start=index*segmentAngle+gapAngle/2;
      const end=start+drawAngle;
      const path=performanceArcPath(cx,cy,r,start,end);
      background.push(`<path d="${path}" fill="none" stroke="#c8ebef" stroke-width="${stroke}" stroke-linecap="square"></path>`);
      const segmentShare=1/totalSegments;
      const fillFraction=Math.max(0,Math.min(1,remaining/segmentShare));
      if(fillFraction>0){
        const fillEnd=start+drawAngle*fillFraction;
        const fillPath=performanceArcPath(cx,cy,r,start,fillEnd);
        foreground.push(`<path d="${fillPath}" fill="none" stroke="#18b6b0" stroke-width="${stroke}" stroke-linecap="square"></path>`);
      }
      remaining=Math.max(0,remaining-segmentShare);
    }
    return `<svg class="perf-current-donut-svg" viewBox="0 0 84 84" aria-hidden="true">${background.join('')}${foreground.join('')}<circle cx="42" cy="42" r="17.6" fill="#fff"></circle></svg>`;
  }
  function performanceCurrentCardHtml(insights){
    const donutPercent=Number.isFinite(insights.current)?clamp(insights.current,0,100):0;
    return `<section class="perf-history-card perf-current-card"><div class="perf-history-card-title"><h4>Desempenho atual</h4></div><div class="perf-current-body"><div class="perf-current-donut">${performanceCurrentDonutSvg(donutPercent)}<strong>${escapeHtml(compactPercent(insights.current))}</strong></div></div></section>`;
  }
  function performanceEvolutionCardHtml(insights){
    const total=Math.max(2,Number(insights.relatedEvaluations)||2),tone=performanceDeltaTone(insights.deltaPrevious);
    return `<section class="perf-history-card perf-evolution-card"><div class="perf-history-card-title"><h4>Sua evolução</h4><span class="perf-history-count">${total} avaliações</span></div><div class="perf-history-line-wrap">${performanceLineSvg(insights.lineValues)}</div><div class="perf-evolution-delta ${tone}"><span>Diferença em relação à avaliação anterior:</span><b>${escapeHtml(performanceSignedPercent(insights.deltaPrevious))}</b></div></section>`;
  }
  function performanceAssessmentRows(insights){
    const history=(insights.matchAudit?.history||[]).map((item,index)=>({label:clean(item?.name)||clean(item?.date)||`Avaliação ${index+1}`,scoreValue:Number.isFinite(item?.scoreValue)?item.scoreValue:null,correct:Math.max(0,Number(item?.correct)||0),questionCount:Math.max(0,Number(item?.questionCount)||0),percentage:Number.isFinite(item?.percentage)?item.percentage:null,current:false}));
    history.push({label:'Atual',scoreValue:Number.isFinite(insights.summary?.scoreValue)?insights.summary.scoreValue:null,correct:Math.max(0,Number(insights.summary?.correct)||0),questionCount:Math.max(0,Number(insights.summary?.totalQuestions)||0),percentage:Number.isFinite(insights.current)?insights.current:null,current:true});
    return history.map((item,index,list)=>({...item,index,delta:index>0&&Number.isFinite(item.percentage)&&Number.isFinite(list[index-1].percentage)?item.percentage-list[index-1].percentage:null}));
  }
  function performanceOrdinalLabel(index,current){return current?'Atual':`${index+1}ª avaliação`;}
  function performanceQuestionValue(rows){
    const reference=[...(rows||[])].reverse().find(item=>Number.isFinite(item.scoreValue)&&item.correct>0);
    return reference?reference.scoreValue/reference.correct:null;
  }
  function performanceHistoryCardHtml(insights){
    const all=performanceAssessmentRows(insights),shown=all.length<=4?all:[all[0],...all.slice(-3)],omitted=Math.max(0,all.length-shown.length),questionValue=performanceQuestionValue(all);
    const rows=shown.map(item=>{const deltaClass=performanceDeltaTone(item.delta),delta=item.index?`<span class="perf-note-delta ${deltaClass}">${escapeHtml(performanceSignedPercent(item.delta))}</span>`:'';return `<tr><td title="${escapeAttr(item.label)}">${escapeHtml(performanceOrdinalLabel(item.index,item.current))}</td><td><span class="perf-score-chip">${escapeHtml(item.questionCount?`${item.correct}/${item.questionCount}`:'—')}</span></td><td>${escapeHtml(performanceScoreText(item.scoreValue))}</td><td>${delta}</td></tr>`}).join('');
    const note=Number.isFinite(questionValue)&&questionValue>0?`Cada questão vale ${performanceScoreText(questionValue)} ponto${Math.abs(questionValue-1)<.0001?'':'s'}.`:'Notas conforme os arquivos importados.';
    return `<section class="perf-history-card perf-notes-card"><div class="perf-history-card-title"><h4>Histórico de notas</h4></div><table class="perf-notes-table"><colgroup><col><col><col><col></colgroup><thead><tr><th>Avaliação</th><th>Acertos</th><th>Nota</th><th>Diferença</th></tr></thead><tbody>${rows}</tbody></table><div class="perf-notes-footer"><span>${escapeHtml(note)}</span>${omitted?`<b>+${omitted} no gráfico</b>`:''}</div></section>`;
  }
  function performanceHistoryComponentSeries(insights){
    const sections=Array.isArray(insights.config?.sections)?insights.config.sections:[];
    const history=(insights.matchAudit?.history||[]).map((item,index)=>({
      label:clean(item?.name)||clean(item?.date)||`Avaliação ${index+1}`,
      metrics:sectionMetricsForRecord(item,sections),
      current:false
    }));
    const maxHistorical=3,selected=history.slice(-maxHistorical),omitted=Math.max(0,history.length-selected.length);
    return{series:[...selected,{label:'Atual',metrics:insights.componentMetrics||[],current:true}],omitted};
  }
  function performanceHistoryComponentTableHtml(insights){
    const source=(insights.componentMetrics||[]).filter(metric=>Number.isFinite(metric.percent));
    const sorted=[...source].sort((a,b)=>a.percent-b.percent||((a.delta??999)-(b.delta??999))||String(a.name).localeCompare(String(b.name),'pt-BR'));
    const rows=sorted.slice(0,11),omittedRows=Math.max(0,sorted.length-rows.length);
    if(!rows.length)return '<div class="perf-priority-empty">Não há componentes configurados para esta avaliação.</div>';
    const {series,omitted:omittedAssessments}=performanceHistoryComponentSeries(insights);
    const lookups=series.map(entry=>new Map((entry.metrics||[]).map(metric=>[`${metric.start}-${metric.end}`,metric])));
    const assessmentWidth=series.length?48/series.length:48;
    const cols=`<col class="component-col">${series.map(()=>`<col class="assessment-col" style="width:${assessmentWidth.toFixed(2)}%">`).join('')}<col class="situation-col">`;
    const heads=series.map(entry=>`<th title="${escapeAttr(entry.label)}">${escapeHtml(entry.current?'Atual':entry.label)}</th>`).join('');
    const body=rows.map((metric,index)=>{
      const key=`${metric.start}-${metric.end}`;
      const values=lookups.map(map=>{const item=map.get(key);return `<td>${escapeHtml(Number.isFinite(item?.percent)?compactPercent(item.percent):'—')}</td>`}).join('');
      return `<tr class="${index<3?'priority-row':''}"><td title="${escapeAttr(metric.name)}">${escapeHtml(metric.name)}</td>${values}<td>${performanceVariationHtml(metric,true)}</td></tr>`;
    }).join('');
    const notes=[];
    if(omittedRows)notes.push(`Mais ${omittedRows} componente(s) não couberam nesta impressão.`);
    if(omittedAssessments)notes.push(`${omittedAssessments} avaliação(ões) anterior(es) foram omitida(s) para preservar a leitura.`);
    return `<div class="perf-history-table-wrap"><table class="perf-history-component-table"><colgroup>${cols}</colgroup><thead><tr><th>Componente</th>${heads}<th>Situação</th></tr></thead><tbody>${body}</tbody></table></div>${notes.length?`<span class="perf-history-table-note">${escapeHtml(notes.join(' '))}</span>`:''}`;
  }
  function performancePriorityQuestionText(numbers){
    const labels=[...new Set((numbers||[]).filter(Number.isFinite))].sort((a,b)=>a-b).map(number=>`Q${number}`);
    if(labels.length<=1)return labels[0]||'—';
    return `${labels.slice(0,-1).join(', ')} e ${labels.at(-1)}`;
  }
  function performancePriorityActionForGroup(group){
    const codes=group.reasonCodes;
    const hasMarking=codes.has('unanswered')||codes.has('marking_issue');
    const hasReview=codes.has('recurring_component')||codes.has('drop_component')||codes.has('low_component');
    const hasRedo=codes.has('individual_difficulty')||codes.has('retake_content');
    if(hasMarking&&!hasReview&&!hasRedo)return group.numbers.length>1?'Conferir preenchimento':'Conferir marcação';
    if(hasMarking&&hasReview)return 'Conferir e revisar';
    if(hasReview&&hasRedo)return 'Revisar e refazer';
    if(hasReview)return group.numbers.length>1?'Revisar conteúdo':'Revisar';
    if(hasRedo)return group.numbers.length>1?'Refazer questões':'Refazer';
    return 'Revisar';
  }
  function performancePriorityReasonForGroup(group){
    const codes=group.reasonCodes;
    const labels=[];
    if(codes.has('unanswered'))labels.push('questão não respondida');
    if(codes.has('marking_issue'))labels.push('problema de marcação');
    if(codes.has('recurring_component'))labels.push('dificuldade recorrente no componente');
    else if(codes.has('low_component'))labels.push('componente abaixo da meta');
    if(codes.has('drop_component'))labels.push('queda em relação à avaliação anterior');
    if(codes.has('individual_difficulty')&&!labels.includes('dificuldade recorrente no componente')&&!labels.includes('componente abaixo da meta'))labels.push('dificuldade individual nesta questão');
    if(!labels.length&&codes.has('retake_content'))labels.push('conteúdo que merece retomada');
    return labels.slice(0,2).join(' • ');
  }
  function performancePriorityRows(insights){
    const details=(Array.isArray(insights.priorityQuestionDetails)?insights.priorityQuestionDetails:[]).slice(0,8);
    const metricMap=new Map((insights.componentMetrics||[]).map(metric=>[metric.name,metric]));
    const groups=new Map();
    details.forEach(item=>{
      const key=clean(item.component)||'Outras questões';
      if(!groups.has(key))groups.set(key,{component:key,numbers:[],actions:new Set(),reasonCodes:new Set(),maxScore:-Infinity,percent:Number.isFinite(metricMap.get(key)?.percent)?metricMap.get(key).percent:999});
      const group=groups.get(key);
      group.numbers.push(Number(item.number));
      group.actions.add(clean(item.action)||'Revisar');
      group.reasonCodes.add(clean(item.reasonCode)||'retake_content');
      group.maxScore=Math.max(group.maxScore,Number(item.score)||0);
    });
    return [...groups.values()].sort((a,b)=>a.percent-b.percent||b.maxScore-a.maxScore||a.component.localeCompare(b.component,'pt-BR')).map(group=>{
      const onlyFill=[...group.reasonCodes].every(code=>code==='unanswered'||code==='marking_issue');
      return {
        component:group.component,
        questions:performancePriorityQuestionText(group.numbers),
        action:performancePriorityActionForGroup(group),
        reason:performancePriorityReasonForGroup(group),
        bucket:onlyFill?'fill':'study'
      };
    });
  }
  function performancePriorityStudyTable(rows){
    if(!rows.length)return '<div class="perf-priority-empty">Nenhuma prioridade de estudo foi identificada com os dados disponíveis.</div>';
    return `<div class="perf-history-table-wrap"><table class="perf-priority-table"><colgroup><col><col><col><col></colgroup><thead><tr><th>Componente</th><th>Questões</th><th>Ação</th><th>Motivo</th></tr></thead><tbody>${rows.map(row=>{const actionClass=row.action.includes('Conferir')?'check':row.action.includes('Refazer')&&!row.action.includes('Revisar')?'redo':'review';return `<tr><td title="${escapeAttr(row.component)}">${escapeHtml(row.component)}</td><td><span class="perf-question-chip">${escapeHtml(row.questions)}</span></td><td><span class="perf-action-chip ${actionClass}">${escapeHtml(row.action)}</span></td><td><span class="perf-priority-reason" title="${escapeAttr(row.reason)}">${escapeHtml(row.reason)}</span></td></tr>`}).join('')}</tbody></table></div>`;
  }
  function performancePriorityFillHtml(rows){
    if(!rows.length)return '';
    return `<div class="perf-fill-card"><div class="perf-fill-list">${rows.map(row=>{const actionClass=row.action.includes('Conferir')?'check':row.action.includes('Refazer')&&!row.action.includes('Revisar')?'redo':'review';return `<div class="perf-fill-item"><div class="perf-fill-item-main"><strong>${escapeHtml(row.component)}</strong><span>${escapeHtml(row.questions)}</span></div><span class="perf-action-chip ${actionClass}">${escapeHtml(row.action)}</span><div class="perf-fill-item-reason">${escapeHtml(row.reason)}</div></div>`}).join('')}</div></div>`;
  }
  function performancePriorityCardHtml(insights){
    const rows=performancePriorityRows(insights);
    const studyRows=rows.filter(row=>row.bucket==='study');
    const fillRows=rows.filter(row=>row.bucket==='fill');
    const sections=[];
    sections.push(`<div class="perf-priority-section"><div class="perf-priority-section-title">Prioridades de estudo</div>${performancePriorityStudyTable(studyRows)}</div>`);
    if(fillRows.length){
      sections.push(`<div class="perf-priority-section"><div class="perf-priority-section-title">Atenção ao preenchimento</div>${performancePriorityFillHtml(fillRows)}</div>`);
    }
    return `<section class="perf-history-card perf-priority-card"><div class="perf-bottom-title"><div class="perf-bottom-title-main"><span class="perf-bottom-icon priority"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1"></rect><path d="M9 13h6M9 17h4"></path></svg></span><h4>Questões prioritárias para revisar</h4></div></div><div class="perf-priority-split">${sections.join('')}</div></section>`;
  }