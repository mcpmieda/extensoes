import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const read = p => fs.readFile(new URL('../src/content/' + p, import.meta.url), 'utf8');
const cleanText = s => String(s || '').trim();
const normalizeText = s => cleanText(s).toLowerCase();
const app = () => ({ lifecycle: { destroyed: false, listeners: [] }, quizDetectedKeys: new Set(), eligibilityListeners: [], manualOverrideKey: '', quizActive: false, storageReady: true });
const shell = { nodeType: 1, getAttribute: () => '', closest: () => null };
const ctx = vm.createContext({ APP: app(), URL, Date, console,
  location: { href: 'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=conteudos' },
  document: { querySelector: () => shell, querySelectorAll: () => [], getElementById: () => null,
    body: { innerText: 'CONTEUDOS', classList: { remove() {} } }, documentElement: { classList: { remove() {} } } },
  normalizeText, cleanText, requireExtensionContext() {}, showPanel() {}, log() {}, toast() {},
  createPanel() {}, startQuestionHistory() {}, startAutoObserver() {}, scheduleAutoAnalysis() {}, ensureInitialAnalysis() {},
  stopOmrLiveUpdates() {}, exitOmrMode() {}, clearAppTimers() {}, stopQuestionHistory() {},
  GSSF_TIMING: { eligibilityRevalidateMs: 0, eligibilityMissLimit: 2 },
});
vm.runInContext(await read('core/04-page-and-eligibility.js'), ctx);
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false, 'CONTEUDOS não deve abrir automaticamente');
await ctx.forceActivateFromBrowserAction();
assert.equal(ctx.APP.quizActive, true);
assert.equal(ctx.APP.quizDetectedKeys.size, 0, 'abertura manual não comprova quiz');
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizDetectedKeys.size, 0);
ctx.location.href += '&tab=responses';
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, true, 'mesmo documento mantém uso manual na aba Respostas');
assert.equal(ctx.pageMode(), 'respostas', 'aba Respostas não autoriza gravações de gabarito');
ctx.location.href = 'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=generico';
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false, 'SPA não transfere autorização manual');
ctx.location.href = 'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=conteudos';
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false, 'retornar não promove manual a autoabertura');
ctx.document.querySelectorAll = selector => selector.includes('script[type=') ? [{ textContent: '{"isQuiz":true}' }] : [];
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, true, 'quiz válido continua abrindo automaticamente');
ctx.location.href = 'https://forms.cloud.microsoft/Pages/EditFormPage.aspx?id=quiz';
assert.equal(ctx.pageMode(), 'edição', 'EditFormPage é editor sem exigir subpage=design');
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, true);
ctx.location.href += '&topview=preview';
assert.equal(ctx.pageMode(), 'visualização', 'preview de EditFormPage continua sem autorizar gabarito nativo');
ctx.location.href = 'https://forms.cloud.microsoft/Pages/EditFormPage.aspx?id=conteudos';
ctx.document.querySelectorAll = () => [];
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false);
await ctx.forceActivateFromBrowserAction();
assert.equal(ctx.APP.quizActive, true);
assert(!ctx.APP.quizDetectedKeys.has(ctx.currentFormsDocumentKey()));
ctx.location.href = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=publico';
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false);
assert.equal(await ctx.forceActivateFromBrowserAction(), false, 'página pública continua fora do suporte');

// Ambos os caminhos de renderização precisam manter o acesso ao workspace.
const button = {}, issues = { dataset: {} }, key = {};
const controls = vm.createContext({ APP: { busy: false },
  document: { querySelector: () => null, querySelectorAll: () => [], getElementById: id => id === 'gssf-open-omr' ? button : id === 'gssf-inline-issues' ? issues : id === 'gssf-inline-key' ? key : null },
  setProgress() {}, inlineProblemsHtml: () => '', inlineKeyHtml: () => '', bindIssueJumpButtons() {},
  updateQuestionMap() {}, updateLetterMap() {}, saveCurrentFormToBank() {},
});
vm.runInContext(await read('core/06-interactions.js') + '\n' + await read('audit-bank/03-map-interaction.js'), controls);
controls.updateDashboardExtras = () => {};
controls.updateQuestionMap = () => {}; controls.updateLetterMap = () => {};
for (const busy of [false, true, false]) {
  controls.APP.busy = busy;
  controls.updateActionAvailability({ questions: 0 }); assert.equal(button.disabled, busy);
  controls.updateInlineReport({ questions: [], problems: [] }); assert.equal(button.disabled, busy);
}

// Banco: leitura vazia e preview não excluem registros confirmados.
let reads = 0, writes = 0;
const bank = vm.createContext({ chrome: {}, APP: {}, URL, location: { href: ctx.location.href },
  GSSF_STORAGE: { getItem() { reads++; return null; } }, log() {}, normalizeText, cleanText });
vm.runInContext(await read('audit-bank/04-forms-bank.js'), bank);
bank.saveFormsBank = () => { writes++; return true; };
assert.equal(bank.saveCurrentFormToBank({ questions: [] }), null);
assert.equal(bank.saveCurrentFormToBank({ questions: [{ number: 1 }], mode: 'visualização' }), null);
assert.equal(bank.saveCurrentFormToBank({ questions: [{ number: 1 }], mode: 'respostas' }), null);
assert.equal(reads, 0); assert.equal(writes, 0);

// Sem alternativas: explicação contextual, sem montar controles de gabarito.
const reports = vm.createContext({ isReadOnlyAnswerAudit: bank.isReadOnlyAnswerAudit });
vm.runInContext(await read('omr-import/03-history-and-audit.js'), reports);
assert.match(reports.omrMainBodyHtml({ questions: [] }), /demais Ferramentas/);
assert.match(reports.omrMainBodyHtml({ questions: [{ totalOptions: 0 }] }), /texto, data/);
reports.omrToolsHtml = () => 'TOOLS'; reports.buildOmrAuditHtml = () => 'AUDIT'; reports.buildOmrHtml = () => 'OMR';
assert.equal(reports.omrMainBodyHtml({ questions: [{ totalOptions: 4 }] }), 'TOOLSAUDITOMR');
assert.match(reports.omrMainBodyHtml({ mode: 'visualização', questions: [{ totalOptions: 4 }] }), /volte à aba Perguntas/);

// Form misto não inventa bolhas para texto/data, posições ausentes ou quinta opção.
const bubbles = vm.createContext({ chrome: { runtime: { getURL: s => s } },
  reportAnswerData: () => [], buildOmrSectionBands: () => '', buildChangePanelHtml: () => '', buildResetRiskAlertHtml: () => '', escapeHtml: s => s });
vm.runInContext(await read('omr-import/02-reports.js'), bubbles);
const mixed = { nativeAnswerKey: false, questions: [{ number: 1, totalOptions: 2 }, { number: 2, totalOptions: 0 }, { number: 3, totalOptions: 4 }] };
const mixedHtml = bubbles.buildOmrHtml(mixed);
assert.equal((mixedHtml.match(/class="omr-bubble/g) || []).length, 6);
assert(!mixedHtml.includes('data-q="2"')); assert(!mixedHtml.includes('data-q="4"'));
assert.equal((bubbles.buildOmrHtml({ ...mixed, nativeAnswerKey: true }).match(/class="omr-bubble/g) || []).length, 160, 'template legado do quiz permanece');
const unsupported = { nativeAnswerKey: false, questions: [{ number: 1, totalOptions: 5 }, { number: 41, totalOptions: 4 }] };
assert.equal((bubbles.buildOmrHtml(unsupported).match(/class="omr-bubble/g) || []).length, 0);
assert.match(reports.omrMainBodyHtml(unsupported), /fora desses limites/);
reports.letter = i => String.fromCharCode(65 + i);
const mixedSummary = reports.buildOmrAudit({ ...mixed, questions: [...mixed.questions, ...unsupported.questions.map(q => ({ ...q, number: q.number === 1 ? 4 : q.number }))] }, [
  { number: 1, current: '', original: '' }, { number: 2, current: '', original: '' },
  { number: 3, current: 'B', original: 'B' }, { number: 4, current: '', original: '' }, { number: 41, current: '', original: '' }
]);
assert.equal(mixedSummary.cards[0].value, 2); assert.equal(mixedSummary.cards[0].label, 'questões no quadro');
assert.equal(mixedSummary.cards[1].value, 1); assert.equal(mixedSummary.cards[2].value, 1);
assert.equal(mixedSummary.distribution.B, 1); assert.equal(mixed.questions.length, 3, 'total do formulário não muda');

// O snapshot de preview é não autoritativo mesmo com questões carregadas.
bank.readManualOverrides = () => ({}); bank.getFormTitle = () => 'Quiz'; bank.document = { title: 'Quiz' };
bank.letter = i => String.fromCharCode(65 + i);
const savedAudit = { mode: 'edição', nativeAnswerKey: true, url: ctx.location.href, questions: [{ number: 1, prompt: 'Calcule', totalOptions: 2, optionTexts: ['-25', '+25'], correct: [0] }] };
const savedRecord = bank.buildFormBankRecord(savedAudit);
const previewAudit = { ...savedAudit, mode: 'visualização', nativeAnswerKey: false, questions: savedAudit.questions.map(q => ({ ...q, correct: [] })) };
assert.equal(bank.buildFormBankRecord(previewAudit, savedRecord), savedRecord);
const temporaryAudit = { ...previewAudit, mode: 'edição' };
assert.equal(bank.buildFormBankRecord(temporaryAudit, savedRecord).questions['1'].originalAnswer, 'A', 'sinal transitório não apaga original confirmado');
assert.equal(bank.buildFormBankRecord({ ...temporaryAudit, nativeAnswerKey: true }, savedRecord).questions['1'].originalAnswer, '', 'leitura real autoritativa pode remover resposta nativa');
bank.pageMode = () => 'visualização';
assert.equal(bank.updateBankQuestion(savedRecord.formId, 1, { manualAnswer: 'B', originalAnswer: '' }), false);
assert.equal(reads, 0); assert.equal(writes, 0);
vm.runInContext(await read('audit-bank/05-manual-answers.js'), bank);
assert.equal(bank.saveManualOverrides(previewAudit, [{ number: 1, current: 'B', original: 'A' }]), 0);
reports.readManualOverrides = () => ({}); reports.getCurrentFormRecord = () => savedRecord;
reports.letter = bank.letter; reports.originalAnswerForQuestion = bank.originalAnswerForQuestion;
assert.equal(reports.reportAnswerData(previewAudit)[0].original, 'A');

// Handler real da bolha: marcação manual não reescreve originalAnswer;
// navegação para preview entre render e clique impede a gravação.
let click, bankWrites = 0, overrideWrites = 0;
const bubble = { dataset: { q: '1', letter: 'B' }, style: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener(type, handler) { if (type === 'click') click = handler; } };
const root = { querySelectorAll: () => [bubble], addEventListener() {} };
bank.document = { getElementById: id => id === 'omr-sheet' ? root : null, querySelector: () => null };
bank.APP = { omrImportState: {} }; bank.toast = () => {};
bank.readFormsBank = () => ({ forms: { [savedRecord.formId]: savedRecord } });
bank.saveFormsBank = () => { bankWrites++; return true; };
bank.GSSF_STORAGE.setItem = () => { overrideWrites++; }; bank.GSSF_STORAGE.removeItem = () => {};
bank.reportAnswerData = () => [{ number: 1, original: 'A', current: 'A', manual: '', imported: '' }];
bank.updateInlineReport = () => {}; bank.renderImportSourceList = () => {};
vm.runInContext(await read('omr-import/07-clear-and-interactivity.js'), bank);
bank.attachReportInteractivity({ document: bank.document }, previewAudit);
assert.equal(click, undefined);
bank.pageMode = () => 'edição';
bank.attachReportInteractivity({ document: bank.document }, temporaryAudit);
click({ preventDefault() {}, stopPropagation() {} });
assert.equal(savedRecord.questions['1'].originalAnswer, 'A');
assert.equal(savedRecord.questions['1'].manualAnswer, 'B');
assert.equal(bankWrites, 1); assert.equal(overrideWrites, 1);

// Os três handlers de limpeza revalidam o modo após montar o modal.
const cleanupHandlers = new Map(), cleanupNotices = [];
let cleanupReports = 0;
const cleanupButtons = Object.fromEntries(['gssf-omr-reset', 'gssf-omr-clear-imported', 'gssf-omr-clear-manual'].map(id => [id, {
  dataset: {}, addEventListener(type, handler) { if (type === 'click') cleanupHandlers.set(id, handler); }
}]));
const cleanupData = [{ number: 1, original: 'A', current: 'B', manual: 'B', imported: '' }];
bank.document = { getElementById: id => id === 'omr-sheet' ? root : cleanupButtons[id] || null, querySelector: () => null };
bank.reportAnswerData = () => cleanupData; bank.toast = s => cleanupNotices.push(s);
bank.updateInlineReport = () => { cleanupReports++; };
bank.pageMode = () => 'edição';
bank.attachReportInteractivity({ document: bank.document }, temporaryAudit);
assert.equal(cleanupHandlers.size, 3);
const beforeCleanup = JSON.stringify(cleanupData);
bank.pageMode = () => 'respostas';
for (const handler of cleanupHandlers.values()) await handler({ preventDefault() {}, stopPropagation() {} });
assert.equal(JSON.stringify(cleanupData), beforeCleanup);
assert.equal(cleanupReports, 0); assert.equal(bankWrites, 1); assert.equal(overrideWrites, 1);
assert.equal(cleanupNotices.length, 3);
assert(cleanupNotices.every(notice => notice.includes('Volte à aba Perguntas')));

// Wrapper e designer-card aninhados são a mesma pergunta, inclusive sem número.
const body = { parentElement: null };
const blockFixture = (top, parentElement = body) => ({ parentElement, closest: () => null,
  querySelectorAll: () => [], getBoundingClientRect: () => ({ top, width: 400, height: 100 }) });
const wrapper = blockFixture(0), designerCard = blockFixture(0, wrapper), standaloneCard = blockFixture(150);
const discovery = vm.createContext({ APP: {}, scrollY: 0,
  document: { body, querySelectorAll: () => [wrapper, designerCard, standaloneCard] },
  getSectionBlocks: () => [], getQuestionListChildren: () => [], isLikelySectionBlock: () => false,
  visible: () => true, hasOptionSignals: () => true, questionNumberFromBlock: b => b.number || 0,
  nodeHint: () => 'question', meaningfulImage: () => false,
  byTop: (a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
});
vm.runInContext(await read('forms-dom/02-question-discovery.js'), discovery);
assert.deepEqual(Array.from(discovery.blocksByQuestionWrappers()), [wrapper, standaloneCard]);
assert.deepEqual(Array.from(discovery.collectQuestionBlocks()), [wrapper, standaloneCard]);
wrapper.number = 1; designerCard.number = 1; standaloneCard.number = 2;
assert.deepEqual(Array.from(discovery.collectQuestionBlocks()), [wrapper, standaloneCard]);
bank.pageMode = () => 'visualização';
click({ preventDefault() {}, stopPropagation() {} });
assert.equal(bankWrites, 1); assert.equal(overrideWrites, 1);

// Leitura real do gerador: seleção de preview/nonquiz não vira gabarito;
// texto/data não recebem erros de alternativas ou resposta correta.
const option = {}, choice = { querySelector: () => null }, text = { querySelector: () => null };
let quiz = false, mode = 'edição';
const auditCtx = vm.createContext({ APP: {}, document: { title: 'CONTEUDOS', querySelectorAll: () => [] },
  location: { href: 'fixture' }, pageMode: () => mode, quizSignalSummary: () => ({ detected: quiz }),
  readStandardOptionCounts: () => [4], readExpectedQuestionCount: () => null,
  collectQuestionBlocks: () => [choice, text], getSectionBlocks: () => [], buildSectionContext: () => [],
  visible: () => true, findOptionContainers: b => b === choice ? [option, option] : [], isCorrectOption: () => true,
  optionTextForAudit: () => '+25', optionMathLetterMarkerForAudit: () => false,
  extractQuestionNumber: b => b === choice ? 1 : 2, extractQuestionPrompt: () => 'Pergunta',
  detectManualOptionMarkers: () => ({}), stripOptionMarkerForAudit: s => s,
  optionStartsWithExpectedLetterForMap: () => false, optionStrictLetterMarkerForMap: () => false,
  isEmptyModel: () => false, sectionForBlock: () => null, buildImportEvidence: () => ({}),
  comparableText: s => s, normalizeText, cleanText, stripCopyUiPhrases: s => s,
  countContentImages: () => ({ count: 0 }), getFormTitle: () => 'CONTEUDOS', letter: i => String.fromCharCode(65 + i),
});
vm.runInContext(await read('audit-bank/01-base.js'), auditCtx);
for (const settings of [[false, 'edição'], [true, 'visualização'], [true, 'edição']]) {
  [quiz, mode] = settings;
  const audit = auditCtx.auditPage();
  assert.equal(audit.questions.length, 2);
  assert.equal(audit.nativeAnswerKey, quiz && mode === 'edição');
  assert.equal(audit.questions[0].correct.length, quiz && mode === 'edição' ? 2 : 0);
  assert.equal(audit.questions[1].correct.length, 0);
  assert(!audit.problems.some(p => /Q2: (Sem alternativas|Sem resposta correta)/.test(p)));
  assert.equal(audit.questions[0].rawOptionTexts[0], '+25');
}
console.log('Forms manuais: autoabertura/SPA, dois gates, banco vazio/preview, capacidades e gabarito aprovados.');
