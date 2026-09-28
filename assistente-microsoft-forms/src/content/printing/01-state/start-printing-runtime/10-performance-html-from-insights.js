
  function performanceHtmlFromInsights(insights){
    return insights?.hasHistory?performanceHistoryHtml(insights):performanceSingleHtml(insights);
  }
  function performanceHtml(s){return performanceHtmlFromInsights(buildPerformanceInsights(s,currentDataset()));}
  function performanceRenderForStudent(s){
    return getFrontContentMode()==='performance'?performanceHtml(s):'';
  }
  function renderPreview(){const s=currentStudent()||EMPTY_STUDENT;els.previewSheet.classList.toggle('hide-guide',!state.showGuide);els.previewSheet.innerHTML=guideHtml()+fieldsHtml(s);applyFrontGuideVars(els.previewSheet);applyLayoutVars(els.previewSheet);requestAnimationFrame(scalePreview);updateSummarySafe();renderCurrentStudentMatchStatus();}
  function getCardVisualGuideSnapshot(){
    try{return globalThis.CardaoRespostaApp?.getVisualGuideSnapshot?.()||{};}catch(_){return{};}
  }
  function plainTextFromHtml(value){
    const node=printDocument.createElement('div');node.innerHTML=String(value||'');return clean(node.textContent||node.innerText||'').replace(/\s+/g,' ');
  }
  function guideFallbackOmr(){
    const rows=Array.from({length:40},(_,index)=>`<div class="guide-omr-row"><b>${index+1}</b><span>A</span><span>B</span><span>C</span><span>D</span></div>`);
    return `<div class="guide-omr-fallback"><div class="guide-omr-column">${rows.slice(0,20).join('')}</div><div class="guide-omr-column">${rows.slice(20).join('')}</div></div>`;
  }
  function guideHtml(){
    const visual=getCardVisualGuideSnapshot(),student=currentStudent()||EMPTY_STUDENT,dataset=currentDataset();
    const title=plainTextFromHtml(visual.cardTitle)||'CARTÃO-RESPOSTA';
    const subtitle=plainTextFromHtml(visual.cardSubtitle)||'AVALIAÇÃO';
    const instructionLeft=plainTextFromHtml(visual.instructionLeft)||'Leia atentamente as orientações antes de iniciar a avaliação. Preencha o cartão com cuidado e confira suas respostas.';
    const instructionRight=plainTextFromHtml(visual.instructionRight)||'Use somente o material autorizado. Evite rasuras e deixe alguns minutos finais para revisar o cartão.';
    const classLabel=dataset?`${displayClass(dataset)} · Nº ${padRoll(student.roll)}`:`TURMA · Nº ${padRoll(student.roll)}`;
    const logo=typeof visual.logo==='string'&&visual.logo.startsWith('data:image/')?`<img class="guide-header-logo" src="${escapeAttr(visual.logo)}" alt="">`:'';
    const omr=typeof visual.omr==='string'&&visual.omr.startsWith('data:image/')?visual.omr:'';
    const fitClass=visual.omrFit==='width'?'fit-width':visual.omrFit==='stretch'?'fit-stretch':'fit-contain';
    const omrScale=clamp(Number(visual.omrScale)||1,.7,1.2),omrOffsetX=clamp(Number(visual.omrOffsetX)||0,-.2,.2)*100,omrOffsetY=clamp(Number(visual.omrOffsetY)||0,-.16,.24)*100,classBarOffsetY=clamp(Number(visual.classBarOffsetY)||0,-12,12);
    const omrHtml=omr?`<img src="${escapeAttr(omr)}" alt="Folha OMR" style="transform:translate(calc(-50% + ${omrOffsetX}%),calc(-50% + ${omrOffsetY}%)) scale(${omrScale})">`:guideFallbackOmr();
    const centerArea=getFrontContentMode()==='performance'?'<div class="guide-performance">ÁREA RESERVADA PARA O DESEMPENHO</div>':`<section class="guide-instructions"><div class="guide-instructions-title">INSTRUÇÕES</div><div class="guide-instructions-columns"><div>${escapeHtml(instructionLeft)}</div><div>${escapeHtml(instructionRight)}</div></div><div class="guide-stars">* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *</div></section>`;
    return `<div class="guide-layer"><div class="guide-header">${logo}<strong class="guide-header-title">${escapeHtml(title)}</strong><span class="guide-header-subtitle">${escapeHtml(subtitle)}</span></div><div class="guide-info"><div class="guide-info-left"><div class="guide-info-name">${escapeHtml(student.name||'NOME DO ALUNO')}</div><div class="guide-info-class">${escapeHtml(dataset?displayClass(dataset):'TURMA')}</div><div class="guide-info-signature">Assinatura do Participante</div></div><div class="guide-result"><div class="guide-result-title">RESULTADO FINAL</div><div class="guide-result-pad"></div><div class="guide-result-head"><span>ACERTOS</span><span>ERROS</span><span>BRANCO</span><span>REDAÇÃO</span></div><div class="guide-result-cells"><span></span><span></span><span></span><span></span></div></div></div>${centerArea}<div class="guide-class-bar" style="transform:translateY(${classBarOffsetY}mm)">${escapeHtml(classLabel)}</div><div class="guide-omr ${fitClass}">${omrHtml}</div><div class="guide-note">GUIA VISUAL COMPLETA — NÃO SERÁ IMPRESSA</div></div>`;
  }
  function fieldsHtml(s){return `<div class="print-field print-name">${escapeHtml((s.name||'').toUpperCase())}</div><div class="print-field print-total">${escapeHtml(formatScore(s.total))}</div><div class="print-field print-correct">${escapeHtml(s.correct||'0')}</div><div class="print-field print-incorrect">${escapeHtml(s.incorrect||'0')}</div><div class="print-field print-blank">${escapeHtml(s.blank||'0')}</div>${performanceRenderForStudent(s)}`}
  function applyFrontGuideVars(node){
    const visual=getCardVisualGuideSnapshot(),layout=visual.frontLayout||{};
    const fallback={pageLeft:5,pageRight:5,headerTop:0,headerHeight:22,infoTop:22,infoHeight:52,centerTop:74,centerHeight:100.5,classTop:178,classHeight:6,omrTop:188,omrHeight:97};
    const values={...fallback,...layout};
    const vars={'--guide-page-left':`${values.pageLeft}mm`,'--guide-page-right':`${values.pageRight}mm`,'--guide-header-top':`${values.headerTop}mm`,'--guide-header-height':`${values.headerHeight}mm`,'--guide-info-top':`${values.infoTop}mm`,'--guide-info-height':`${values.infoHeight}mm`,'--guide-center-top':`${values.centerTop}mm`,'--guide-center-height':`${values.centerHeight}mm`,'--guide-class-top':`${values.classTop}mm`,'--guide-class-height':`${values.classHeight}mm`,'--guide-omr-top':`${values.omrTop}mm`,'--guide-omr-height':`${values.omrHeight}mm`};
    Object.entries(vars).forEach(([key,value])=>node.style.setProperty(key,value));
  }
  function applyLayoutVars(node){const l=state.layout;const vars={'--global-x':`${l.globalX}mm`,'--global-y':`${l.globalY}mm`,'--name-x':`${l.nameX}mm`,'--name-y':`${l.nameY}mm`,'--name-w':`${l.nameW}mm`,'--name-size':`${l.nameSize}pt`,'--total-x':`${l.totalX}mm`,'--total-y':`${l.totalY}mm`,'--total-w':`${l.totalW}mm`,'--total-size':`${l.totalSize}pt`,'--correct-x':`${l.correctX}mm`,'--incorrect-x':`${l.incorrectX}mm`,'--blank-x':`${l.blankX}mm`,'--counts-y':`${l.countsY}mm`,'--count-w':`${l.countW}mm`,'--count-size':`${l.countSize}pt`};Object.entries(vars).forEach(([k,v])=>node.style.setProperty(k,v));}
  function updateSummarySafe(){const d=currentDataset(),s=currentStudent();if(!d||!s)return;els.studentCount.textContent=d.students.length;els.classSummary.textContent=displayClass(d);els.rollSummary.textContent=padRoll(s.roll);els.scoreSummary.textContent=formatScore(s.total);els.previewChip.classList.toggle('hidden',getFrontContentMode()==='performance');}

  function clampScroll(value,maximum){return Math.min(Math.max(0,value),Math.max(0,maximum));}
  function resetPreviewPosition(){const apply=()=>{els.previewScroll.scrollTop=0;const overflow=Math.max(0,els.previewScroll.scrollWidth-els.previewScroll.clientWidth);els.previewScroll.scrollLeft=overflow/2;};apply();requestAnimationFrame(apply);clearTimeout(resetPreviewPosition.timer);resetPreviewPosition.timer=setTimeout(apply,80);}
  function setZoom(v){const previous=state.zoom;state.zoom=Math.round(Math.min(1.8,Math.max(.5,v))*10)/10;els.zoomReset.textContent=`${Math.round(state.zoom*100)}%`;els.zoomOut.disabled=state.zoom<=.5;els.zoomIn.disabled=state.zoom>=1.8;if(previous!==state.zoom&&els.paperScale){els.paperScale.classList.remove('zooming-in','zooming-out');void els.paperScale.offsetWidth;els.paperScale.classList.add(state.zoom>previous?'zooming-in':'zooming-out');clearTimeout(setZoom.effectTimer);setZoom.effectTimer=setTimeout(()=>els.paperScale?.classList.remove('zooming-in','zooming-out'),320);}scalePreview({preserveCenter:true,animate:true});saveSettings();}
  function previewScaleOrigin(){return{x:(els.paperViewport?.offsetLeft||0)+(els.paperShell?.offsetLeft||0),y:(els.paperViewport?.offsetTop||0)+(els.paperShell?.offsetTop||0)}}
  function applyPreviewScale(scale,anchor=null){const pageW=els.paperScale.offsetWidth||794,pageH=els.paperScale.offsetHeight||1123;els.paperScale.style.transform=`scale(${scale})`;els.paperScale.dataset.appliedScale=String(scale);els.paperShell.style.width=`${pageW*scale}px`;els.paperShell.style.height=`${pageH*scale}px`;if(!anchor)return;const origin=previewScaleOrigin(),maxTop=Math.max(0,els.previewScroll.scrollHeight-els.previewScroll.clientHeight),maxLeft=Math.max(0,els.previewScroll.scrollWidth-els.previewScroll.clientWidth);els.previewScroll.scrollTop=clampScroll(origin.y+anchor.y*scale-els.previewScroll.clientHeight/2,maxTop);els.previewScroll.scrollLeft=clampScroll(origin.x+anchor.x*scale-els.previewScroll.clientWidth/2,maxLeft)}
  function cancelPreviewScaleAnimation(){if(scalePreview.animationFrame)cancelAnimationFrame(scalePreview.animationFrame);scalePreview.animationFrame=0}
  function scalePreview(options={}){const pageW=els.paperScale.offsetWidth||794,pageH=els.paperScale.offsetHeight||1123,aw=Math.max(250,els.previewScroll.clientWidth-26),ah=Math.max(260,els.previewScroll.clientHeight-26),fit=Math.min(1,aw/pageW,ah/pageH),targetScale=state.zoom>1?state.zoom:fit*state.zoom,currentScale=Number(els.paperScale.dataset.appliedScale)||targetScale,origin=previewScaleOrigin(),anchor=options.preserveCenter?{x:(els.previewScroll.scrollLeft+els.previewScroll.clientWidth/2-origin.x)/Math.max(.001,currentScale),y:(els.previewScroll.scrollTop+els.previewScroll.clientHeight/2-origin.y)/Math.max(.001,currentScale)}:null;cancelPreviewScaleAnimation();if(options.resetPosition){applyPreviewScale(targetScale);resetPreviewPosition();return}if(!options.animate||Math.abs(targetScale-currentScale)<.001){applyPreviewScale(targetScale,anchor);return}const startedAt=performance.now(),duration=280,step=now=>{const progress=Math.min(1,(now-startedAt)/duration),eased=1-Math.pow(1-progress,3),scale=currentScale+(targetScale-currentScale)*eased;applyPreviewScale(scale,anchor);if(progress<1)scalePreview.animationFrame=requestAnimationFrame(step);else scalePreview.animationFrame=0};scalePreview.animationFrame=requestAnimationFrame(step)}

  function syncLayoutControls(){Object.keys(DEFAULT_LAYOUT).forEach(k=>{if(els[k])els[k].value=state.layout[k]});Object.entries(POSITION_CONTROLS).forEach(([key,config])=>{els[config.range].value=String(state.layout[key]);els[key].value=String(state.layout[key]);});syncRangeValues();syncSegmented('orderButtons','order',state.order);syncSegmented('decimalButtons','decimals',state.decimals);syncSegmented('separatorButtons','separator',state.separator);syncFrontContentControls();els.guideToggle.classList.toggle('active',state.showGuide);els.zoomReset.textContent=`${Math.round(state.zoom*100)}%`;els.zoomOut.disabled=state.zoom<=.5;els.zoomIn.disabled=state.zoom>=1.8;}
  function syncRangeValues(){els.globalXValue.textContent=`${numLabel(state.layout.globalX)} mm`;els.globalYValue.textContent=`${numLabel(state.layout.globalY)} mm`;}
  function syncSegmented(containerId,dataKey,value){printDocument.querySelectorAll(`#${containerId} [data-${dataKey}]`).forEach(b=>b.classList.toggle('active',b.dataset[dataKey]===String(value)));}

  function printStudents(students,pdfMode){
    const valid=(students||[]).filter(Boolean);if(!valid.length)return;
    els.printQueue.innerHTML=valid.map(s=>`<article class="print-page">${fieldsHtml(s)}</article>`).join('');
    els.printQueue.querySelectorAll('.print-page').forEach(page=>{applyFrontGuideVars(page);applyLayoutVars(page);});
    const title=pdfMode?`Notas_${displayClass(currentDataset())}`:`Impressao_${displayClass(currentDataset())}`;
    let printWindow;
    try{printWindow=prepareIsolatedPrintWindow(els.printQueue.innerHTML,title);}catch(error){els.printQueue.innerHTML='';state.printing=false;showToast(error?.message||'Não foi possível abrir a impressão.');return;}
    els.printQueue.innerHTML='';
    state.printing=true;
    let finished=false;
    let monitor=0;
    let fallback=0;
    const finish=()=>{if(finished)return;finished=true;state.printing=false;clearInterval(monitor);clearTimeout(fallback);try{if(printWindow&&!printWindow.closed)printWindow.close();}catch(_){}if(activePrintWindow===printWindow)activePrintWindow=null;};
    try{printWindow.addEventListener('afterprint',finish,{once:true});}catch(_){}
    monitor=setInterval(()=>{try{if(printWindow.closed)finish();}catch(_){finish();}},500);
    fallback=setTimeout(finish,120000);
    setTimeout(()=>{try{printWindow.focus();printWindow.print();}catch(error){showToast('Não foi possível abrir a caixa de impressão.');finish();}},120);
  }

  function resetGeneralCalibration(){state.layout.globalX=DEFAULT_LAYOUT.globalX;state.layout.globalY=DEFAULT_LAYOUT.globalY;syncLayoutControls();renderPreview();saveSettings();showToast('Calibração geral restaurada.');}
  function resetIndividualPositions(){['nameX','nameY','nameW','totalX','totalY','totalW','correctX','incorrectX','blankX','countsY','countW'].forEach(key=>state.layout[key]=DEFAULT_LAYOUT[key]);syncLayoutControls();renderPreview();saveSettings();showToast('Posições alinhadas novamente ao modelo atual do cartão.');}
  function resetSettings(){if(!confirm('Restaurar todas as configurações da aba Impressão? Os lotes cadastrados continuarão disponíveis.'))return;state.zoom=1;state.showGuide=true;state.order='asc';state.decimals='auto';state.separator='dot';state.frontContentMode='performance';state.frontContentExplicit=true;state.classStages={};state.hiddenLotIds=[];state.layout={...DEFAULT_LAYOUT};state.performancePreset='school';state.performanceSections=clonePerformanceSections(PERFORMANCE_SCHOOL_SECTIONS);state.performanceTarget=60;persistSharedAnalysisConfig();renderPerformanceSections();syncPerformanceAnalysisControls();GSSF_STORAGE.removeItem(STORAGE_KEY);try{globalThis.CardaoRespostaApp?.setFrontContentMode?.('performance',{silent:true,reason:'print-settings-reset'});}catch(_){}syncLayoutControls();populateDatasets();populateStudents();renderStageMappings();renderLotSelectionControls();renderLots();publishSharedPrintSnapshot('settings-reset');showToast('Configurações da impressão restauradas.');}

  function persistSettingsNow(){const dataset=currentDataset(),student=currentStudent();const payload={layoutVersion:PRINT_LAYOUT_VERSION,zoom:state.zoom,showGuide:state.showGuide,order:state.order,decimals:state.decimals,separator:state.separator,frontContentMode:getFrontContentMode(),classStages:state.classStages,hiddenLotIds:state.hiddenLotIds,layout:state.layout,activeLotId:state.activeLotId,comparisonMode:state.comparisonMode,compareLotId:state.compareLotId,performancePreset:state.performancePreset,performanceSections:clonePerformanceSections(state.performanceSections),performanceTarget:state.performanceTarget,savedDatasetKey:dataset?datasetKey(dataset):state.savedDatasetKey,savedRoll:student?student.roll:state.savedRoll,preferredClassName:state.preferredClassName||(dataset?displayClass(dataset):''),preferredStudentRoll:state.preferredStudentRoll||(student?clean(student.roll):''),preferredStudentName:state.preferredStudentName||(student?clean(student.name):'')};try{GSSF_STORAGE.setItem(STORAGE_KEY,JSON.stringify(payload));}catch(error){console.warn(error)}}