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
ctx.location.href = 'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=generico';
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false, 'SPA não transfere autorização manual');
ctx.location.href = 'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=conteudos';
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, false, 'retornar não promove manual a autoabertura');
ctx.document.querySelectorAll = selector => selector.includes('script[type=') ? [{ textContent: '{"isQuiz":true}' }] : [];
await ctx.evaluateQuizEligibility();
assert.equal(ctx.APP.quizActive, true, 'quiz válido continua abrindo automaticamente');
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
assert.equal(reads, 0); assert.equal(writes, 0);

// Sem alternativas: explicação contextual, sem montar controles de gabarito.
const reports = vm.createContext({});
vm.runInContext(await read('omr-import/03-history-and-audit.js'), reports);
assert.match(reports.omrMainBodyHtml({ questions: [] }), /demais Ferramentas/);
assert.match(reports.omrMainBodyHtml({ questions: [{ totalOptions: 0 }] }), /texto, data/);
reports.omrToolsHtml = () => 'TOOLS'; reports.buildOmrAuditHtml = () => 'AUDIT'; reports.buildOmrHtml = () => 'OMR';
assert.equal(reports.omrMainBodyHtml({ questions: [{ totalOptions: 4 }] }), 'TOOLSAUDITOMR');

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
  assert.equal(audit.questions[0].correct.length, quiz && mode === 'edição' ? 2 : 0);
  assert.equal(audit.questions[1].correct.length, 0);
  assert(!audit.problems.some(p => /Q2: (Sem alternativas|Sem resposta correta)/.test(p)));
  assert.equal(audit.questions[0].rawOptionTexts[0], '+25');
}
console.log('Forms manuais: autoabertura/SPA, dois gates, banco vazio/preview, capacidades e gabarito aprovados.');
