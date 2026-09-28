
  'use strict';

  const PRINT_SOURCE_VERSION = '1.19.6';
  const PRINT_SOURCE_HASHES = Object.freeze({
    css: '929bb1ff5b915bb81245d3d819120e68e96056550bd7ccf28b9edccc1dc4b8b5',
    body: '90c655e6c872f44974a56c8486602613683be8ccbafe856abf3c8fca36c1a221',
    script: 'c6f3bca8f5109c27dfaaf00fe3b01d162e7819e56d12cd00b96a12d72d08ccd7'
  });
  const PRINT_ORIGINAL_CSS = __GSSF_RESOURCE__("PRINT_ORIGINAL_CSS");
  const PRINT_ORIGINAL_BODY = __GSSF_RESOURCE__("PRINT_ORIGINAL_BODY");
  const PRINT_LOT_DB_NAME = 'gssf_impressao_lotes_db_v1';
  const PRINT_LOT_DB_STORE = 'lots';

  let mounted = false;
  let printHostPanel = null;
  let printShadowRoot = null;
  let printRuntime = null;
  let printResizeObserver = null;
  let mountPromise = null;
  let activePrintWindow = null;

  function workspaceHtml() {
    return '<div class="gssf-native-print-host" id="gssf-native-print-host" data-source-version="1.19.6"></div>';
  }

  function createPrintDocument(shadowRoot) {
    return {
      getElementById: (id) => shadowRoot.getElementById(id),
      querySelectorAll: (selector) => shadowRoot.querySelectorAll(selector),
      createElement: (tagName) => document.createElement(tagName),
      addEventListener: (...args) => shadowRoot.addEventListener(...args),
      get title() { return document.title; },
      set title(value) { document.title = value; }
    };
  }

  function isolatedPrintCss() {
    return PRINT_ORIGINAL_CSS.replaceAll(':host', ':root')
      + '\n@page{size:A4;margin:0}'
      + '\nhtml,body{width:210mm;min-height:297mm;margin:0;padding:0;background:#fff}'
      + '\n.print-app-root{width:210mm;height:auto;min-height:297mm;overflow:visible;background:#fff}'
      + '\n.print-queue{display:block!important;width:210mm;margin:0;padding:0}'
      + '\n@media screen{.print-queue{display:block!important}.print-page{margin:0 auto}}';
  }

  function escapePrintTitle(value) {
    return String(value || 'Impressão').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function prepareIsolatedPrintWindow(queueHtml, title) {
    try { if (activePrintWindow && !activePrintWindow.closed) activePrintWindow.close(); } catch (_) {}
    const printWindow = globalThis.open('', '_blank', 'popup,width=920,height=760');
    if (!printWindow) throw new Error('O navegador bloqueou a janela de impressão. Permita pop-ups para o Microsoft Forms e tente novamente.');
    activePrintWindow = printWindow;
    const printDocument = printWindow.document;
    printDocument.open();
    printDocument.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePrintTitle(title)}</title><style>${isolatedPrintCss()}</style></head><body><main class="print-app-root"><div class="print-queue">${queueHtml}</div></main></body></html>`);
    printDocument.close();
    try { printWindow.opener = null; } catch (_) {}
    return printWindow;
  }

  async function deletePrintLotDatabase() {
    if (!globalThis.indexedDB) return;
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(PRINT_LOT_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }/* @include ./start-printing-runtime/index.js */
