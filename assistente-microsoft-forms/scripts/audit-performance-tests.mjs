import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/content/audit-bank/01-base.js', import.meta.url), 'utf8');
const context = vm.createContext({
  normalizeText: (s) => s.toLowerCase(), stripCopyUiPhrases: (s) => s,
});
vm.runInContext(source + '\nthis.distance = editDistanceLimited; this.similar = veryStrictSimilar;', context);
// Oráculo independente: matriz completa, sem poda nem faixa diagonal.
function exactDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] !== b[j - 1]));
  }
  return rows[a.length][b.length];
}
const samples = [''];
for (let size = 1; size <= 6; size++) {
  for (let n = 0; n < 2 ** size; n++) samples.push(n.toString(2).padStart(size, '0'));
}
let comparisons = 0;
for (const a of samples) for (const b of samples) {
  const exact = exactDistance(a, b);
  for (let limit = 0; limit <= 4; limit++) {
    const actual = context.distance(a, b, limit);
    assert.equal(actual <= limit, exact <= limit);
    if (exact <= limit) assert.equal(actual, exact);
    comparisons++;
  }
}
// Inclusão, exclusão, substituição e decisões nos limiares reais da auditoria.
const long = 'abcde '.repeat(100).trim();
for (const candidate of [long, 'X' + long, long.slice(1), long.slice(0, 200) + 'XYZ' + long.slice(203), 'z'.repeat(long.length)]) {
  const left = long.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const right = candidate.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const threshold of [0.992, 0.997]) {
    assert.equal(context.similar(long, candidate, threshold), 1 - exactDistance(left, right) / Math.max(left.length, right.length) >= threshold);
  }
}
const blank = vm.createContext({
  normalizeText: (s) => s.toLowerCase(), textOf: (b) => b.text,
  findOptionContainers: () => { throw new Error('Não reler alternativas já conhecidas'); },
  isSequentialPlaceholderOptionText: (s) => s.startsWith('Opção'),
  isBlankQuestionPromptText: (s) => s === 'Pergunta',
  authoredQuestionPromptTextForBlankCheck: (b) => b.text,
});
vm.runInContext(await fs.readFile(new URL('../src/content/forms-dom/04-blank-question-detection.js', import.meta.url), 'utf8') + `
  isSequentialPlaceholderOptionText = (s) => s.startsWith('Opção');
  isBlankQuestionPromptText = (s) => s === 'Pergunta';
  authoredQuestionPromptTextForBlankCheck = (b) => b.text;
  this.empty = isEmptyModel;
`, blank);
assert.equal(blank.empty({ text: 'Pergunta' }, ['Opção 1', 'Opção 2']), true);
assert.equal(blank.empty({ text: 'Enunciado completo' }, ['Resposta A', 'Resposta B']), false);
console.log(`Auditoria: ${comparisons} comparações com distância exata; limiares e reutilização de alternativas aprovados.`);
