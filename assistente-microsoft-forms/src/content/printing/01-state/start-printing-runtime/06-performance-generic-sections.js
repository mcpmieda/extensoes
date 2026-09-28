
  const PERFORMANCE_GENERIC_SECTIONS=[
    {id:'g1',name:'Seção 1',area:'Grupo 1',start:1,end:10,enabled:true},
    {id:'g2',name:'Seção 2',area:'Grupo 2',start:11,end:20,enabled:true},
    {id:'g3',name:'Seção 3',area:'Grupo 3',start:21,end:30,enabled:true},
    {id:'g4',name:'Seção 4',area:'Grupo 4',start:31,end:40,enabled:true}
  ];
  const PERFORMANCE_SCHOOL_SECTIONS=[
    {id:'s1',name:'Português',area:'Linguagens',start:1,end:5,enabled:true},
    {id:'s2',name:'Inglês',area:'Linguagens',start:6,end:8,enabled:true},
    {id:'s3',name:'Computação',area:'Linguagens',start:9,end:10,enabled:true},
    {id:'s4',name:'Arte',area:'Linguagens',start:11,end:14,enabled:true},
    {id:'s5',name:'Educação Física',area:'Linguagens',start:15,end:17,enabled:true},
    {id:'s6',name:'Matemática',area:'Matemática',start:18,end:22,enabled:true},
    {id:'s7',name:'Ciências',area:'Ciências da Natureza',start:23,end:26,enabled:true},
    {id:'s8',name:'História',area:'Ciências Humanas',start:27,end:30,enabled:true},
    {id:'s9',name:'Geografia',area:'Ciências Humanas',start:31,end:34,enabled:true},
    {id:'s10',name:'Educação Religiosa',area:'Ciências Humanas',start:35,end:37,enabled:true},
    {id:'s11',name:'Ética e Cidadania',area:'Ciências Humanas',start:38,end:40,enabled:true}
  ];
  function basicPerformanceMetrics(student){
    const correct=Math.max(0,Number(student?.correct)||0),incorrect=Math.max(0,Number(student?.incorrect)||0),blank=Math.max(0,Number(student?.blank)||0),declared=Math.max(0,Number(student?.questionCount)||0),totalQuestions=declared||correct+incorrect+blank;
    const percentage=totalQuestions?Math.round(correct/totalQuestions*100):null;
    const scoreText=clean(student?.total);const scoreValue=scoreText===''?null:Number(String(scoreText).replace(',','.'));
    return{correct,incorrect,blank,totalQuestions,percentage,scoreValue:Number.isFinite(scoreValue)?scoreValue:null};
  }
  function studentSummary(student,dataset){return{...basicPerformanceMetrics(student),classAverage:datasetClassAverage(dataset)};}
  function datasetClassAverage(dataset){
    if(!dataset)return null;
    const values=dataset.students.map(item=>basicPerformanceMetrics(item).percentage).filter(Number.isFinite);
    return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;
  }
  function compactPercent(value){return value===null||value===undefined||!Number.isFinite(value)?'—':`${Math.round(value)}%`;}
  function questionEntries(record){return Object.entries(record?.questions||{}).map(([number,item])=>({number:Number(number),...item})).filter(item=>Number.isFinite(item.number)).sort((a,b)=>a.number-b.number);}
  function performanceQuestionCount(student,dataset){return Math.max(0,Number(student?.questionCount)||0,Number(dataset?.questionCount)||0,...questionEntries(student).map(item=>item.number));}
  function clonePerformanceSections(sections){return (sections||[]).map(section=>({...section,id:section.id||`section-${section.start}-${section.end}`,enabled:section.enabled!==false,start:Number(section.start)||1,end:Number(section.end)||Number(section.start)||1}));}
  function normalizePerformanceTarget(value){const number=Number(value);return Number.isFinite(number)?clamp(number,0,100):60;}
  function syncPerformanceAnalysisControls(){
    if(els.performanceTarget)els.performanceTarget.value=String(state.performanceTarget);
    printDocument.querySelectorAll('[data-performance-preset]').forEach(button=>button.classList.toggle('active',button.dataset.performancePreset===state.performancePreset));
  }
  function renderPerformanceSections(){
    if(!els.performanceSectionTable)return;
    els.performanceSectionTable.innerHTML=state.performanceSections.map((section,index)=>`<tr data-performance-section="${index}"><td><input type="checkbox" data-field="enabled" ${section.enabled!==false?'checked':''} aria-label="Usar ${escapeAttr(section.name)}"></td><td><input type="text" data-field="name" value="${escapeAttr(section.name)}"></td><td><input type="text" data-field="area" value="${escapeAttr(section.area||'')}"></td><td><input type="number" data-field="start" min="1" max="500" value="${Number(section.start)||1}"></td><td><input type="number" data-field="end" min="1" max="500" value="${Number(section.end)||Number(section.start)||1}"></td><td><button class="analysis-section-remove" type="button" data-remove-performance-section="${index}" aria-label="Remover seção">×</button></td></tr>`).join('');
    els.performanceSectionTable.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('change',()=>{const row=input.closest('[data-performance-section]'),index=Number(row?.dataset.performanceSection),section=state.performanceSections[index];if(!section)return;const field=input.dataset.field;if(field==='enabled')section.enabled=input.checked;else if(field==='start'||field==='end')section[field]=Math.max(1,Math.round(Number(input.value)||1));else section[field]=clean(input.value);if(section.end<section.start)section.end=section.start;renderPerformanceSections();persistSharedAnalysisConfig();renderPreview();saveSettings();publishSharedPrintSnapshot('analysis-sections-changed');}));
    els.performanceSectionTable.querySelectorAll('[data-remove-performance-section]').forEach(button=>button.addEventListener('click',()=>{state.performanceSections.splice(Number(button.dataset.removePerformanceSection),1);renderPerformanceSections();persistSharedAnalysisConfig();renderPreview();saveSettings();publishSharedPrintSnapshot('analysis-section-removed');}));
  }
  function persistSharedAnalysisConfig(){
    const payload={version:2,preset:state.performancePreset,target:state.performanceTarget,sections:clonePerformanceSections(state.performanceSections),classStages:{...state.classStages}};
    try{GSSF_STORAGE.setItem(ANALYSIS_CONFIG_KEY,JSON.stringify(payload));}catch(error){console.warn(error)}
  }
  function restoreSharedAnalysisConfig(){
    try{const payload=JSON.parse(GSSF_STORAGE.getItem(ANALYSIS_CONFIG_KEY)||'null');if(!payload)return;state.performancePreset=payload.preset==='generic'?'generic':'school';state.performanceTarget=normalizePerformanceTarget(payload.target);if(Array.isArray(payload.sections)&&payload.sections.length)state.performanceSections=clonePerformanceSections(payload.sections);if(payload.classStages&&typeof payload.classStages==='object')state.classStages={...payload.classStages};}catch(error){console.warn(error)}
  }
  addRuntimeWindowListener('storage',event=>{if(event.key!==ANALYSIS_CONFIG_KEY)return;restoreSharedAnalysisConfig();renderPerformanceSections();renderStageMappings();syncPerformanceAnalysisControls();renderLots();renderPreview();publishSharedPrintSnapshot('analysis-config-synced');});
  function fallbackPerformanceSections(questionCount){
    if(!questionCount)return[];
    if(questionCount>=37&&questionCount<=45)return PERFORMANCE_SCHOOL_SECTIONS.filter(section=>section.start<=questionCount).map(section=>({...section,end:Math.min(section.end,questionCount)}));
    const groups=questionCount<8?1:questionCount<16?2:4,size=Math.ceil(questionCount/groups),sections=[];
    for(let index=0;index<groups;index++){
      const start=index*size+1,end=Math.min(questionCount,(index+1)*size);
      if(start<=end)sections.push({id:`auto-${index+1}`,name:groups===1?'Avaliação':`Grupo ${index+1}`,area:'Avaliação',start,end,enabled:true});
    }
    return sections;
  }
  function getPerformanceConfig(dataset,student){
    let shared=null,diagnostic=null;
    try{shared=globalThis.GSSFSharedBridge?.getSnapshot?.()||null;diagnostic=globalThis.GSSFSharedBridge?.getSourceSnapshot?.('diagnostic')||shared?.sourceData?.diagnostic||null;}catch(_){shared=null;diagnostic=null;}
    const localConfigured=clonePerformanceSections(state.performanceSections).filter(section=>section&&section.enabled!==false&&Number(section.start)>=1&&Number(section.end)>=Number(section.start));
    const sharedConfigured=(diagnostic?.sections||shared?.sections||[]).filter(section=>section&&section.enabled!==false&&Number(section.start)>=1&&Number(section.end)>=Number(section.start)).map(section=>({id:section.id||`${section.start}-${section.end}`,name:clean(section.name)||`Questões ${section.start}–${section.end}`,area:clean(section.area)||'Sem grupo',start:Number(section.start),end:Number(section.end),enabled:true}));
    const configured=localConfigured.length?localConfigured:sharedConfigured;
    const questionCount=performanceQuestionCount(student,dataset),sections=configured.length?configured:fallbackPerformanceSections(questionCount);
    return{sections,target:normalizePerformanceTarget(state.performanceTarget),source:localConfigured.length?'print':sharedConfigured.length?'diagnostic':'automatic'};
  }
  function sectionMetricsForRecord(record,sections){
    return sections.map(section=>{
      const items=[];
      for(let question=section.start;question<=section.end;question++){const item=record?.questions?.[question];if(item)items.push(item);}
      const correct=items.filter(item=>item.correct).length,blank=items.filter(item=>item.blank).length,multi=items.filter(item=>item.multi).length,total=items.length;
      return{id:section.id,name:section.name,area:section.area,start:section.start,end:section.end,total,correct,blank,multi,percent:total?Math.round(correct/total*100):null};
    }).filter(metric=>metric.total>0);
  }
  function componentDeltaMetrics(currentMetrics,previousRecord,sections){
    const previous=sectionMetricsForRecord(previousRecord,sections),previousMap=new Map(previous.map(metric=>[`${metric.start}-${metric.end}`,metric]));
    return currentMetrics.map(metric=>{
      const before=previousMap.get(`${metric.start}-${metric.end}`),delta=before&&before.total>0&&metric.total>0&&Number.isFinite(before.percent)&&Number.isFinite(metric.percent)?metric.percent-before.percent:null;
      return{...metric,previousPercent:before?.percent??null,delta};
    });
  }
  function questionClassStats(dataset,question){
    const items=(dataset?.students||[]).map(student=>student?.questions?.[question]).filter(Boolean),total=items.length;
    if(!total)return{total:0,correct:0,blank:0,multi:0,percent:null};
    const correct=items.filter(item=>item.correct).length,blank=items.filter(item=>item.blank).length,multi=items.filter(item=>item.multi).length;
    return{total,correct,blank,multi,percent:Math.round(correct/total*100)};
  }
  function classifyTrajectory(values){
    const valid=values.filter(Number.isFinite);
    if(valid.length<=1)return{code:'single',label:'Avaliação atual',text:'Veja os dados principais desta prova e foque primeiro no que mais precisa de revisão.'};
    const deltas=valid.slice(1).map((value,index)=>value-valid[index]),significant=deltas.filter(delta=>Math.abs(delta)>=3),positive=significant.filter(delta=>delta>0).length,negative=significant.filter(delta=>delta<0).length,latest=deltas.at(-1),overall=valid.at(-1)-valid[0];
    if(!significant.length)return{code:'stable',label:'Resultado igual',text:'Seu resultado ficou igual ao das avaliações comparadas.'};
    if(positive&&negative){
      if(latest<=-5)return{code:'recent-drop',label:'Caiu nesta avaliação',text:'Seu resultado caiu nesta prova. Vale revisar primeiro o que mais trouxe dúvida.'};
      if(latest>=5)return{code:'recovery',label:'Voltou a crescer',text:'Depois de oscilações, seu resultado voltou a melhorar.'};
      return{code:'oscillation',label:'Variou entre provas',text:'Seus resultados mudaram bastante. Uma rotina curta de revisão pode ajudar a manter o ritmo.'};
    }
    if(positive&&!negative)return{code:'consistent-up',label:'Vem melhorando',text:'Seus resultados vêm crescendo nas avaliações comparadas.'};
    if(negative&&!positive)return{code:'consistent-down',label:'Vem caindo',text:'Seus resultados vêm caindo. Comece pelo que ficou mais difícil.'};
    if(overall>=5)return{code:'up',label:'Melhor que no começo',text:'Seu resultado atual está acima do primeiro resultado comparado.'};
    if(overall<=-5)return{code:'down',label:'Abaixo do começo',text:'Seu resultado atual ficou abaixo do primeiro resultado comparado.'};
    return{code:'stable',label:'Resultado igual',text:'Seus resultados ficaram iguais ao longo das avaliações comparadas.'};
  }
  function performanceStage(current,target){
    if(!Number.isFinite(current))return 'Aproveitamento indisponível';
    if(current>=Math.max(85,target+20))return 'Resultado muito consistente';
    if(current>=target)return 'Meta de referência alcançada';
    if(current>=Math.max(0,target-10))return 'Próximo da meta de referência';
    return 'Retomada recomendada';
  }
  function priorityQuestionsForStudent(student,dataset,sections,target,componentMetrics,focusMetrics){
    const allMetrics=Array.isArray(componentMetrics)?componentMetrics:[];
    const focusRanges=(Array.isArray(focusMetrics)?focusMetrics:[]).map(metric=>[metric.start,metric.end]);
    const unresolved=questionEntries(student).filter(item=>!item.correct);
    const sectionCounts=new Map();
    unresolved.forEach(item=>{
      const section=(sections||[]).find(entry=>item.number>=Number(entry.start)&&item.number<=Number(entry.end));
      const name=clean(section?.name)||'Outras questões';
      sectionCounts.set(name,(sectionCounts.get(name)||0)+1);
    });
    const metricByName=new Map((allMetrics||[]).map(metric=>[metric.name,metric]));
    const candidates=[];
    unresolved.forEach(item=>{
      const stats=questionClassStats(dataset,item.number);
      const section=(sections||[]).find(entry=>item.number>=Number(entry.start)&&item.number<=Number(entry.end));
      const component=clean(section?.name)||'Outras questões';
      const metric=metricByName.get(component)||null;
      const repeated=(sectionCounts.get(component)||0)>=2;
      const inFocus=focusRanges.some(([start,end])=>item.number>=start&&item.number<=end);
      const classHasData=stats.total>=3&&Number.isFinite(stats.percent);
      const classHigh=classHasData&&stats.percent>=Math.max(55,target);
      const classMedium=classHasData&&stats.percent>=35&&stats.percent<Math.max(55,target);
      const componentLow=Number.isFinite(metric?.percent)&&metric.percent<target;
      const componentDrop=Number.isFinite(metric?.delta)&&metric.delta<=-8;
      const componentZero=metric?.correct===0;
      let reasonCode='retake_content';
      let reason='Conteúdo que merece retomada';
      let action='Refazer';
      let score=0;
      if(item.blank){
        reasonCode='unanswered';
        reason='Questão não respondida';
        action='Conferir';
        score+=100;
      }else if(item.multi){
        reasonCode='marking_issue';
        reason='Problema de marcação';
        action='Conferir';
        score+=96;
      }else{
        score+=58;
        if(repeated&&(componentLow||componentZero||inFocus)){
          reasonCode='recurring_component';
          reason='Dificuldade recorrente no componente';
          action='Revisar';
          score+=34;
        }else if(componentDrop){
          reasonCode='drop_component';
          reason='Queda em relação à avaliação anterior';
          action='Revisar';
          score+=28;
        }else if(componentLow||componentZero){
          reasonCode='low_component';
          reason='Componente abaixo da meta';
          action='Revisar';
          score+=24;
        }else if(classHigh){
          reasonCode='individual_difficulty';
          reason='Dificuldade individual nesta questão';
          action='Refazer';
          score+=18;
        }else if(repeated){
          reasonCode='recurring_component';
          reason='Dificuldade recorrente no componente';
          action='Revisar';
          score+=16;
        }else if(classMedium){
          reasonCode='retake_content';
          reason='Conteúdo que merece retomada';
          action='Refazer';
          score+=10;
        }
      }
      if(repeated)score+=10;
      if(componentDrop)score+=10;
      if(componentLow)score+=8;
      if(classHigh)score+=8;
      if(classMedium)score+=4;
      candidates.push({number:item.number,component,action,reason,reasonCode,score,stats,blank:item.blank,multi:item.multi,repeated,componentLow,componentDrop,classHigh,classMedium});
    });
    return candidates.sort((a,b)=>b.score-a.score||a.number-b.number).slice(0,8);
  }