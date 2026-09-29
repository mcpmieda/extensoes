// Serializa alterações do banco de gabaritos no service worker para todas as abas.
const GSSF_FORMS_BANK_KEY = 'gssf:forms_bank_v1';
let gssfFormsBankQueue = Promise.resolve();

async function gssfApplyFormsBankPatch(patch) {
  if (!patch || typeof patch !== 'object' || !patch.forms || typeof patch.forms !== 'object') {
    throw new Error('Alteração do banco de gabaritos inválida.');
  }
  const stored = await chrome.storage.local.get(GSSF_FORMS_BANK_KEY);
  let bank;
  try { bank = JSON.parse(stored[GSSF_FORMS_BANK_KEY] || '{}'); } catch (_) { bank = {}; }
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) bank = {};
  bank.forms = bank.forms && typeof bank.forms === 'object' && !Array.isArray(bank.forms) ? bank.forms : {};
  for (const [formId, change] of Object.entries(patch.forms)) {
    if (change === null) { delete bank.forms[formId]; continue; }
    if (!change || typeof change !== 'object') throw new Error('Alteração de formulário inválida.');
    const current = bank.forms[formId] || {};
    const form = { ...current, ...(change.fields || {}), questions: { ...(current.questions || {}) } };
    for (const [number, fields] of Object.entries(change.questions || {})) {
      if (fields === null) delete form.questions[number];
      else {
        const question = { ...(form.questions[number] || {}), ...fields };
        question.effectiveAnswer = question.manualAnswer || question.importedAnswer || question.originalAnswer || '';
        question.source = question.manualAnswer ? 'manual' : question.importedAnswer ? 'imported' : question.originalAnswer ? 'original' : '';
        form.questions[number] = question;
      }
    }
    form.answerCount = Object.values(form.questions).filter(question => question && (question.manualAnswer || question.importedAnswer || question.originalAnswer)).length;
    form.lastReadAt = new Date().toISOString();
    bank.forms[formId] = form;
  }
  bank.version = 1;
  bank.format = 'formsBank';
  bank.updatedAt = new Date().toISOString();
  bank._gssfBankRevision = Math.max(0, Number(bank._gssfBankRevision) || 0) + 1;
  const serialized = JSON.stringify(bank);
  await chrome.storage.local.set({ [GSSF_FORMS_BANK_KEY]: serialized });
  return serialized;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GSSF_FORMS_BANK_PATCH') return false;
  const task = gssfFormsBankQueue.then(async () => {
    if (!gssfAllowedSender(sender)) throw new Error('Origem da solicitação não permitida.');
    return gssfApplyFormsBankPatch(message.patch);
  });
  gssfFormsBankQueue = task.catch(() => {});
  task.then(
    value => sendResponse({ ok: true, value }),
    error => sendResponse({ ok: false, error: String(error?.message || error) })
  );
  return true;
});
