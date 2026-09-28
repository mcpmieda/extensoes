

function ignoreValidation(item){
  if(!item || !item.ignorable || !item.issueId) return;
  state.ignoredValidationIds.add(item.issueId);
  runValidations(false);
  saveCurrentStateNow().catch(console.error);
  toast(`Erro ignorado para ${item.turma}: ${item.disciplina}.`);
}

function restoreIgnoredValidation(item){
  if(!item || !item.issueId) return;
  state.ignoredValidationIds.delete(item.issueId);
  runValidations(false);
  saveCurrentStateNow().catch(console.error);
  toast(`Erro reativado para ${item.turma}: ${item.disciplina}.`);
}

function goToValidation(it){
  if(it.turma){ state.previewTurma=it.turma; renderPreviewTabs(); renderPreview(); setTimeout(()=>highlightRow(it),100); }
  else toast('Este erro está na linha da planilha e não tem uma turma para mostrar na prévia.');
}
function highlightRow(it){
  const key=it.disciplina?normKey(it.disciplina):'';
  const page=el.reportPreview.querySelector('.report-page'); if(!page) return;
  let row=null;
  if(key) row=page.querySelector(`tr[data-disc-key="${CSS.escape(key)}"]`);
  if(!row && it.row) row=Array.from(page.querySelectorAll('tr')).find(r=>(r.dataset.rows||'').split(',').includes(String(it.row)));
  if(row){
    row.classList.add('highlight');
    row.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>row.classList.remove('highlight'),5200);
  }else if(it.missingDiscipline){
    page.classList.add('highlight');
    toast(`Disciplina ausente nesta turma: ${it.disciplina}.`);
    setTimeout(()=>page.classList.remove('highlight'),5200);
  }
}

async function validateBeforeDownload(){
  const items=runValidations(false);
  const selected=new Set(Array.from(state.selected));
  const critical=items.filter(it=>it.type==='error' && (!it.turma || selected.has(it.turma)));
  if(critical.length){ toast('Corrija os erros antes de baixar. Use o botão “Ir para erro”.'); return false; }
  return true;
}

async function downloadSelected(kind){
  try{
    if(!(await validateBeforeDownload())) return;
    const turmas=Array.from(state.selected).sort(compareTurma);
    if(!turmas.length) return toast('Nenhuma turma selecionada.');
    toast(`Gerando ${kind==='pdf'?'PDF':'imagem'} de ${turmas.length} turma(s)...`);
    for(const t of turmas){
      if(kind==='pdf') await downloadPdfTurma(t); else await downloadPngTurma(t);
      await sleep(220);
    }
    toast(`${turmas.length} arquivo(s) enviado(s) para download.`);
  }catch(err){
    console.error(err);
    toast('Erro ao baixar: '+(err && err.message ? err.message : String(err)));
  }
}
async function downloadCurrent(kind){
  try{
    if(!state.previewTurma) return toast('Escolha uma turma na prévia.');
    const old=new Set(state.selected); state.selected=new Set([state.previewTurma]);
    const ok=await validateBeforeDownload(); state.selected=old; renderTurmas(); runValidations(false);
    if(!ok) return;
    toast(`Gerando ${kind==='pdf'?'PDF':'imagem'} da turma ${state.previewTurma}...`);
    if(kind==='pdf') await downloadPdfTurma(state.previewTurma); else await downloadPngTurma(state.previewTurma);
    toast('Arquivo enviado para download.');
  }catch(err){
    console.error(err);
    toast('Erro ao baixar: '+(err && err.message ? err.message : String(err)));
  }
}

async function canvasForTurma(turma, scale=1.55){
  const items=getItemsForTurma(turma);
  if(!items.length) throw new Error(`A turma ${turma} não tem conteúdos para gerar.`);
  return await drawReportCanvas(turma, items, scale);
}

async function getAssetImage(key){
  state._assetImages = state._assetImages || {};
  if(state._assetImages[key]) return state._assetImages[key];
  if(!state.assets[key]) throw new Error(`Imagem ${key} não carregada.`);
  const img=await loadImage(state.assets[key]);
  state._assetImages[key]=img;
  return img;
}
function loadImage(url){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error('Não consegui carregar imagem interna do relatório.')); img.src=url; }); }

function drawImageContain(ctx,img,x,y,w,h){
  const r=Math.min(w/img.width,h/img.height); const dw=img.width*r, dh=img.height*r;
  ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function splitLongWord(ctx,word,maxWidth){
  const out=[]; let part='';
  for(const ch of word){
    if(part && ctx.measureText(part+ch).width>maxWidth){ out.push(part); part=ch; }
    else part+=ch;
  }
  if(part) out.push(part); return out;
}
function wrapLines(ctx,text,maxWidth){
  const lines=[]; const paragraphs=String(text||'').replace(/\r/g,'').split('\n');
  for(const para of paragraphs){
    const trimmed=para.trim();
    if(!trimmed){ lines.push(''); continue; }
    const words=trimmed.split(/\s+/); let line='';
    for(const word of words){
      const pieces=ctx.measureText(word).width>maxWidth ? splitLongWord(ctx,word,maxWidth) : [word];
      for(const piece of pieces){
        const test=line ? line+' '+piece : piece;
        if(line && ctx.measureText(test).width>maxWidth){ lines.push(line); line=piece; }
        else line=test;
      }
    }
    if(line) lines.push(line);
  }
  while(lines.length && lines[lines.length-1]==='') lines.pop();
  return lines.length ? lines : [''];
}
function fitOneLine(ctx,text,maxWidth,startSize,minSize,fontFamily='Arial',weight='900'){
  let size=startSize;
  while(size>minSize){ ctx.font=`${weight} ${size}px ${fontFamily}`; if(ctx.measureText(text).width<=maxWidth) break; size-=1; }
  return size;
}
function layoutRowsForCanvas(ctx,items,cfg){
  const rows=[]; let total=0;
  for(const it of items){
    ctx.font=`900 ${cfg.discFont}px Arial`; const discLines=wrapLines(ctx,normalize(it.disciplina),cfg.discW-cfg.padX*2);
    ctx.font=`700 ${cfg.contentFont}px Arial`; const contLines=wrapLines(ctx,cleanText(it.conteudo),cfg.contW-cfg.padX*2);
    const h=Math.max(cfg.minRowH, discLines.length*cfg.discLineHeight+cfg.padY*2, contLines.length*cfg.lineHeight+cfg.padY*2);
    rows.push({...it, discLines, contLines, h}); total+=h;
  }
  return {rows,total};
}
function computeCanvasLayout(ctx,items,displayDateRow){
  const base={W:1240,H:1754,outer:18,margin:30,headerH:150,titleGap:24,titleH:50,dateH:displayDateRow?38:0,tableGap:40,discW:176};
  base.contentW=base.W-base.margin*2; base.contW=base.contentW-base.discW; base.tableY=base.margin+base.headerH+base.titleGap+base.titleH+base.dateH+base.tableGap; base.tableMaxH=base.H-base.margin-base.tableY;
  let cfg={...base,contentFont:19.5,discFont:15,lineHeight:23,discLineHeight:17,padX:14,padY:9,minRowH:46};
  let laid=layoutRowsForCanvas(ctx,items,cfg);
  let guard=0;
  while(laid.total>cfg.tableMaxH && guard<18){
    cfg.contentFont=Math.max(7.8,cfg.contentFont*.93);
    cfg.discFont=Math.max(7.6,cfg.discFont*.94);
    cfg.lineHeight=Math.max(8.4,cfg.contentFont*1.13);
    cfg.discLineHeight=Math.max(8.2,cfg.discFont*1.12);
    cfg.padY=Math.max(2.5,cfg.padY-.55);
    cfg.padX=Math.max(7,cfg.padX-.25);
    cfg.minRowH=Math.max(22,cfg.minRowH*.94);
    laid=layoutRowsForCanvas(ctx,items,cfg); guard++;
  }
  return {...cfg, rows:laid.rows, tableH:Math.min(laid.total,cfg.tableMaxH), totalRowsH:laid.total};
}
function drawCenteredLines(ctx,lines,x,y,w,h,lineHeight,font,fill){
  ctx.font=font; ctx.fillStyle=fill; ctx.textAlign='center'; ctx.textBaseline='top';
  const total=lines.length*lineHeight; let cy=y+(h-total)/2;
  for(const line of lines){ ctx.fillText(line,x+w/2,cy); cy+=lineHeight; }
}
function drawLeftLines(ctx,lines,x,y,w,h,lineHeight,font,fill){
  ctx.font=font; ctx.fillStyle=fill; ctx.textAlign='left'; ctx.textBaseline='top';
  const total=lines.length*lineHeight; let cy=y+(h-total)/2;
  for(const line of lines){ ctx.fillText(line,x,cy); cy+=lineHeight; }
}
async function drawReportCanvas(turma,items,scale=1.55){
  const W=1240,H=1754; const canvas=document.createElement('canvas'); canvas.width=Math.round(W*scale); canvas.height=Math.round(H*scale);
  const ctx=canvas.getContext('2d'); ctx.scale(scale,scale); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  const header=await getAssetImage('header'); const logo=await getAssetImage('logo');
  const displayDateRow=shouldDisplayDate();
  const layout=computeCanvasLayout(ctx,items,displayDateRow); const M=layout.margin, CW=layout.contentW;
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#111'; ctx.lineWidth=1.4; ctx.strokeRect(layout.outer,layout.outer,W-layout.outer*2,H-layout.outer*2);
  drawImageContain(ctx,header,M,M,CW,layout.headerH);
  const title=reportTitle(turma); const titleY=M+layout.headerH+layout.titleGap;
  ctx.fillStyle='#d80000'; ctx.fillRect(M,titleY,CW,layout.titleH);
  let titleSize=fitOneLine(ctx,title,CW-24,35,20,'Arial','900');
  ctx.font=`900 ${titleSize}px Arial`; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(title,M+CW/2,titleY+layout.titleH/2+1);
  if(displayDateRow){
    const dateY=titleY+layout.titleH;
    ctx.fillStyle='#002e82'; ctx.fillRect(M,dateY,CW,layout.dateH);
    const dateText='DATA: '+displayDate(state.date); let dateSize=fitOneLine(ctx,dateText,CW-24,25,16,'Arial','900');
    ctx.font=`900 ${dateSize}px Arial`; ctx.fillStyle='#fff'; ctx.fillText(dateText,M+CW/2,dateY+layout.dateH/2+1);
  }
  const tableX=M, tableY=layout.tableY, discW=layout.discW, contW=layout.contW; let y=tableY;
  for(let i=0;i<layout.rows.length;i++){
    const row=layout.rows[i]; const h=row.h;
    ctx.fillStyle=i%2===0?'#ffffff':'#dcecf9'; ctx.fillRect(tableX,y,CW,h);
    y+=h;
  }
  const tableH=y-tableY;
  ctx.save(); ctx.beginPath(); ctx.rect(tableX,tableY,CW,tableH); ctx.clip(); ctx.globalAlpha=.115; drawImageContain(ctx,logo,tableX+(CW-720)/2,tableY+(tableH-720)/2,720,720); ctx.restore();
  y=tableY; ctx.strokeStyle='#86b7e6'; ctx.lineWidth=1.2;
  for(const row of layout.rows){
    const h=row.h; ctx.strokeRect(tableX,y,CW,h); ctx.beginPath(); ctx.moveTo(tableX+discW,y); ctx.lineTo(tableX+discW,y+h); ctx.stroke();
    drawCenteredLines(ctx,row.discLines,tableX+6,y,discW-12,h,layout.discLineHeight,`900 ${layout.discFont}px Arial`,'#000');
    drawLeftLines(ctx,row.contLines,tableX+discW+layout.padX,y,contW-layout.padX*2,h,layout.lineHeight,`700 ${layout.contentFont}px Arial`,'#000');
    y+=h;
  }
  return canvas;
}
async function canvasToBlob(canvas,type='image/png',quality=.94){ return await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Não foi possível gerar o arquivo de imagem.')),type,quality)); }
async function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  try{
    if(typeof chrome!=='undefined' && chrome.downloads && chrome.downloads.download){
      await new Promise((resolve,reject)=>{
        chrome.downloads.download({url, filename:name, saveAs:false, conflictAction:'uniquify'}, id=>{
          const err=chrome.runtime && chrome.runtime.lastError;
          if(err) reject(new Error(err.message)); else resolve(id);
        });
      });
    }else{
      downloadUrl(url,name);
    }
  }finally{ setTimeout(()=>URL.revokeObjectURL(url),30000); }
}
async function downloadPngTurma(turma){ const canvas=await canvasForTurma(turma,1.55); const blob=await canvasToBlob(canvas,'image/png'); await downloadBlob(blob, `${safeName(fileBase(turma))}.png`); }
async function downloadPdfTurma(turma){ const canvas=await canvasForTurma(turma,1.55); const jpeg=canvas.toDataURL('image/jpeg',0.94); const blob=makePdfFromJpegs([{dataUrl:jpeg,width:canvas.width,height:canvas.height}]); await downloadBlob(blob, `${safeName(fileBase(turma))}.pdf`); }
function downloadUrl(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }

function makePdfFromJpegs(images){
  const enc=new TextEncoder(); const chunks=[]; let offset=0; const offsets=[0];
  function add(data){ let u; if(typeof data==='string') u=enc.encode(data); else u=data; chunks.push(u); offset+=u.length; }
  function obj(id, content){ offsets[id]=offset; add(`${id} 0 obj\n`); if(Array.isArray(content)){ content.forEach(add); } else add(content); add(`\nendobj\n`); }
  const pageW=595.28, pageH=841.89;
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageObjs=[]; let next=3;
  const pageInfos=[];
  images.forEach((im,i)=>{ const pageObj=next++, contentObj=next++, imageObj=next++; pageObjs.push(pageObj); pageInfos.push({im,pageObj,contentObj,imageObj,name:`Im${i+1}`}); });
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Kids [${pageObjs.map(id=>id+' 0 R').join(' ')}] /Count ${pageObjs.length} >>`);
  for(const p of pageInfos){
    const stream=`q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/${p.name} Do\nQ\n`;
    obj(p.pageObj,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /${p.name} ${p.imageObj} 0 R >> >> /Contents ${p.contentObj} 0 R >>`);
    obj(p.contentObj,[`<< /Length ${enc.encode(stream).length} >>\nstream\n`, stream, '\nendstream']);
    const bytes=base64ToBytes(p.im.dataUrl.split(',')[1]);
    obj(p.imageObj,[`<< /Type /XObject /Subtype /Image /Width ${p.im.width} /Height ${p.im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, '\nendstream']);
  }
  const xref=offset; const size=next;
  add(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for(let i=1;i<size;i++) add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const total=chunks.reduce((s,c)=>s+c.length,0); const out=new Uint8Array(total); let pos=0; chunks.forEach(c=>{ out.set(c,pos); pos+=c.length; });
  return new Blob([out],{type:'application/pdf'});
}
function base64ToBytes(b64){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr; }


function escapeHtml(s){ return String(s??'').replace(/[&<>"]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }

async function handleFile(file){
  if(!file) return;
  await prepareForNewImport();
  const generation=state.importGeneration;
  try{
    toast('Lendo planilha...');
    const buffer=await gssfReadSpreadsheetArrayBuffer(file);
    const rawFileHash=await hashArrayBuffer(buffer);
    const payload=await parseXlsxFile(file, buffer);
    if(generation!==state.importGeneration) return;
    payload.fileMeta=buildFileMeta(file, rawFileHash);
    await applyPayload(payload);
    if(generation!==state.importGeneration) return;
    el.fileInput.value='';
    toast(state.columns
      ? `Planilha lida: ${state.turmas.length} turma(s) encontradas.`
      : 'Planilha carregada. Configure as colunas obrigatórias em Mais configurações.');
  } catch(err){
    console.error(err);
    resetAll();
    toast('Erro ao ler planilha: '+err.message);
    el.validationSummary.className='validation-summary error';
    el.validationSummary.textContent='Erro ao ler planilha.';
  }
}