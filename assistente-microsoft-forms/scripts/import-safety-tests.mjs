import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeText = value => cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const paths = ['audit-bank/04-forms-bank.js', 'omr-import/00-safe-import.js', 'omr-import/01-base.js', 'omr-import/03-history-and-audit.js', 'omr-import/04-import-source-model.js', 'omr-import/06-matching-and-import.js'];
const code = (await Promise.all(paths.map(p => fs.readFile(new URL('../src/content/' + p, import.meta.url), 'utf8')))).join('\n');
const question = (number, prompt, opts, correct = []) => ({ number, prompt, optionTexts: opts, totalOptions: opts.length, correct, sectionTitle: 'Teste', sectionIndex: 0, importEvidence: { version: 1, prompt, options: opts } });
const base = question(1, 'Enunciado completo', ['Saturno', 'Marte', 'Terra', 'Vênus'], [0]);
async function run({ dest = [base], origin = [base], manual = {}, fail = false, cancel = false, stale = false, selected, mutate, preview = false, lostSignals = false } = {}) {
  const cache = new Map(), notices = [], confirms = [], writes = [];
  let confirmed, writeCount = 0;
  const audit = { title: 'Destino', questions: dest, url: 'https://forms.cloud.microsoft/Pages/DesignPageV2.aspx?id=dest' };
  const ctx = vm.createContext({ URL, cleanText, normalizeText, letter: i => String.fromCharCode(65 + i),
    APP: { omrImportState: {} }, location: { href: audit.url }, document: { title: 'Destino' },
    chrome: { runtime: { sendMessage: (_m, cb) => { writeCount++; if (fail) cb({ ok: false, error: 'Falha simulada' }); else { confirmed = cache.get('gssf_forms_bank_v1'); cb({ ok: true, value: confirmed }); } } } },
    GSSF_STORAGE: { getItem: k => cache.get(k) || null, setCachedItem: (k,v) => cache.set(k,v), trackWrite: fn => writes.push(fn), restoreConfirmedItem: k => cache.set(k,confirmed),
      flush: async () => { while(writes.length) await writes.shift()(); } },
    console: { warn: () => {} }, readManualOverrides: () => manual, getFormTitle: () => 'Destino',
    toast: m => notices.push(m), log: () => {}, reportNonFatalError: () => {}, auditPage: () => audit,
    askConfirm: async o => { confirms.push(o); if (stale) ctx.APP.questionContentRevision = 1; if(mutate) mutate(audit); return !cancel; },
    updateInlineReport: () => {}, renderOmrMainIntoModal: () => {}, registerPendingOmrBubbleEffect: () => {},
  });
  vm.runInContext(code, ctx);
  ctx.renderImportSourceList = () => {};
  const src = { formId: 'source', title: 'Origem', questions: Object.fromEntries(origin.map(q => [q.number, { questionNumber: q.number, optionCount: q.totalOptions, originalAnswer: String.fromCharCode(65 + q.correct[0]), importEvidence: q.importEvidence, sectionTitle: 'Teste', sectionIndex: 0 }])) };
  const bank = { forms: { source: src, 'id:dest': ctx.buildFormBankRecord(audit) } };
  confirmed = JSON.stringify(bank); cache.set('gssf_forms_bank_v1', confirmed);
  if (preview || lostSignals) {
    audit.mode = preview ? 'visualização' : 'edição'; audit.nativeAnswerKey = false;
    audit.questions = audit.questions.map(q => ({ ...q, correct: [] }));
  }
  const count = await ctx.importSelectedAnswersFromSource(audit, src, selected || origin.map(q => q.number), { skipConfirm: true });
  return { ctx, src, audit, count, confirms, notices, writeCount, records: ctx.readFormsBank().forms['id:dest'].questions };
}
let r = await run(); assert.equal(r.count,1); assert.equal(r.confirms.length,1); assert.equal(r.writeCount,1); assert.equal(r.records['1'].effectiveAnswer,'A');
r = await run({ dest: [question(2,base.prompt,['Marte','Saturno','Terra','Vênus'],[0])] });
assert.equal(r.count,1); assert.equal(r.records['2'].effectiveAnswer,'B'); assert.equal(r.records['2'].importSource.sourceQuestion,1);
r = await run({ dest: [question(1,'Outro enunciado',base.optionTexts)] }); assert.equal(r.count,0); assert.equal(r.writeCount,0);
r = await run({ dest: [question(1,base.prompt,['Saturno','Marte'])] }); assert.equal(r.count,0);
r = await run({ dest: [base,{ ...base, number:2 }] }); assert.equal(r.count,0);
r = await run({ origin: [question(1,base.prompt,['Saturno','Saturno','Terra','Vênus'],[0])] }); assert.equal(r.count,0);
r = await run({ origin: [{...base,importEvidence:null}] }); assert.equal(r.count,0);
r = await run({ origin: [{...base,correct:[8]}] }); assert.equal(r.count,0);
r = await run({ manual: {'1':'B'} }); assert.equal(r.count,0); assert.equal(r.records['1'].effectiveAnswer,'B'); assert.equal(r.writeCount,0);
r = await run({ fail:true }); assert.equal(r.count,0); assert.match(r.notices.at(-1),/não confirmada/); assert.equal(r.records['1'].importedAnswer,'');
r = await run({ cancel:true }); assert.equal(r.count,0); assert.equal(r.writeCount,0);
r = await run({ stale:true }); assert.equal(r.count,0); assert.equal(r.writeCount,0);
r = await run({dest:[structuredClone(base)],mutate:a=>{a.questions[0].importEvidence.prompt='Modificado';}}); assert.equal(r.count,0); assert.equal(r.writeCount,0);
r = await run({ preview: true }); assert.equal(r.count,0); assert.equal(r.writeCount,0); assert.equal(r.records['1'].originalAnswer,'A');
r = await run({ lostSignals: true }); assert.equal(r.records['1'].originalAnswer,'A');
r = await run({dest:[structuredClone(base)],mutate:a=>{a.mode='visualização';a.nativeAnswerKey=false;a.questions[0].correct=[];}}); assert.equal(r.count,0); assert.equal(r.writeCount,0); assert.equal(r.records['1'].originalAnswer,'A');
r = await run({ selected:[1,1] }); assert.equal(r.count,1); assert.equal(r.writeCount,1);
r = await run({ origin:[base,question(2,'Ausente',['Alpha','Beta'],[1])] }); assert.equal(r.count,1); assert.match(r.notices.at(-1),/1 bloqueada/);
r = await run({ origin:[base,{...base,number:2}] }); assert.equal(r.count,0); assert.equal(r.writeCount,0);
// Sinais e números não podem desaparecer na comparação.
r = await run({origin:[question(1,'Calcule',['-25','+25'],[0])],dest:[question(1,'Calcule',['25','+25'])]}); assert.equal(r.count,0);
assert.equal(r.ctx.analyzeSourceSectionsForImport(r.audit,r.src).matches.length,0);
console.log('Importação segura: reordenação, ambiguidades, limites, manuais, cancelamento, obsolescência, lote e falha de gravação aprovados.');
