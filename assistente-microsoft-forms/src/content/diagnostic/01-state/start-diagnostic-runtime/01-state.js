
    const listenerRegistry=[];
    const appRoot=root.querySelector('.diagnostic-app-root');
    const document=createDiagnosticDocument(root,appRoot,listenerRegistry);
    const diagnosticStorage=createStorageProxy();
    const runtimeWindow={
      XLSX:globalThis.XLSX,
      ensureXlsxLibrary:()=>Promise.resolve(Boolean(globalThis.XLSX)),
      indexedDB:globalThis.indexedDB,
      jspdf:globalThis.jspdf,
      parent:{publish:bridgePublish},
      addEventListener:(type,listener,options)=>{globalThis.addEventListener(type,listener,options);listenerRegistry.push([globalThis,type,listener,options]);}
    };
    const window=runtimeWindow;
(() => {/* @include ./01-state-modules/01-state.js */
/* @include ./01-state-modules/02-refresh-all.js */
/* @include ./01-state-modules/03-aggregate-sections.js */
/* @include ./01-state-modules/04-section-by-id.js */
/* @include ./01-state-modules/05-insight.js */
/* @include ./01-state-modules/06-reports-key.js */
/* @include ./01-state-modules/07-report-update-draft-controls.js */
/* @include ./01-state-modules/08-report-teacher-batch-summary.js */
/* @include ./01-state-modules/09-report-export-selected-pdfs.js */
/* @include ./01-state-modules/10-open-match-review.js */
/* @include ./01-state-modules/11-render-sections.js */
/* @include ./01-state-modules/12-demo-student.js */
})();