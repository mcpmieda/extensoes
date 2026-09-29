
  'use strict';
  const DIAGNOSTIC_SOURCE_VERSION = '1.19.4';
  const DIAGNOSTIC_SOURCE_HASHES = Object.freeze({"css": "f87b8815d5c81b8e538f7a4f46b3ac343d6c7039bd7bad0c15ab2ecc95f6e174", "body": "76e49cc4e89ef8698d1b3ce66b8a4a3a53e593cb61c80cfe4f0ae0fd6405bcec", "script": "934cd6b33f6f4f87e117a1d4208d8b2aa8d8ba2b95f730e10c8e9017ae4d873e"});
  const DIAGNOSTIC_ORIGINAL_CSS = __GSSF_RESOURCE__("DIAGNOSTIC_ORIGINAL_CSS");
  const DIAGNOSTIC_ORIGINAL_BODY = __GSSF_RESOURCE__("DIAGNOSTIC_ORIGINAL_BODY");
  const DIAGNOSTIC_RUNTIME_CSS = DIAGNOSTIC_ORIGINAL_CSS
    .replace(':root{', ':host{')
    .replace('html,body{', ':host,.diagnostic-app-root{')
    .replace(
      '.filters.mode-student .select-stepper:first-child{grid-template-columns:28px 28px minmax(0,1fr)}',
      '.filters.mode-student .select-stepper:first-child,.filters.mode-sections .select-stepper:first-child{grid-template-columns:28px 28px minmax(0,1fr)}'
    )
    .replace(
      '.filters.mode-student .select-stepper:first-child>select,.filters.mode-student .select-stepper:first-child>.compact-select{order:3}',
      '.filters.mode-student .select-stepper:first-child>select,.filters.mode-student .select-stepper:first-child>.compact-select,.filters.mode-sections .select-stepper:first-child>select,.filters.mode-sections .select-stepper:first-child>.compact-select{order:3}'
    )
    .replace(
      '.filters.mode-student .select-stepper:first-child>.select-nav-btn:first-of-type{order:1}',
      '.filters.mode-student .select-stepper:first-child>.select-nav-btn:first-of-type,.filters.mode-sections .select-stepper:first-child>.select-nav-btn:first-of-type{order:1}'
    )
    .replace(
      '.filters.mode-student .select-stepper:first-child>.select-nav-btn:last-of-type{order:2}',
      '.filters.mode-student .select-stepper:first-child>.select-nav-btn:last-of-type,.filters.mode-sections .select-stepper:first-child>.select-nav-btn:last-of-type{order:2}'
    )
    + '\n:host{display:block;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;}'
    + '\n.diagnostic-app-root{width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;}'
    + __GSSF_RESOURCE__("DIAGNOSTIC_RUNTIME_CSS");
  const DIAGNOSTIC_DB_NAME = 'gssf_pedagogico_db_v1';
  const DIAGNOSTIC_SETTINGS_KEYS = Object.freeze(['gssf_pedagogico_settings_v1','gssf_pedagogical_analysis_config_v1','gssf_pedagogico_reports_v1']);
  let mounted=false,hostPanel=null,shadowRoot=null,runtime=null,resizeObserver=null,mountPromise=null;
  function workspaceHtml(){return '<div class="gssf-native-diagnostic-host" id="gssf-native-diagnostic-host" data-source-version="1.19.4"></div>';}
  function createDiagnosticDocument(root,appRoot,listenerRegistry){
    return {
      getElementById:id=>root.getElementById(id),
      querySelector:selector=>root.querySelector(selector),
      querySelectorAll:selector=>root.querySelectorAll(selector),
      createElement:tag=>globalThis.document.createElement(tag),
      addEventListener:(type,listener,options)=>{root.addEventListener(type,listener,options);listenerRegistry.push([root,type,listener,options]);},
      body:appRoot
    };
  }
  function createStorageProxy(){return {getItem:key=>globalThis.GSSF_STORAGE?.getItem?.(key)??null,setItem:(key,value)=>globalThis.GSSF_STORAGE?.setItem?.(key,value),removeItem:key=>globalThis.GSSF_STORAGE?.removeItem?.(key)};}
  function bridgePublish(message){
    if(!message||message.protocol!=='gssf-shared-data-v1'||message.source!=='diagnostic')return;
    if(!['snapshot','context','register'].includes(message.type))return;
    const bridge=globalThis.GSSFSharedBridge;
    if(message.type==='snapshot')bridge?.publish?.('diagnostic',message.payload,message.reason||'snapshot');
    else if(message.type==='context')bridge?.updateSourceContext?.('diagnostic',message.payload,message.reason||'selection');
    else bridge?.register?.('diagnostic',message.payload,message.reason||'registered');
  }
  async function deleteDiagnosticDatabase(){const legacyRemoved=await gssfDeleteLegacyIndexedDb(DIAGNOSTIC_DB_NAME);if(!legacyRemoved&&await gssfLegacyDatabaseExists(DIAGNOSTIC_DB_NAME))throw new Error('O banco legado do Diagnóstico está em uso por outra aba e não pôde ser removido.');await gssfPedagogicalDataClear(GSSF_PEDAGOGICAL_NAMESPACES.diagnosticBatches);const host=String(globalThis.location?.hostname||'unknown').replace(/[^a-z0-9.-]/gi,'_');try{globalThis.GSSF_STORAGE?.removeItem?.(`gssf_${GSSF_PEDAGOGICAL_NAMESPACES.diagnosticBatches}_idb_migrated_v1:${host}`);await globalThis.GSSF_STORAGE?.flush?.()}catch(_){}}/* @include ./start-diagnostic-runtime/index.js */
