  // ===== 72-answer-card-xlsx.js =====
// Adaptador local para a distribuição completa SheetJS carregada pelo Manifest V3.
// A biblioteca permanece empacotada na extensão; nenhum código remoto é executado.
const GSSF_CARD_XLSX = (() => {
  'use strict';
  const library = globalThis.XLSX;
  if (!library || typeof library.read !== 'function' || !library.utils) return null;
  return library;
})();

