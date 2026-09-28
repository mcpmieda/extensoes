
  'use strict';
  const ORGANIZER_SOURCE_VERSION = '1.0.9';
  const ORGANIZER_SOURCE_HASHES = Object.freeze({"html": "5cb12bdfd35b4206265a84274a1c8491b761419259375f68c9a4e97e19a61f0a", "css": "371e37fc56f0bc67a2c2928be33c8a02befc26a0065f534e57ed5cb6c125916b", "body": "80e33b3a78a13b02bb94d6b5aac579acbf8d8015c191c7919d7651f4768a6101", "script": "92600948f53973778eb80a99416ac00496f6b5c3da610e169b831bd1284097cc", "adaptedScript": "a7d76d9fc359c8292736ed83f12cb51e4d9b3aac0b59f724ae180d5ba2ed2b7d", "jszipUpstream": "d14e71a95ef3290dec66a9cfdd8a37c2dd624f6f2b594c4512f607d4a56e19fc", "jszipRuntime": "17350c989e79ac0fd2b9e2b040140a7ce41427deb1edf9c3415d24784b8fb876", "jszipCspPatch": "legacy setImmediate string-callback fallback removed; function callbacks unchanged", "headerAsset": "081717e4ce648e48daa8fbd9a1072d2c314129e4db4b4107fc90301476524153", "logoAsset": "c3dcd16de2b761a19f76980c7f43d60dab099f921ad0e843f937fa4298768783"});
  const ORGANIZER_STORAGE_SOURCE_PREFIX = 'conteudosAvaliacoesV5:';
  const ORGANIZER_STORAGE_CANONICAL_PREFIX = 'gssf:organizador:conteudos:';
  const ORGANIZER_ASSET_PATHS = Object.freeze({'cabecalho.jpg':'assets/organizer-cabecalho.jpg','logo.png':'assets/organizer-logo.png'});
  const ORGANIZER_ORIGINAL_CSS = __GSSF_RESOURCE__("ORGANIZER_ORIGINAL_CSS");
  const ORGANIZER_ORIGINAL_BODY = __GSSF_RESOURCE__("ORGANIZER_ORIGINAL_BODY");
  const ORGANIZER_RUNTIME_CSS = __GSSF_RESOURCE__("ORGANIZER_RUNTIME_CSS");
  let mounted=false,hostPanel=null,shadowRoot=null,runtime=null,resizeObserver=null,mountPromise=null,assetDataPromise=null;

  function workspaceHtml(){return '<div class="gssf-native-organizer-host" id="gssf-native-organizer-host" data-source-version="1.0.9"></div>';}
  function createOrganizerDocument(root,appRoot,listenerRegistry){
    return {
      getElementById:id=>root.getElementById(id),
      querySelector:selector=>root.querySelector(selector),
      querySelectorAll:selector=>root.querySelectorAll(selector),
      createElement:tag=>globalThis.document.createElement(tag),
      addEventListener:(type,listener,options)=>{root.addEventListener(type,listener,options);listenerRegistry.push([root,type,listener,options]);},
      removeEventListener:(type,listener,options)=>root.removeEventListener(type,listener,options),
      body:appRoot,
      activeElement:globalThis.document.activeElement
    };
  }
  function organizerStorageKey(key){
    const value=String(key||'');
    if(!value.startsWith(ORGANIZER_STORAGE_SOURCE_PREFIX))throw new Error(`Chave do Organizador fora do namespace: ${value}`);
    return ORGANIZER_STORAGE_CANONICAL_PREFIX+value.slice(ORGANIZER_STORAGE_SOURCE_PREFIX.length);
  }
  function organizerSourceKey(key){return ORGANIZER_STORAGE_SOURCE_PREFIX+String(key||'').slice(ORGANIZER_STORAGE_CANONICAL_PREFIX.length);}
  function parseOrganizerValue(value){if(value==null)return undefined;try{return JSON.parse(String(value));}catch(_){return value;}}
  function createOrganizerStorageAdapter(){
    const storage=globalThis.GSSF_STORAGE;
    return Object.freeze({
      async getAll(){const out={};(storage?.entries?.()||[]).forEach(([key,value])=>{if(String(key).startsWith(ORGANIZER_STORAGE_CANONICAL_PREFIX))out[organizerSourceKey(key)]=parseOrganizerValue(value);});return out;},
      async get(key){if(key==null)return this.getAll();if(Array.isArray(key)){const out={};key.forEach(item=>{const value=parseOrganizerValue(storage?.getItem?.(organizerStorageKey(item)));if(value!==undefined)out[item]=value;});return out;}return parseOrganizerValue(storage?.getItem?.(organizerStorageKey(key)));},
      async set(values){Object.entries(values||{}).forEach(([key,value])=>storage?.setItem?.(organizerStorageKey(key),JSON.stringify(value)));await storage?.flush?.();},
      async remove(keys){(Array.isArray(keys)?keys:[keys]).filter(Boolean).forEach(key=>storage?.removeItem?.(organizerStorageKey(key)));await storage?.flush?.();},
      async clear(){(storage?.entries?.()||[]).filter(([key])=>String(key).startsWith(ORGANIZER_STORAGE_CANONICAL_PREFIX)).forEach(([key])=>storage?.removeItem?.(key));await storage?.flush?.();}
    });
  }
  function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Não foi possível carregar um recurso interno do Organizador.'));reader.readAsDataURL(blob);});}
  async function loadOrganizerAssets(){
    if(assetDataPromise)return assetDataPromise;
    assetDataPromise=(async()=>{const entries=await Promise.all(Object.entries(ORGANIZER_ASSET_PATHS).map(async([name,path])=>{const url=globalThis.chrome?.runtime?.getURL?.(path)||path;const response=await globalThis.fetch(url);if(!response.ok)throw new Error(`Recurso interno do Organizador não encontrado: ${name}`);return [name,await blobToDataUrl(await response.blob())];}));return Object.freeze(Object.fromEntries(entries));})();
    return assetDataPromise;
  }
  function organizerSnapshot(state){
    const disciplines=[...new Set((state?.records||[]).map(item=>String(item?.disciplina||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
    return {schemaVersion:1,source:'organizer',sourceVersion:ORGANIZER_SOURCE_VERSION,fileName:String(state?.fileName||''),sheetName:String(state?.sheetName||''),assessment:String(state?.assessment||''),fullTitle:String(state?.fullTitle||''),date:String(state?.date||''),classes:[...(state?.turmas||[])],selectedClasses:[...(state?.selected||[])],disciplines,validationCount:(state?.lastValidation||[]).length,updatedAt:new Date().toISOString()};
  }/* @include ./start-organizer-runtime/index.js */
