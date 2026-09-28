
  function performanceHistoryHtml(insights){
    return `<section class="print-performance perf-history"><div class="print-performance-title"><span class="perf-history-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 16 5-5 4 4 7-8"></path><path d="M14 7h6v6"></path><path d="M4 20h16"></path></svg></span><strong>Resumo da sua trajetória</strong></div><div class="perf-history-panel"><div class="perf-history-top-grid">${performanceCurrentCardHtml(insights)}${performanceEvolutionCardHtml(insights)}${performanceHistoryCardHtml(insights)}</div><div class="perf-history-bottom-grid"><section class="perf-history-card perf-components-card"><div class="perf-bottom-title"><div class="perf-bottom-title-main"><span class="perf-bottom-icon components"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M17 14v6M14 17h6"></path></svg></span><h4>Desempenho por componente</h4></div><span>trajetória por avaliação</span></div>${performanceHistoryComponentTableHtml(insights)}</section>${performancePriorityCardHtml(insights)}</div></div></section>`;
  }
  function performanceSingleStatus(insights){
    const current=Number(insights.current),target=normalizePerformanceTarget(insights.config?.target);
    if(Number.isFinite(current)&&current>=target)return{code:'met',label:'Meta alcançada'};
    if(Number.isFinite(current)&&current>=Math.max(0,target-10))return{code:'near',label:'Próximo da meta'};
    return{code:'review',label:'Retomada recomendada'};
  }
  function performanceSingleQuestionValue(insights){
    const score=Number(insights.summary?.scoreValue),correct=Number(insights.summary?.correct);
    return Number.isFinite(score)&&correct>0?score/correct:null;
  }
  function performanceSingleReadingCardHtml(insights){
    const metrics=(insights.componentMetrics||[]).filter(metric=>Number.isFinite(metric.percent));
    const target=normalizePerformanceTarget(insights.config?.target),status=performanceSingleStatus(insights),met=metrics.filter(metric=>metric.percent>=target).length,below=Math.max(0,metrics.length-met),questionValue=performanceSingleQuestionValue(insights);
    const note=Number.isFinite(questionValue)&&questionValue>0?`Cada questão vale ${performanceScoreText(questionValue)} ponto${Math.abs(questionValue-1)<.0001?'':'s'}.`:'Resultados conforme os dados importados.';
    const counts=metrics.length?`<div class="perf-single-component-counts"><span><b>${met}</b> de ${metrics.length} componentes na meta</span><span>•</span><span><b>${below}</b> abaixo da meta</span></div>`:'<div class="perf-single-component-counts"><span>Componentes não configurados para esta avaliação.</span></div>';
    return `<section class="perf-history-card perf-single-reading-card"><div class="perf-history-card-title"><h4>Leitura da avaliação</h4></div><div class="perf-single-reading-main"><span class="perf-single-status ${status.code}">${escapeHtml(status.label)}</span><span class="perf-single-reference">Referência atual: <b>${escapeHtml(compactPercent(target))}</b></span>${counts}</div><div class="perf-single-reading-footer">${escapeHtml(note)}</div></section>`;
  }
  function performanceSingleHighlightsCardHtml(insights){
    const metrics=(insights.componentMetrics||[]).filter(metric=>Number.isFinite(metric.percent));
    const target=normalizePerformanceTarget(insights.config?.target);
    if(!metrics.length){
      const empty='<span class="perf-single-highlight-empty">Sem componentes disponíveis.</span>';
      return `<section class="perf-history-card perf-single-highlights-card"><div class="perf-history-card-title"><h4>Destaques e foco</h4></div><div class="perf-single-highlights"><div class="perf-single-highlight-block"><strong>Melhores resultados nesta avaliação</strong><div class="perf-single-highlight-items">${empty}</div></div><div class="perf-single-highlight-block"><strong>Principais focos de revisão</strong><div class="perf-single-highlight-items">${empty}</div></div></div></section>`;
    }
    const sortedBest=[...metrics].sort((a,b)=>b.percent-a.percent||b.correct-a.correct||a.name.localeCompare(b.name,'pt-BR'));
    const maxPercent=sortedBest[0].percent,minPercent=sortedBest.at(-1).percent,uniform=Math.abs(maxPercent-minPercent)<.05;
    const metMetrics=sortedBest.filter(metric=>metric.percent>=target),allMet=metMetrics.length===metrics.length;
    let bestHtml='',focusHtml='';
    if(uniform){
      const summary=allMet?`Todos os ${metrics.length} componentes atingiram a meta com ${compactPercent(maxPercent)}.`:`Os ${metrics.length} componentes ficaram no mesmo nível: ${compactPercent(maxPercent)}.`;
      bestHtml=`<span class="perf-single-highlight-summary ${allMet?'':'neutral'}">${escapeHtml(summary)}</span>`;
      if(allMet){
        focusHtml='<span class="perf-single-highlight-empty">Nenhum foco prioritário foi identificado nesta avaliação.</span>';
      }else{
        const ranked=[...metrics].sort((a,b)=>(b.total-b.correct)-(a.total-a.correct)||b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
        const maxErrors=ranked.length?ranked[0].total-ranked[0].correct:0;
        const candidates=ranked.filter(metric=>metric.total-metric.correct===maxErrors),shown=candidates.slice(0,2),hidden=Math.max(0,candidates.length-shown.length);
        const chips=shown.map(metric=>`<span class="perf-single-highlight-chip focus" title="${escapeAttr(metric.name)}">${escapeHtml(metric.name)} · ${escapeHtml(compactPercent(metric.percent))} (${metric.correct}/${metric.total})</span>`).join('');
        focusHtml=`<span class="perf-single-focus-guidance">Resultados semelhantes: comece pelos componentes com mais questões não acertadas.</span>${chips}${hidden?`<span class="perf-single-highlight-more">+${hidden} no mesmo nível</span>`:''}`;
      }
    }else{
      const best=sortedBest.slice(0,2),displayedMet=best.filter(metric=>metric.percent>=target).length,bestHidden=Math.max(0,metMetrics.length-displayedMet);
      const bestChips=best.map(metric=>`<span class="perf-single-highlight-chip" title="${escapeAttr(metric.name)}">${escapeHtml(metric.name)} · ${escapeHtml(compactPercent(metric.percent))} (${metric.correct}/${metric.total})</span>`).join('');
      const bestSummary=allMet?`<span class="perf-single-highlight-summary">Todos os ${metrics.length} componentes atingiram a meta.</span>`:'';
      bestHtml=`${bestSummary}${bestChips}${bestHidden&&!allMet?`<span class="perf-single-highlight-more">+${bestHidden} outro${bestHidden===1?'':'s'} na meta</span>`:''}`;
      if(allMet){
        focusHtml='<span class="perf-single-highlight-empty">Nenhum foco prioritário foi identificado nesta avaliação.</span>';
      }else{
        const focusCandidates=[...metrics].filter(metric=>Math.abs(metric.percent-minPercent)<.05).sort((a,b)=>(b.total-b.correct)-(a.total-a.correct)||a.name.localeCompare(b.name,'pt-BR'));
        const focus=focusCandidates.slice(0,2),focusHidden=Math.max(0,focusCandidates.length-focus.length);
        focusHtml=focus.map(metric=>`<span class="perf-single-highlight-chip focus" title="${escapeAttr(metric.name)}">${escapeHtml(metric.name)} · ${escapeHtml(compactPercent(metric.percent))} (${metric.correct}/${metric.total})</span>`).join('')+(focusHidden?`<span class="perf-single-highlight-more">+${focusHidden} no mesmo nível</span>`:'');
      }
    }
    return `<section class="perf-history-card perf-single-highlights-card"><div class="perf-history-card-title"><h4>Destaques e foco</h4></div><div class="perf-single-highlights"><div class="perf-single-highlight-block"><strong>Melhores resultados nesta avaliação</strong><div class="perf-single-highlight-items">${bestHtml}</div></div><div class="perf-single-highlight-block"><strong>Principais focos de revisão</strong><div class="perf-single-highlight-items">${focusHtml}</div></div></div></section>`;
  }
  function performanceSingleComponentReading(metric,target){
    if(metric.percent>=target)return{code:'met',label:'Meta alcançada'};
    if(metric.percent>=Math.max(0,target-20))return{code:'attention',label:'Em atenção'};
    return{code:'priority',label:'Prioridade de revisão'};
  }
  function performanceSingleComponentTableHtml(insights){
    const target=normalizePerformanceTarget(insights.config?.target),source=(insights.componentMetrics||[]).filter(metric=>Number.isFinite(metric.percent));
    const sorted=[...source].sort((a,b)=>a.percent-b.percent||a.correct-b.correct||a.name.localeCompare(b.name,'pt-BR'));
    const rows=[];let usedUnits=0;const maxUnits=11;
    for(const metric of sorted){
      const nameLength=(clean(metric.name)||'').length,rowUnits=Math.min(3,Math.max(1,Math.ceil(nameLength/34)));
      if(usedUnits+rowUnits>maxUnits)continue;
      rows.push(metric);usedUnits+=rowUnits;
      if(usedUnits>=maxUnits)break;
    }
    const omitted=Math.max(0,sorted.length-rows.length);
    if(!rows.length)return '<div class="perf-priority-empty">Não há componentes configurados para esta avaliação.</div>';
    const body=rows.map(metric=>{const reading=performanceSingleComponentReading(metric,target);return `<tr><td title="${escapeAttr(metric.name)}">${escapeHtml(metric.name)}</td><td>${metric.correct}/${metric.total}</td><td>${escapeHtml(compactPercent(metric.percent))}</td><td><span class="perf-single-reading ${reading.code}">${escapeHtml(reading.label)}</span></td></tr>`}).join('');
    return `<div class="perf-history-table-wrap"><table class="perf-single-component-table"><colgroup><col><col><col><col></colgroup><thead><tr><th>Componente</th><th>Acertos</th><th>Resultado</th><th>Leitura</th></tr></thead><tbody>${body}</tbody></table></div>${omitted?`<span class="perf-single-table-note">Mais ${omitted} componente(s) não couberam nesta impressão.</span>`:''}`;
  }
  function performanceSinglePriorityRows(insights){
    const details=Array.isArray(insights.singlePriorityQuestionDetails)?insights.singlePriorityQuestionDetails:[],metricMap=new Map((insights.componentMetrics||[]).map(metric=>[metric.name,metric])),groups=new Map();
    details.forEach(item=>{
      const component=clean(item.component)||'Outras questões',reasonCode=clean(item.reasonCode),bucket=reasonCode==='unanswered'||reasonCode==='marking_issue'?'fill':'study',key=`${bucket}|${component}`;
      if(!groups.has(key))groups.set(key,{component,bucket,numbers:[],actions:new Set(),reasonCodes:new Set(),reasons:new Set(),maxScore:-Infinity,percent:Number.isFinite(metricMap.get(component)?.percent)?metricMap.get(component).percent:999});
      const group=groups.get(key);group.numbers.push(Number(item.number));group.actions.add(clean(item.action));group.reasonCodes.add(reasonCode);group.reasons.add(clean(item.reason));group.maxScore=Math.max(group.maxScore,Number(item.score)||0);
    });
    return [...groups.values()].sort((a,b)=>a.percent-b.percent||b.maxScore-a.maxScore||a.component.localeCompare(b.component,'pt-BR')).map(group=>{
      const onlyFill=group.bucket==='fill';
      let action='Revisar conteúdo';
      if(onlyFill)action='Conferir preenchimento';
      else if(group.reasonCodes.has('recurring_component'))action='Revisar e refazer';
      else if(group.reasonCodes.has('individual_difficulty')&&!group.reasonCodes.has('low_component'))action=group.numbers.length>1?'Refazer questões':'Refazer questão';
      const reasonPriority=['Vários erros no componente','Componente abaixo da meta','Dificuldade individual nesta questão','Questão não respondida','Marcação dupla ou múltipla'];
      const reasons=[...group.reasons].sort((a,b)=>reasonPriority.indexOf(a)-reasonPriority.indexOf(b));
      return{component:group.component,questions:performancePriorityQuestionText(group.numbers),action,reason:reasons.slice(0,2).join(' • '),bucket:onlyFill?'fill':'study'};
    });
  }
  function performanceSingleStudyTable(rows){
    if(!rows.length)return '<div class="perf-priority-empty">Nenhuma prioridade de revisão foi identificada nesta avaliação.</div>';
    return performancePriorityStudyTable(rows);
  }
  function performanceSinglePriorityCardHtml(insights){
    const rows=performanceSinglePriorityRows(insights),allStudy=rows.filter(row=>row.bucket==='study'),allFill=rows.filter(row=>row.bucket==='fill');
    const studyRows=allStudy.slice(0,4),fillRows=allFill.slice(0,3),sections=[];
    const studyMore=Math.max(0,allStudy.length-studyRows.length),fillMore=Math.max(0,allFill.length-fillRows.length);
    const studyContent=performanceSingleStudyTable(studyRows)+(studyMore?`<span class="perf-single-table-note">+${studyMore} componente${studyMore===1?'':'s'} com prioridade</span>`:'');
    sections.push(`<div class="perf-priority-section"><div class="perf-priority-section-title">Prioridades de estudo</div>${studyContent}</div>`);
    if(fillRows.length){
      const fillContent=performancePriorityFillHtml(fillRows)+(fillMore?`<span class="perf-single-table-note">+${fillMore} componente${fillMore===1?'':'s'} com atenção ao preenchimento</span>`:'');
      sections.push(`<div class="perf-priority-section"><div class="perf-priority-section-title">Atenção ao preenchimento</div>${fillContent}</div>`);
    }
    return `<section class="perf-history-card perf-single-priority-card"><div class="perf-bottom-title"><div class="perf-bottom-title-main"><span class="perf-bottom-icon priority"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1"></rect><path d="M9 13h6M9 17h4"></path></svg></span><h4>Questões prioritárias para revisar</h4></div></div><div class="perf-priority-split">${sections.join('')}</div></section>`;
  }
  function performanceSingleHtml(insights){
    return `<section class="print-performance perf-single"><div class="print-performance-title"><span class="perf-history-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="M9 9h6M9 13h6M9 17h4"></path></svg></span><strong>Resumo desta avaliação</strong></div><div class="perf-single-panel"><div class="perf-single-top-grid">${performanceCurrentCardHtml(insights)}${performanceSingleReadingCardHtml(insights)}${performanceSingleHighlightsCardHtml(insights)}</div><div class="perf-single-bottom-grid"><section class="perf-history-card perf-single-components-card"><div class="perf-bottom-title"><div class="perf-bottom-title-main"><span class="perf-bottom-icon components"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M17 14v6M14 17h6"></path></svg></span><h4>Desempenho por componente</h4></div><span>avaliação atual</span></div>${performanceSingleComponentTableHtml(insights)}</section>${performanceSinglePriorityCardHtml(insights)}</div></div></section>`;
  }