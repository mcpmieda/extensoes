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
  maxColumnsPerSheet: 1024,
  maxCellsPerSheet: 2000000,
  maxCellsPerWorkbook: 4000000,
  maxMergeCells: 50000,
  maxMergedCellsPerSheet: 100000,
  maxMergedCellsPerWorkbook: 200000,
  maxMergesPerSheet: 10000,
  maxMergesPerWorkbook: 20000,
  maxQuestions: 500
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

function gssfAssertQuestionCount(value, label = 'planilha') {
  const count = Math.max(0, Number(value) || 0);
  if (count > GSSF_SPREADSHEET_LIMITS.maxQuestions) {
    throw new Error(`${label}: quantidade de questões acima do limite seguro de ${GSSF_SPREADSHEET_LIMITS.maxQuestions}.`);
  }
  return count;
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

function gssfMeasureZipEntry(entry, label = 'entrada da planilha') {
  return new Promise((resolve, reject) => {
    let stream = null;
    let total = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { stream?.pause?.(); } catch (_) {}
      reject(error);
    };
    try {
      if (!entry || typeof entry.internalStream !== 'function') return fail(new Error(`Não foi possível validar ${label} antes da descompactação.`));
      stream = entry.internalStream('uint8array');
      stream.on('data', (chunk) => {
        if (settled) return;
        total += Math.max(0, Number(chunk?.length ?? chunk?.byteLength) || 0);
        if (total > GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes) {
          fail(new Error(`A parte “${label}” excede o limite seguro durante a descompactação.`));
        }
      });
      stream.on('error', (error) => fail(error instanceof Error ? error : new Error(String(error || 'Falha ao validar conteúdo comprimido.'))));
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(total);
      });
      stream.resume();
    } catch (error) { fail(error); }
  });
}

async function gssfAssertZipArchiveActual(zip) {
  gssfAssertZipArchive(zip);
  const entries = Object.values(zip?.files || {}).filter((entry) => entry && !entry.dir);
  let actualTotal = 0;
  for (const entry of entries) {
    actualTotal += await gssfMeasureZipEntry(entry, entry.name || 'entrada');
    if (actualTotal > GSSF_SPREADSHEET_LIMITS.maxZipTotalBytes) {
      throw new Error('A planilha excede o limite seguro real de conteúdo descompactado.');
    }
  }
  return zip;
}

async function gssfPreflightZipBuffer(buffer) {
  if (!gssfLooksLikeZip(buffer) || !globalThis.JSZip?.loadAsync) return null;
  const zip = await globalThis.JSZip.loadAsync(buffer);
  return gssfAssertZipArchiveActual(zip);
}

async function gssfReadSpreadsheetArrayBuffer(file, options = {}) {
  gssfAssertSpreadsheetFile(file);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > GSSF_SPREADSHEET_LIMITS.maxFileBytes) throw new Error('A planilha excede o limite seguro de tamanho.');
  if (options.preflightZip !== false) await gssfPreflightZipBuffer(buffer);
  return buffer;
}

function gssfAssertWorksheetMerges(sheet, name, range) {
  let mergedCells = 0;
  if ((sheet?.['!merges']?.length || 0) > GSSF_SPREADSHEET_LIMITS.maxMergesPerSheet) throw new Error(`A aba “${name}” contém áreas mescladas demais.`);
  for (const merge of sheet?.['!merges'] || []) {
    const { s, e } = merge || {};
    if (![s?.r, s?.c, e?.r, e?.c].every(value => Number.isSafeInteger(value) && value >= 0)
      || e.r < s.r || e.c < s.c || !range
      || s.r < range.s.r || s.c < range.s.c || e.r > range.e.r || e.c > range.e.c) {
      throw new Error(`A aba “${name}” contém uma área mesclada inválida.`);
    }
    const cells = (e.r - s.r + 1) * (e.c - s.c + 1);
    if (cells > GSSF_SPREADSHEET_LIMITS.maxMergeCells) throw new Error(`A aba “${name}” contém uma área mesclada grande demais.`);
    mergedCells += cells;
    if (mergedCells > GSSF_SPREADSHEET_LIMITS.maxMergedCellsPerSheet) throw new Error(`A aba “${name}” excede o limite de células mescladas.`);
  }
  return mergedCells;
}

function gssfAssertWorkbookShape(workbook, library = globalThis.XLSX) {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (names.length > GSSF_SPREADSHEET_LIMITS.maxSheets) throw new Error(`A planilha contém abas demais (${names.length}).`);
  const decodeRange = library?.utils?.decode_range;
  if (typeof decodeRange !== 'function') throw new Error('O leitor de planilhas não permite validar as dimensões das abas.');
  let workbookCells = 0;
  let workbookMergedCells = 0;
  let workbookMerges = 0;
  for (const name of names) {
    const sheet = workbook?.Sheets?.[name];
    workbookMerges += sheet?.['!merges']?.length || 0;
    if (workbookMerges > GSSF_SPREADSHEET_LIMITS.maxMergesPerWorkbook) throw new Error('A planilha contém áreas mescladas demais.');
    const ref = sheet?.['!fullref'] || sheet?.['!ref'];
    if (!ref) {
      workbookMergedCells += gssfAssertWorksheetMerges(sheet, name, null);
      continue;
    }
    let range;
    try { range = decodeRange(ref); } catch (_) { throw new Error(`A aba “${name}” tem dimensões inválidas.`); }
    if (![range?.s?.r, range?.s?.c, range?.e?.r, range?.e?.c].every(value => Number.isSafeInteger(value) && value >= 0)
      || range.e.r < range.s.r || range.e.c < range.s.c) throw new Error(`A aba “${name}” tem dimensões inválidas.`);
    const rows = Math.max(0, Number(range?.e?.r) - Number(range?.s?.r) + 1);
    const columns = Math.max(0, Number(range?.e?.c) - Number(range?.s?.c) + 1);
    if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1) throw new Error(`A aba “${name}” tem dimensões inválidas.`);
    if (rows > GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet) throw new Error(`A aba “${name}” excede ${GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet} linhas.`);
    if (columns > GSSF_SPREADSHEET_LIMITS.maxColumnsPerSheet) throw new Error(`A aba “${name}” excede ${GSSF_SPREADSHEET_LIMITS.maxColumnsPerSheet} colunas.`);
    const cells = rows * columns;
    if (cells > GSSF_SPREADSHEET_LIMITS.maxCellsPerSheet) throw new Error(`A aba “${name}” excede o limite de células.`);
    workbookCells += cells;
    if (workbookCells > GSSF_SPREADSHEET_LIMITS.maxCellsPerWorkbook) throw new Error('A planilha excede o limite agregado de células.');
    workbookMergedCells += gssfAssertWorksheetMerges(sheet, name, range);
    if (workbookMergedCells > GSSF_SPREADSHEET_LIMITS.maxMergedCellsPerWorkbook) throw new Error('A planilha excede o limite agregado de células mescladas.');
  }
  return workbook;
}

function gssfReadSpreadsheetBuffer(buffer, library = globalThis.XLSX, readOptions = {}) {
  if (!library || typeof library.read !== 'function') throw new Error('O leitor local de planilhas não está disponível.');
  const requestedSheetRows = Number(readOptions?.sheetRows);
  const sheetRows = requestedSheetRows > 0
    ? Math.min(requestedSheetRows, GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet + 1)
    : GSSF_SPREADSHEET_LIMITS.maxRowsPerSheet + 1;
  const workbook = library.read(buffer, { type: 'array', ...readOptions, sheetRows });
  return gssfAssertWorkbookShape(workbook, library);
}

async function gssfReadSpreadsheetWorkbook(file, library = globalThis.XLSX, readOptions = {}) {
  const buffer = await gssfReadSpreadsheetArrayBuffer(file);
  return gssfReadSpreadsheetBuffer(buffer, library, readOptions);
}

async function gssfSafeZipEntryText(entry, label = 'entrada da planilha') {
  if (!entry) throw new Error(`Parte obrigatória ausente: ${label}.`);
  const declared = gssfZipDeclaredSize(entry);
  if (declared > GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes) throw new Error(`A parte “${label}” excede o limite seguro.`);
  await gssfMeasureZipEntry(entry, label);
  const text = await entry.async('string');
  // A medição em stream limita bytes descompactados antes da materialização; esta checagem
  // adicional limita também o tamanho da string mantida em memória.
  if (text.length > GSSF_SPREADSHEET_LIMITS.maxZipEntryBytes) throw new Error(`A parte “${label}” excede o limite seguro após descompactação.`);
  return text;
}
