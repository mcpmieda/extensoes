
  function singlePriorityQuestionsForStudent(student,dataset,sections,target,componentMetrics){
    const metrics=Array.isArray(componentMetrics)?componentMetrics:[];
    const metricByName=new Map(metrics.map(metric=>[metric.name,metric]));
    const unresolved=questionEntries(student).filter(item=>!item.correct);
    const contentErrors=unresolved.filter(item=>!item.blank&&!item.multi);
    const contentErrorCounts=new Map();
    contentErrors.forEach(item=>{
      const section=(sections||[]).find(entry=>item.number>=Number(entry.start)&&item.number<=Number(entry.end));
      const component=clean(section?.name)||'Outras questões';
      contentErrorCounts.set(component,(contentErrorCounts.get(component)||0)+1);
    });
    const candidates=[];
    unresolved.forEach(item=>{
      const section=(sections||[]).find(entry=>item.number>=Number(entry.start)&&item.number<=Number(entry.end));
      const component=clean(section?.name)||'Outras questões';
      const metric=metricByName.get(component)||null;
      const repeated=(contentErrorCounts.get(component)||0)>=2;
      const componentLow=Number.isFinite(metric?.percent)&&metric.percent<target;
      const stats=questionClassStats(dataset,item.number);
      const classHigh=stats.total>=3&&Number.isFinite(stats.percent)&&stats.percent>=Math.max(55,target);
      let candidate=null;
      if(item.blank){
        candidate={number:item.number,component,action:'Conferir preenchimento',reason:'Questão não respondida',reasonCode:'unanswered',score:100,bucket:'fill'};
      }else if(item.multi){
        candidate={number:item.number,component,action:'Conferir preenchimento',reason:'Marcação dupla ou múltipla',reasonCode:'marking_issue',score:96,bucket:'fill'};
      }else if(repeated&&componentLow){
        candidate={number:item.number,component,action:'Revisar e refazer',reason:'Vários erros no componente',reasonCode:'recurring_component',score:82,bucket:'study'};
      }else if(componentLow){
        candidate={number:item.number,component,action:'Revisar conteúdo',reason:'Componente abaixo da meta',reasonCode:'low_component',score:72,bucket:'study'};
      }else if(classHigh){
        candidate={number:item.number,component,action:'Refazer questão',reason:'Dificuldade individual nesta questão',reasonCode:'individual_difficulty',score:62,bucket:'study'};
      }
      if(candidate)candidates.push(candidate);
    });
    const sorted=[...candidates].sort((a,b)=>b.score-a.score||a.number-b.number),chosen=[],chosenKeys=new Set(),perComponent=new Map();
    const take=(items,limit)=>{
      let added=0;
      for(const item of items){
        if(chosen.length>=8||added>=limit)break;
        const key=`${item.bucket}|${item.number}`;
        if(chosenKeys.has(key))continue;
        const componentKey=item.component,used=perComponent.get(componentKey)||0;
        if(used>=3)continue;
        chosen.push(item);chosenKeys.add(key);perComponent.set(componentKey,used+1);added++;
      }
    };
    take(sorted.filter(item=>item.bucket==='study'),6);
    take(sorted.filter(item=>item.bucket==='fill'),2);
    take(sorted,8-chosen.length);
    return chosen.sort((a,b)=>b.score-a.score||a.number-b.number);
  }
  function performanceSubjectsForQuestions(numbers,sections){
    const counts=new Map();
    [...new Set((numbers||[]).filter(Number.isFinite))].forEach(number=>{
      const section=(sections||[]).find(item=>number>=item.start&&number<=item.end);
      if(!section)return;
      const name=clean(section.name)||`Questões ${section.start}–${section.end}`;
      counts.set(name,(counts.get(name)||0)+1);
    });
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR')).slice(0,4).map(([name])=>name);
  }
  function composePerformanceInsights(student,dataset,matchAudit){
    const summary=studentSummary(student,dataset),history=matchAudit?.history||[],current=summary.percentage,previous=history.at(-1)||null,first=history[0]||null,config=getPerformanceConfig(dataset,student),currentMetrics=sectionMetricsForRecord(student,config.sections),metrics=componentDeltaMetrics(currentMetrics,previous,config.sections);
    const eligible=metrics.filter(metric=>Number.isFinite(metric.percent));
    const ranking=[...eligible].sort((a,b)=>b.percent-a.percent||(b.delta??-999)-(a.delta??-999));
    const strongCandidates=ranking.filter(metric=>metric.percent>=50);
    const focusCandidates=[...eligible].filter(metric=>metric.percent<config.target||metric.correct===0||(Number.isFinite(metric.delta)&&metric.delta<=-8)).sort((a,b)=>a.percent-b.percent||(a.correct-b.correct)||((a.delta??999)-(b.delta??999)));
    const displayFocusMetrics=focusCandidates.slice(0,4);
    const values=[...history.map(item=>item.percentage),current].filter(Number.isFinite),trend=classifyTrajectory(values),best=values.length?Math.max(...values):null,deltaPrevious=previous&&Number.isFinite(current)&&Number.isFinite(previous.percentage)?current-previous.percentage:null,deltaFirst=first&&Number.isFinite(current)&&Number.isFinite(first.percentage)?current-first.percentage:null,classAverage=summary.classAverage,deltaClass=Number.isFinite(current)&&Number.isFinite(classAverage)?current-classAverage:null,deltaTarget=Number.isFinite(current)?current-config.target:null;
    const currentQuestions=questionEntries(student),wrongQuestions=currentQuestions.filter(item=>!item.correct&&!item.blank&&!item.multi).map(item=>item.number),multiQuestions=currentQuestions.filter(item=>item.multi).map(item=>item.number),blankQuestions=currentQuestions.filter(item=>item.blank).map(item=>item.number),unresolvedQuestions=currentQuestions.filter(item=>!item.correct).map(item=>item.number),priorityQuestionDetails=priorityQuestionsForStudent(student,dataset,config.sections,config.target,metrics,displayFocusMetrics),singlePriorityQuestionDetails=history.length?[]:singlePriorityQuestionsForStudent(student,dataset,config.sections,config.target,metrics),priorityQuestions=priorityQuestionDetails.map(item=>item.number),collectiveQuestions=currentQuestions.filter(item=>!item.correct&&!item.blank&&!item.multi).map(item=>({number:item.number,stats:questionClassStats(dataset,item.number)})).filter(item=>item.stats.total>=3&&Number.isFinite(item.stats.percent)&&item.stats.percent<40).sort((a,b)=>a.stats.percent-b.stats.percent||a.number-b.number).slice(0,8).map(item=>item.number);
    const hasHistory=history.length>0,hasPreviousSafe=!!(previous&&Number.isFinite(previous.percentage));
    const previousPercentages=history.map(item=>item.percentage).filter(Number.isFinite);
    const historicalAverage=previousPercentages.length?previousPercentages.reduce((sum,value)=>sum+value,0)/previousPercentages.length:null;
    const currentScore=Number.isFinite(summary.scoreValue)?summary.scoreValue:null,previousScore=Number.isFinite(previous?.scoreValue)?previous.scoreValue:null;
    const scoreDeltaPrevious=currentScore!==null&&previousScore!==null?currentScore-previousScore:null;
    const previousAssessments=history.map((item,index)=>({label:performanceHistoryLabel(item,index),scoreValue:Number.isFinite(item.scoreValue)?item.scoreValue:null,percentage:item.percentage}));
    const weakSubjectTargets=[...new Set(displayFocusMetrics.map(metric=>metric.name).filter(Boolean))].slice(0,4);
    const questionRedoNumbers=[...new Set((priorityQuestions.length?priorityQuestions:[...wrongQuestions,...multiQuestions,...blankQuestions,...collectiveQuestions]).filter(Number.isFinite))].sort((a,b)=>a-b).slice(0,8);
    const subjectRedoTargets=performanceSubjectsForQuestions(unresolvedQuestions,config.sections);
    const questionRedoAsSubjects=unresolvedQuestions.length>=6&&subjectRedoTargets.length>0;
    const questionRedoItems=questionRedoAsSubjects?subjectRedoTargets:questionRedoNumbers.map(number=>`Q${number}`);
    const questionRedoType=questionRedoAsSubjects?'subject':'question';
    const questionRedoSubtitle=questionRedoAsSubjects?'muitos erros: por disciplina':'itens prioritários';
    const allResults=history.map((item,index)=>({label:performanceHistoryLabel(item,index),percent:item.percentage,current:false}));
    const headerSubtitle=hasHistory?'Comparação com avaliações anteriores':'Leitura desta avaliação';
    const tableMetrics=metrics.slice(0,12),omittedTableMetrics=Math.max(0,metrics.length-tableMetrics.length);
    return{summary,current,previous,first,best,deltaPrevious,deltaFirst,classAverage,deltaClass,deltaTarget,stage:performanceStage(current,config.target),trend,totalLots:historyLotsForSelection().length,matchAudit,config,componentMetrics:metrics,tableMetrics,omittedTableMetrics,strongMetrics:strongCandidates.slice(0,4),focusMetrics:displayFocusMetrics,priorityQuestionDetails,singlePriorityQuestionDetails,priorityQuestions,collectiveQuestions,multiQuestions,blankQuestions,unresolvedQuestions,questionRedoTargets:questionRedoNumbers.map(number=>`Q${number}`),questionRedoItems,questionRedoType,questionRedoSubtitle,questionRedoAsSubjects,hasQuestionDetail:currentQuestions.length>0,hasHistory,allResults,headerSubtitle,lineValues:values,lineLabels:[...history.map((item,index)=>performanceHistoryLabel(item,index)), 'Atual'],weakSubjectTargets,hasPreviousSafe,relatedEvaluations:history.length+1,previousAssessments,historicalAverage,scoreDeltaPrevious};
  }
  function buildPerformanceInsights(student,dataset){return composePerformanceInsights(student,dataset,getStudentHistoryAudit(student,dataset));}
  function performanceHistoryLabel(item,index){
    const base=clean(item?.name)||clean(item?.date)||`Avaliação ${index+1}`,compact=base.replace(/\s+/g,' ').trim();
    if(compact.length<=16)return compact;
    return compact.split(' ').slice(0,3).join(' ');
  }
  function performanceScoreText(value){
    if(!Number.isFinite(value))return '—';
    return formatScore(value)||'—';
  }
  function performancePointNumber(value){
    const rounded=Math.round(Math.abs(Number(value)||0)*10)/10;
    return Number.isInteger(rounded)?String(rounded):String(rounded).replace('.',',');
  }
  function performanceDeltaTone(value){
    if(!Number.isFinite(value)||Math.abs(value)<.05)return 'equal';
    return value>0?'positive':'negative';
  }
  function performanceSignedPercent(value){
    if(!Number.isFinite(value))return 'Sem comparação';
    if(Math.abs(value)<.05)return '0%';
    return `${value>0?'+':'-'}${performancePointNumber(value)}%`;
  }
  function performanceVariationHtml(metric,hasHistory){
    if(!hasHistory||!Number.isFinite(metric?.delta))return '<span class="perf-situation empty">Sem comparação</span>';
    if(Math.abs(metric.delta)<.05)return '<span class="perf-situation equal">Igual</span>';
    const points=performancePointNumber(metric.delta);
    return metric.delta>0?`<span class="perf-situation up">Aumento de ${points}%</span>`:`<span class="perf-situation down">Redução de ${points}%</span>`;
  }
  function performanceSmoothPath(points){
    if(!points.length)return '';
    if(points.length===1)return `M ${points[0].x} ${points[0].y}`;
    if(points.length===2){
      const mid=(points[0].x+points[1].x)/2;
      return `M ${points[0].x} ${points[0].y} C ${mid} ${points[0].y}, ${mid} ${points[1].y}, ${points[1].x} ${points[1].y}`;
    }
    let path=`M ${points[0].x} ${points[0].y}`;
    for(let index=0;index<points.length-1;index++){
      const p0=points[index-1]||points[index],p1=points[index],p2=points[index+1],p3=points[index+2]||p2;
      const cp1x=p1.x+(p2.x-p0.x)/6,cp1y=p1.y+(p2.y-p0.y)/6,cp2x=p2.x-(p3.x-p1.x)/6,cp2y=p2.y-(p3.y-p1.y)/6;
      path+=` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  }
  function performanceVisiblePointIndexes(total){
    if(total<=5)return new Set(Array.from({length:total},(_,index)=>index));
    const indexes=new Set([0,total-1]),step=Math.ceil((total-1)/3);
    for(let index=step;index<total-1;index+=step)indexes.add(index);
    return indexes;
  }
  function performanceChartLabel(index,total){
    if(index===total-1)return 'ATUAL';
    return total<=3?`${index+1}ª AVALIAÇÃO`:`A${index+1}`;
  }
  function performanceLineSvg(values){
    const source=(values||[]).map((value,index)=>({value:Number(value),sourceIndex:index})).filter(item=>Number.isFinite(item.value));
    if(source.length<2)return '';
    const width=442,height=136,left=44,right=30,top=17,bottom=29,innerW=width-left-right,innerH=height-top-bottom,total=source.length;
    const points=source.map((item,index)=>({x:left+innerW*(index/(total-1)),y:top+innerH-(clamp(item.value,0,100)/100)*innerH,value:item.value,index}));
    const linePath=performanceSmoothPath(points),baseY=top+innerH,areaPath=`${linePath} L ${points.at(-1).x} ${baseY} L ${points[0].x} ${baseY} Z`,visible=performanceVisiblePointIndexes(total);
    const defs=`<defs><linearGradient id="perfAreaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#bdeceb" stop-opacity=".92"></stop><stop offset="100%" stop-color="#edf8f8" stop-opacity=".35"></stop></linearGradient></defs>`;
    const grid=[25,50,75].map(mark=>{const y=top+innerH-(mark/100)*innerH;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#dbe7ee" stroke-width="1.2"></line><text x="6" y="${y+4}" fill="#64748b" font-size="11">${mark}%</text>`}).join('');
    const axis=`<line x1="${left}" y1="${baseY}" x2="${width-right}" y2="${baseY}" stroke="#cbd5e1" stroke-width="1.2"></line><text x="10" y="${baseY+4}" fill="#64748b" font-size="11">0%</text>`;
    const pointHtml=points.map((point,index)=>{
      const show=visible.has(index),labelY=point.y<31?point.y+17:point.y-9;
      const axisAnchor=index===0?'start':index===total-1?'end':'middle';
      const axisX=index===0?point.x+2:index===total-1?point.x-2:point.x;
      const valueAnchor=index===0?'start':index===total-1?'end':'middle';
      const valueX=index===0?point.x+8:index===total-1?point.x-8:point.x;
      return `<circle cx="${point.x}" cy="${point.y}" r="${show?3.8:2.35}" fill="#fff" stroke="#0f9899" stroke-width="${show?2.3:1.7}"></circle>${show?`<text x="${valueX}" y="${labelY}" text-anchor="${valueAnchor}" fill="#0f172a" font-size="12.2" font-weight="800">${Math.round(point.value)}%</text><text x="${axisX}" y="${height-5}" text-anchor="${axisAnchor}" fill="#475569" font-size="9.8" font-weight="700">${performanceChartLabel(index,total)}</text>`:''}`;
    }).join('');
    return `<svg class="perf-history-line-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">${defs}${grid}${axis}<path d="${areaPath}" fill="url(#perfAreaFill)" opacity=".98"></path><path d="${linePath}" fill="none" stroke="#0f9899" stroke-width="3.15" stroke-linecap="round" stroke-linejoin="round"></path>${pointHtml}</svg>`;
  }