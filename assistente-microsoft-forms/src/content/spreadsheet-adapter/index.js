  // ===== 72-answer-card-xlsx.js =====
// Adaptador local para planilhas. Todo arquivo passa pelos mesmos limites antes do parser.
const GSSF_CARD_XLSX = (() => {
  'use strict';
  const library = globalThis.XLSX;
  if (!library || typeof library.read !== 'function' || !library.utils) return null;
  return library;
})();

const GSSF_SPREADSHEET_LIMITS = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxZipEntries: 1024,
  maxZipEntryBytes: 32 * 1024 * 1024,
  maxZipTotalBytes: 128 * 1024 * 1024,
  maxSheets: 128,
  maxRowsPerSheet: 100000,
  maxColumnsPerSheet: 1024
});

function gssfSpreadsheetSizeLabel(bytes) {
  return `${Math.max(0, Number(bytes) || 0) / (1024 * 1024)}`.replace(/(\.\d{1})\d+$/, '$1').replace(/\.0$/, '') + ' MB';
}

function gssfAssertSpreadsheetFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Arquivo de planilha inválido.');
  const size = Number(file.size) || 0;
  if (size > GSSF_SPREADSHEET_LIMITS.maxFileBytes) {
    throw new Error(`A planilha excede o limite de ${gssfSpreadsheetSizeLabel(GSSF_SPREADSHEET_LIMITS.maxFileBytes)}.`);
  }
  return file;
}

function gssfLooksLikeZip(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0), 0, Math.min(4, buffer?.byteLength || 0));
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]);
}

function gssfZipDeclaredSize(entry) {
  const value = Number(entry?._data?.uncompressedSize ?? entry?._data?.length ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function gssfAssertZipArchive(zip) {
  const entries = Object.values(zip?.files || {}).filter((entry) => entry && !entry.dir);
  if (entries.length > GSSF_SPREADSHEET_LIMITS.maxZipEntries) throw new Error(`A planilha contém arquivos internos demais (${entries.length}).`);
  let declaredTotal = 0;
  for (const entry of entries) {
    const declared = gssfZipDeclaredSize(entry);
    if (declared > GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes) throw new Error(`A planilha contém uma parte interna excessivamente grande (${entry.name || 'entrada'}).`);
    declaredTotal += declared;
    if (declaredTotal > GSSF_SPREADSHEET_LIMITS.maxZipTotalBytes) throw new Error('A planilha excede o limite seguro de conteúdo descompactado.');
  }
  return zip;
}

async function gssfPreflightZipBuffer(buffer) {
  if (!gssfLooksLikeZip(buffer) || !globalThis.JSZip?.loadAsync) return null;
  const zip = await globalThis.JSZip.loadAsync(buffer);
  return gssfAssertZipArchive(zip);
}

async function gssfReadSpreadsheetArrayBuffer(file, options = {}) {
  gssfAssertSpreadsheetFile(file);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > GSSF_SPREADSHEET_LIMITS.maxFileBytes) throw new Error('A planilha excede o limite seguro de tamanho.');
  if (options.preflightZip !== false) await gssfPreflightZipBuffer(buffer);
  return buffer;
}

function gssfAssertWorkbookShape(workbook, library = globalThis.XLSX) {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (names.length > GSSF_SPREADSHEET_LIMITS.maxSheets) throw new Error(`A planilha contém abas demais (${names.length}).`);
  const decodeRange = library?.utils?.decode_range;
  if (typeof decodeRange !== 'function') return workbook;
  for (const name of names) {
    const ref = workbook?.Sheets?.[name]?.['!ref'];
    if (!ref) continue;
    let range;
    try { range = decodeRange(ref); } catch (_) { continue; }
    const rows = Math.max(0, Number(range?.e?.r) - Number(range?.s?.r) + 1);
    const columns = Math.max(0, Number(range?.e?.c) - Number(range?.s?.c) + 1);
    if (rows > GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet) throw new Error(`A aba “${name}” excede ${GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet} linhas.`);
    if (columns > GSSF_SPREADSHEET_LIMITS.maxColumnsPerSheet) throw new Error(`A aba “${name}” excede ${GSSF_SPREADSHEET_LIMITS.maxColumnsPerSheet} colunas.`);
  }
  return workbook;
}

async function gssfReadSpreadsheetWorkbook(file, library = globalThis.XLSX, readOptions = {}) {
  if (!library || typeof library.read !== 'function') throw new Error('O leitor local de planilhas não está disponível.');
  const buffer = await gssfReadSpreadsheetArrayBuffer(file);
  const workbook = library.read(buffer, { type: 'array', ...readOptions });
  return gssfAssertWorkbookShape(workbook, library);
}

async function gssfSafeZipEntryText(entry, label = 'entrada da planilha') {
  if (!entry) throw new Error(`Parte obrigatória ausente: ${label}.`);
  const declared = gssfZipDeclaredSize(entry);
  if (declared > GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes) throw new Error(`A parte “${label}” excede o limite seguro.`);
  const text = await entry.async('string');
  // UTF-16 pode ocupar mais bytes que caracteres; 2x é um teto conservador para o texto materializado.
  if (text.length > GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes) throw new Error(`A parte “${label}” excede o limite seguro após descompactação.`);
  return text;
}
