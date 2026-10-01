import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const guard = await read('src/content/core/11-runtime-context.js');
const activity = await read('src/content/core/08-activity.js');
const eligibility = await read('src/content/core/04-page-and-eligibility.js');
const images = await read('src/content/clipboard-word/08-images-and-clipboard.js');
let passed = 0;
function check(condition, message) { assert.ok(condition, message); passed++; }

function harness() {
  const notices = [];
  const timers = new Map();
  const removed = [];
  let nextTimer = 1;
  const context = {
    APP: { busy:false, storageReady:false, lifecycle:{destroyed:false} },
    chrome: { runtime:{ id:'test-extension', sendMessage(_message, callback) { callback({ok:true,dataUrl:'data:image/png;base64,AQ=='}); } } },
    GSSF_STORAGE: { async init() {} },
    document: {
      getElementById(id) { return notices.find(n=>n.id===id); },
      createElement() { return {children:[],setAttribute(){},addEventListener(){},append(...children){this.children.push(...children);}}; },
      querySelectorAll(selector) { return selector.includes('#gssf-copy-source') ? [{remove(){removed.push(true);}}] : []; },
      documentElement:{ appendChild(node){notices.push(node);} },
      body:{ appendChild(){} }
    },
    location:{href:'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=test-only',reload(){}},
    console:{warn(){throw new Error('Aviso inesperado');},error(){throw new Error('Erro inesperado');}},
    destroyExtension(){context.APP.lifecycle.destroyed=true; context.destroyedCount++;},
    destroyedCount:0,
    isRealFormsDocument:()=>true,
    setBusy(value){context.APP.busy=value;},
    scheduleAutoAnalysis(){context.analysisCount++;}, analysisCount:0,
    setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},
    log(){}, toast(){}, setProgress(){},
    sleep:async()=>{}, normalizeText:value=>String(value||'').toLowerCase(), normalizeMathAlternativesForWordFormulas:async()=>({changed:0,failed:0}),
    URL, Blob, Promise, Map, Set
  };
  vm.createContext(context);
  vm.runInContext(`${guard}\n${activity}\n${eligibility}\n${images}`, context);
  return {context,notices,timers,removed};
}

{
  const {context:c,notices,timers}=harness();
  check(c.extensionContextAvailable(), 'Contexto válido deve ser aceito.');
  let initCalls=0;
  c.GSSF_STORAGE.init=async()=>{initCalls++;throw new Error('Extension context invalidated.');};
  check(await c.ensurePrivateStorageReady()===false, 'Inicialização invalidada deve falhar sem console de erro.');
  check(c.APP.lifecycle.destroyed && c.destroyedCount===1, 'Instância invalidada deve encerrar uma vez.');
  check(notices.length===1 && notices[0].children.at(-1).textContent==='Recarregar aba do Forms', 'Deve oferecer recuperação explícita.');
  await c.ensurePrivateStorageReady();
  c.scheduleEligibilityCheck();
  check(initCalls===1 && timers.size===0, 'Contexto perdido não pode repetir leitura ou agendar monitor.');
  await c.withBusy(()=>{throw new Error('Ação antiga foi executada');});
  check(c.analysisCount===0, 'Ação encerrada não pode reativar análise.');
  check(!c.handleInvalidExtensionContext(new Error('HTTP 403')), 'Erros de rede não podem ser classificados como atualização.');
}
{
  const {context:c,notices}=harness();
  Object.defineProperty(c.chrome.runtime,'id',{get(){throw new Error('Extension context invalidated.');}});
  check(!c.extensionContextAvailable(), 'Getter de runtime invalidado não pode lançar erro não tratado.');
  let ran=false;
  await c.withBusy(async()=>{ran=true;});
  check(!ran && notices.length===1 && !c.APP.busy, 'Ação em contexto inválido deve parar antes de executar.');
}
{
  const {context:c,timers}=harness();
  const data=await c.fetchImageThroughBackground('https://statics.forms.microsoft/image.png');
  check(data.startsWith('data:image/') && timers.size===0, 'Resposta normal deve limpar seu prazo.');
  c.chrome.runtime.sendMessage=()=>{throw new Error('Extension context invalidated.');};
  await assert.rejects(c.fetchImageThroughBackground('https://statics.forms.microsoft/image.png'), /context invalidated/);
  check(timers.size===0, 'Exceção síncrona deve limpar seu prazo.');
  c.chrome.runtime.sendMessage=(_msg, callback)=>{c.chrome.runtime.id=undefined;callback({ok:true,dataUrl:'data:image/png;base64,AQ=='});};
  await assert.rejects(c.fetchImageThroughBackground('https://statics.forms.microsoft/image.png'), e=>e.code==='GSSF_CONTEXT_INVALIDATED');
  check(timers.size===0, 'Invalidação durante resposta deve cancelar sem aceitar imagem.');
}
{
  const {context:c,timers}=harness();
  c.chrome.runtime.sendMessage=()=>{};
  const pending=c.fetchImageThroughBackground('https://statics.forms.microsoft/image.png');
  const rejected=assert.rejects(pending,/excedeu o prazo/);
  [...timers.values()][0]();
  await rejected;
  check(timers.size===0, 'Background sem resposta deve terminar e limpar o prazo.');
}
{
  const {context:c}=harness();
  let requests=0;
  c.copyImageSourceFromClone=()=> 'https://statics.forms.microsoft/image.png';
  c.getCopyImageDataUrl=async()=>{requests++;throw new Error('Extension context invalidated.');};
  const image={setAttribute(){throw new Error('Não deve substituir por link externo');}};
  await assert.rejects(c.inlineImagesAsDataUris({querySelectorAll:()=>Array(28).fill(image)}), e=>c.isInvalidExtensionContext(e));
  check(requests<=4 && c.APP.extensionContextLost, '28 imagens não devem repetir erro e continuar com links externos.');
}
{
  const {context:c}=harness();
  let cleaned=0;
  c.buildClipboardContainerFromBlocks=()=>({querySelectorAll:()=>[],remove(){cleaned++;}});
  c.inlineImagesAsDataUris=async()=>{throw new Error('Extension context invalidated.');};
  await assert.rejects(c.prepareCopyPayloadFromBlocks([]),/context invalidated/);
  check(cleaned===1, 'Falha deve remover o clone temporário.');
}
{
  const {context:c}=harness();
  let writes=0;
  c.prepareCopyPayloadFromBlocks=async()=>({inlineResult:{total:1,converted:0,failed:1},dataImageCount:0});
  c.window={getSelection:()=>({})};
  c.navigator={clipboard:{write:async()=>{writes++;}}};
  await assert.rejects(c.copyBlocksToClipboard([],null),/A cópia foi cancelada/);
  check(writes===0, 'Cópia com imagem faltante não deve sobrescrever o clipboard.');
  c.prepareCopyPayloadFromBlocks=async()=>({inlineResult:{total:0,converted:0,failed:0},dataImageCount:0});
  await assert.rejects(c.copyBlocksToClipboard([],null,1),/A cópia foi cancelada/);
  check(writes===0, 'Imagem ausente no clone também deve cancelar antes de escrever no clipboard.');
}
{
  const {context:c}=harness();
  const source=await read('src/content/clipboard-word/09-word-export.js');
  let downloads=0;
  Object.assign(c,{
    withBusy:async fn=>fn(), log(){},showTaskOverlay(){},hideTaskOverlay(){},pageMode:()=> 'edição',
    stepProgress:async()=>{},scrollAll:async()=>{},returnToEditIfPreview:async()=>{},
    collectAllQuestionSnapshotsForCopy:async()=>[{number:1,imageCount:1,imageKeys:['test-image']}],
    collectQuestionBlocks:()=>[{}],countContentImages:()=>({count:1}),blocksFromQuestionSnapshots:()=>[{}],
    prepareCopyPayloadFromBlocks:async()=>({inlineResult:{total:1,failed:1},dataImageCount:0}),
    isEmptyModel:()=>false,resetProgressSoon(){},getFormTitle:()=> 'Teste',downloadFile(){downloads++;}
  });
  vm.runInContext(source,c);
  await assert.rejects(c.runDownloadWordQuestions(),/O download foi cancelado/);
  check(downloads===0, 'Arquivo incompleto não pode ser baixado.');
  c.prepareCopyPayloadFromBlocks=async()=>({innerHtml:'<article><img src="data:image/png;base64,AQ=="></article>',inlineResult:{total:1,converted:1,failed:0},dataImageCount:1});
  await c.runDownloadWordQuestions();
  check(downloads===1, 'Download normal com imagens embutidas deve permanecer disponível.');
}
console.log(`${passed} verificações de recuperação do contexto e integridade do Word aprovadas.`);
