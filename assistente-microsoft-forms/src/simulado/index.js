(() => {
  'use strict';
  const COVER_TITLE = 'word/document.xml:text:34';
  const KEY = 'gssf:simulado-word-v1';
  const native = (action, data = {}) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GSSF_SIMULADO_WORD', action, ...data }, result => {
      const error = chrome.runtime.lastError;
      if (error || !result?.ok) reject(new Error(error?.message || result?.error || 'Conector do Word indisponível.'));
      else resolve(result);
    });
  });
  const el = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'checked') node.checked = !!value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  };
  let current = null;
  const drafts = new Map();
  function stored() { try { return JSON.parse(globalThis.GSSF_STORAGE.getItem(KEY) || '{}'); } catch { return {}; } }
  function sanitize(root) {
    root.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach(n => n.remove());
    root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || /^(href|src)$/i.test(a.name) && /^javascript:/i.test(a.value)) n.removeAttribute(a.name);
    }));
    return root;
  }
  async function open(context) {
    if (current) { current.dialog.focus(); return; }
    const prefs = stored();
    const draftKey=location.href+'|'+context.title();
    const state = { options: { year: new Date().getFullYear(), areas: '', edits: [], coverTitle: '', ...prefs }, layers: [], capture: drafts.get(draftKey)||null, result: null, busy: false, tab: 'Capa', selected: null };
    state.options.coverTitle=state.options.coverTitle || state.options.edits.find(e=>e.id===COVER_TITLE)?.text || '';
    const shade = el('div', { id: 'gssf-simulado-shade' });
    const dialog = el('section', { id: 'gssf-simulado-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Finalizar simulado no Word', tabindex: '-1' });
    current = { dialog }; shade.append(dialog);document.body.append(shade);
    const head = el('header', { class: 'gsw-head' });
    const titles = el('div');titles.append(el('strong', {}, 'Finalizar simulado'), el('span', {}, 'Modelo original • Word local • macro 6.3'));
    const close = el('button', { class: 'gsw-close', type: 'button', 'aria-label': 'Fechar editor do simulado' }, '×');head.append(titles, close);dialog.append(head);
    const nav = el('nav', { class: 'gsw-tabs', 'aria-label': 'Etapas do simulado' });
    const content = el('div', { class: 'gsw-content' });
    const status = el('div', { class: 'gsw-status', role: 'status', 'aria-live': 'polite' }, 'Conectando ao Word local…');
    dialog.append(nav, content, status);
    const previousFocus = document.activeElement;
    function dismiss() { if (state.busy) return;shade.remove();current=null;previousFocus?.focus?.(); }
    close.onclick=dismiss;
    shade.addEventListener('keydown', event => {
      if (event.key === 'Escape') dismiss();
      if (event.key === 'Tab') {
        const nodes=[...dialog.querySelectorAll('button,input,select,textarea,[contenteditable=true]')].filter(n=>!n.disabled && n.offsetParent!==null);
        if (!nodes.length) return;
        if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
        else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
      }
    });
    function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
    function persist(){globalThis.GSSF_STORAGE.setItem(KEY,JSON.stringify(state.options));invalidate();}
    function invalidate(){state.result=null;content.querySelector('.gsw-result')?.remove();}
    async function task(label,fn) {
      if(state.busy)return;
      state.busy=true;close.disabled=true;message(label);
      dialog.setAttribute('aria-busy','true');
      dialog.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=true);
      dialog.querySelectorAll('[contenteditable=true]').forEach(n=>n.contentEditable='false');
      try{await fn();}catch(error){message(error.message,true);}
      finally{state.busy=false;close.disabled=false;dialog.removeAttribute('aria-busy');render();}
    }
    function button(text,fn,primary=false){const b=el('button',{class:'gsw-button'+(primary?' primary':''),type:'button'},text);b.onclick=fn;return b;}
    function field(parent,label,type,value,onchange,attrs={}){
      const l=el('label',{class:'gsw-field'});l.append(el('span',{},label));
      const input=el(type==='textarea'?'textarea':type==='select'?'select':'input',{...(type==='textarea'||type==='select'?{}:{type}),...attrs});
      if(type==='select'){for(const choice of attrs.choices||[])input.append(el('option',{value:choice.value},choice.label));input.removeAttribute('choices');}
      if(type==='checkbox')input.checked=!!value;else input.value=value??'';
      input.addEventListener(type==='file'||type==='checkbox'||type==='select'?'change':'input',()=>onchange(type==='checkbox'?input.checked:input.value,input));l.append(input);parent.append(l);return input;
    }
    function editFor(layer){return state.options.edits.find(e=>e.id===layer.id)||{};}
    function update(layer,patch){if(layer.id===COVER_TITLE&&'text' in patch)state.options.coverTitle=patch.text;let edit=state.options.edits.find(e=>e.id===layer.id);if(!edit){edit={id:layer.id};state.options.edits.push(edit);}Object.assign(edit,patch);persist();}
    function render(){
      nav.replaceChildren();for(const name of ['Capa','Verso e redação','Cabeçalhos e rodapés','Selos laterais','Questões','Finalizar']){
        const b=button(name,()=>{state.tab=name;state.selected=null;render();});b.classList.toggle('active',state.tab===name);b.disabled=state.busy;nav.append(b);
      }
      content.replaceChildren();
      if(state.tab==='Questões')renderQuestions();else if(state.tab==='Finalizar')renderFinish();else renderLayers();
      content.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=state.busy);
    }
    function coverTitleField(parent){
      field(parent,'Título da capa / turma','text',state.options.coverTitle,value=>{state.options.coverTitle=value;update({id:COVER_TITLE},{text:value});const text=content.querySelector('textarea');if(state.tab==='Capa'&&state.selected===COVER_TITLE&&text)text.value=value;},{placeholder:'Ex.: 8º ANO A e B',maxlength:120,required:'required'});
      parent.append(el('p',{class:'gsw-help'},'Preencha o título que deve aparecer na capa. Esse texto é definido por você e fica salvo para os próximos simulados.'));
    }
    function renderLayers(){
      if(state.tab==='Capa')coverTitleField(content);
      const layout=el('div',{class:'gsw-layout'});const list=el('aside',{class:'gsw-layer-list'});const inspector=el('div',{class:'gsw-inspector'});layout.append(list,inspector);content.append(layout);
      list.append(el('h3',{},'Camadas do modelo'));
      const choices=state.layers.filter(l=>l.group===state.tab);
      if(!choices.length)list.append(el('p',{class:'gsw-help'},'As camadas aparecem após a conexão com o Word.'));
      for(const layer of choices){const b=button((layer.kind==='art'?'▧ ':'T ')+(layer.id===COVER_TITLE?'Título da capa / turma — '+(state.options.coverTitle||'Preencher manualmente'):layer.label),()=>{state.selected=layer.id;render();});b.classList.add('gsw-layer');b.classList.toggle('selected',state.selected===layer.id);list.append(b);}
      const layer=state.layers.find(l=>l.id===state.selected)||choices[0];
      if(!layer){inspector.append(el('p',{},'Conectando ao modelo original…'));return;}
      state.selected=layer.id;const edit=editFor(layer);
      inspector.append(el('h3',{},layer.id===COVER_TITLE?'Título da capa / turma':layer.label));
      if(layer.side)inspector.append(el('p',{class:'gsw-help'},`O selo ${layer.side==='left'?'esquerdo':'direito'} é repetido nas páginas pares e ímpares. A arte original acompanha automaticamente o ano ${state.options.year}, definido em Finalizar. Ao enviar uma arte própria, inclua nela o ano desejado.`));
      if(layer.kind==='text'){
        field(inspector,'Texto da camada','textarea',layer.id===COVER_TITLE?state.options.coverTitle:edit.text??layer.text,value=>{update(layer,{text:value});if(layer.id===COVER_TITLE)content.querySelector('input[placeholder="Ex.: 8º ANO A e B"]').value=value;},{rows:5});
        inspector.append(el('p',{class:'gsw-help'},'Use {{ano}} para inserir o ano escolhido. As cópias da mesma camada no modelo são atualizadas juntas.'));
        const grid=el('div',{class:'gsw-grid'});inspector.append(grid);
        field(grid,'Fonte','text',edit.font??layer.font??'Arial',value=>update(layer,{font:value}),{list:'gsw-fonts',placeholder:'Nome da fonte instalada no Word'});
        const fonts=el('datalist',{id:'gsw-fonts'});for(const name of ['Arial','Arial Black','Arial Narrow','Calibri','Aptos','Times New Roman','Segoe UI','Verdana'])fonts.append(el('option',{value:name}));grid.append(fonts);
        field(grid,'Tamanho (pt)','number',edit.size??layer.size??11,value=>update(layer,{size:Number(value)}),{min:5,max:160,step:0.5});
        field(grid,'Cor do texto','color',edit.color??layer.color??'#000000',value=>update(layer,{color:value}));
        field(grid,'Alinhamento','select',edit.align??layer.align??'left',value=>update(layer,{align:value}),{choices:[{value:'left',label:'Esquerda'},{value:'center',label:'Centro'},{value:'right',label:'Direita'},{value:'both',label:'Justificado'}]});
        field(grid,'Negrito','checkbox',edit.bold??layer.bold??false,value=>update(layer,{bold:value}));
        field(grid,'Itálico','checkbox',edit.italic??layer.italic??false,value=>update(layer,{italic:value}));
      }else{
        if(layer.media?.length>1)field(inspector,'Imagem do grupo a substituir','select',edit.mediaTarget??layer.media[0],value=>update(layer,{mediaTarget:value}),{choices:layer.media.map((value,index)=>({value,label:'Imagem '+(index+1)+' do grupo'}))});
        if(layer.thumbnail){const img=el('img',{class:'gsw-art-preview',src:edit.image||layer.thumbnail,alt:layer.label});inspector.append(img);
          if(layer.side&&!edit.image)inspector.append(el('p',{class:'gsw-help'},`Prévia da arte original do modelo. O Word será gerado com o ano ${state.options.year}.`));
          const upload=field(inspector,'Trocar arte (PNG, JPG ou WebP)','file','',async(_,input)=>{
            try{const file=input.files?.[0];if(!file)return;if(file.size>12*1024*1024)throw new Error('Escolha uma imagem de até 12 MB.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPG ou WebP.');
              const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});update(layer,{image:data,...(layer.media?.length>1?{mediaTarget:editFor(layer).mediaTarget??layer.media[0]}:{})});render();message('Arte atualizada e salva neste navegador.');
            }catch(error){message(error.message,true);}
          },{accept:'image/png,image/jpeg,image/webp'});upload.removeAttribute('value');
          inspector.append(el('p',{class:'gsw-help'},'A arte mantém sua posição e proporções do modelo. Imagens reutilizadas pelo modelo são trocadas em todas as suas ocorrências.'));
        }else inspector.append(el('p',{class:'gsw-help'},'Forma vetorial original. Ajuste a posição e as dimensões abaixo.'));
      }
      const geo={...layer.geometry,...edit.geometry};
      if(Object.keys(geo).length){const grid=el('div',{class:'gsw-grid'});inspector.append(el('h4',{},layer.geometryScope==='group'?'Posição dentro do grupo e dimensões':'Posição e dimensões da camada'),grid);
        for(const [key,label] of [['x','Horizontal (cm)'],['y','Vertical (cm)'],['width','Largura (cm)'],['height','Altura (cm)']])if(geo[key]!=null)field(grid,label,'number',geo[key],value=>update(layer,{geometry:{...editFor(layer).geometry,[key]:Number(value)}}),{step:0.1,min:key==='width'||key==='height'?0.1:-30,max:40});
      }
      const actions=el('div',{class:'gsw-actions'});inspector.append(actions);
      actions.append(button('Restaurar esta camada',()=>{if(layer.id===COVER_TITLE)state.options.coverTitle='';state.options.edits=state.options.edits.filter(e=>e.id!==layer.id);persist();render();message('Camada restaurada.');}));
      if(state.tab==='Capa'||state.tab==='Verso e redação'){
        const preview=el('details',{class:'gsw-model-preview'});preview.append(el('summary',{},'Ver modelo original'));
        preview.append(el('img',{src:chrome.runtime.getURL('assets/'+(state.tab==='Capa'?'simulado-capa.png':'simulado-verso.png')),alt:state.tab+' do modelo original'}));inspector.append(preview);
      }
    }
    async function capture(){
      let data;
      shade.style.visibility='hidden';
      try{data=await context.capture();}finally{shade.style.visibility='';dialog.focus();}
      if(!data)throw new Error('Não foi possível capturar as questões.');
      state.capture=data;drafts.set(draftKey,data);invalidate();if(!state.options.areas && data.areas)state.options.areas=data.areas;
      message(`${data.count} questões capturadas; ${data.images} imagens conferidas. Edite a cópia abaixo antes de finalizar.`);
    }
    function renderQuestions(){
      const actions=el('div',{class:'gsw-actions'});content.append(actions);
      actions.append(button(state.capture?'Recarregar questões do Forms':'Carregar questões do Forms',()=>task('Capturando questões e conferindo imagens…',capture),true));
      content.append(el('p',{class:'gsw-help'},'Edite enunciados, alternativas, textos e imagens nesta cópia, mantida enquanto esta aba estiver aberta. A formatação final será aplicada pela macro no Word. Para manter as fórmulas nativas, preserve os blocos de equação.'));
      if(!state.capture)return;
      const toolbar=el('div',{class:'gsw-toolbar'});content.append(toolbar);
      for(const [text,cmd] of [['Negrito','bold'],['Itálico','italic'],['Sublinhado','underline'],['Alinhar à esquerda','justifyLeft'],['Centralizar','justifyCenter']]){
        const b=button(text,()=>{document.execCommand(cmd,false);saveQuestions();});b.onmousedown=e=>e.preventDefault();toolbar.append(b);
      }
      const editor=el('div',{class:'gsw-question-editor',contenteditable:'true',role:'textbox','aria-multiline':'true','aria-label':'Editar questões do simulado'});
      editor.innerHTML=state.capture.innerHtml;sanitize(editor);content.append(editor);
      function saveQuestions(){sanitize(editor);state.capture.innerHtml=editor.innerHTML;invalidate();}
      editor.addEventListener('input',saveQuestions);
      editor.addEventListener('paste',()=>setTimeout(saveQuestions,0));
      let selectedImage=null;
      editor.addEventListener('click',e=>{selectedImage=e.target instanceof HTMLImageElement?e.target:null;});
      const uploads=el('div',{class:'gsw-grid'});content.append(uploads);
      field(uploads,'Inserir ou trocar imagem selecionada','file','',async(_,input)=>{
        try{const file=input.files?.[0];if(!file)return;if(file.size>12*1024*1024)throw new Error('Escolha uma imagem de até 12 MB.');
          const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
          if(selectedImage)selectedImage.src=src;else editor.append(el('p',{},''),el('img',{src,alt:'Imagem inserida na prova'}));saveQuestions();
        }catch(error){message(error.message,true);}
      },{accept:'image/png,image/jpeg,image/webp'});
      field(uploads,'Largura da imagem selecionada (cm)','number','',value=>{if(!selectedImage){message('Clique primeiro em uma imagem nas questões.',true);return;}selectedImage.style.width=Number(value)+'cm';selectedImage.style.height='auto';saveQuestions();},{min:0.5,max:18,step:0.1});
    }
    function renderFinish(){
      const card=el('div',{class:'gsw-final-card'});content.append(card);
      card.append(el('h3',{},'Preparar documento final'));
      coverTitleField(card);
      field(card,'Ano do simulado','number',state.options.year,value=>{state.options.year=Number(value);persist();},{min:2000,max:2099,step:1});
      field(card,'Áreas e início de cada área','textarea',state.options.areas,value=>{state.options.areas=value.trim();persist();},{rows:4,placeholder:'1|LINGUAGENS, CÓDIGOS E SUAS TECNOLOGIAS;18|MATEMÁTICA E SUAS TECNOLOGIAS'});
      card.append(el('p',{class:'gsw-help'},'Formato: início|título;início|título. A primeira área começa em 1. Deixe vazio para a macro identificar as áreas do modelo.'));
      card.append(el('p',{class:'gsw-help'},'O arquivo usa o modelo original, equações editáveis e a macro 6.3 instalada. A numeração das páginas é contínua para imprimir uma página individual.'));
      const actions=el('div',{class:'gsw-actions'});card.append(actions);
      actions.append(button('Baixar Word já formatado',()=>task('Preparando o documento no Word local…',async()=>{
        if(!state.options.coverTitle.trim())throw new Error('Preencha o título da capa / turma antes de baixar o Word.');
        const year=Number(state.options.year);if(!Number.isInteger(year)||year<2000||year>2099)throw new Error('Escolha um ano entre 2000 e 2099.');
        if(!state.capture)await capture();
        message('Executando a macro 6.3 e conferindo conteúdo, imagens e paginação…');
        const holder=document.createElement('div');holder.innerHTML=state.capture.innerHtml;sanitize(holder);
        const html=context.buildHtml({innerHtml:holder.innerHTML},context.title());
        const images=holder.querySelectorAll('img').length;
        state.result=await native('generate',{html,title:context.title(),expectedQuestions:state.capture.count,expectedImages:images,options:state.options});
        message(`Concluído: ${state.result.questions} questões, ${state.result.images} imagens, ${state.result.equations} equações e ${state.result.pages} páginas. Word salvo em Downloads / Simulados Assistente Forms.`);
      }),true));
      if(state.result){
        const info=el('div',{class:'gsw-result'});info.append(el('strong',{},'Prova finalizada e conferida'),el('p',{},state.result.docx));card.append(info);
        const ready=el('div',{class:'gsw-actions'});info.append(ready);
        ready.append(button('Abrir e revisar no Word',()=>task('Abrindo documento no Word…',async()=>{await native('open',{path:state.result.docx});message('Documento aberto no Word para revisão e edição de todos os elementos.');})),button('Opções de impressão no Word',()=>task('Abrindo opções de impressão…',async()=>{await native('open',{path:state.result.docx,print:true});message('Solicitação de opções de impressão enviada ao Word. Nenhuma página foi enviada à impressora.');})));
      }
      const reset=button('Restaurar personalização do modelo',()=>{state.options.edits=[];state.options.areas='';state.options.coverTitle='';persist();render();message('Personalização restaurada; o ano foi preservado.');});card.append(reset);
    }
    render();dialog.focus();
    await task('Lendo camadas do modelo original…',async()=>{
      const result=await native('model');state.layers=result.layers;
      if((state.options.layoutVersion||1)<2){
        state.options.edits=state.options.edits.filter(edit=>state.layers.some(layer=>layer.id===edit.id));
        for(const edit of state.options.edits){
          const layer=state.layers.find(layer=>layer.id===edit.id);
          if(!edit.geometry)continue;
          if(edit.id==='word/document.xml:text:1'&&edit.geometry.y===14.2)delete edit.geometry.y;
          for(const axis of ['x','y'])if(edit.geometry[axis]!=null&&layer.geometry?.[axis]!=null&&layer.legacyGeometry?.[axis]!=null)edit.geometry[axis]+=layer.geometry[axis]-layer.legacyGeometry[axis];
        }
        state.options.layoutVersion=2;persist();
      }
      message('Word conectado. Personalize as camadas ou vá a Finalizar para baixar o documento.');
    });
  }
  globalThis.GSSF_SIMULADO=Object.freeze({open});
})();
