  // ===== 60-audit-bank.js =====
// Fonte modular: audit bank.
  function isPlaceholderOptionForAudit(text) {
    const t = normalizeText(stripCopyUiPhrases(text)).replace(/[.:;]+$/g, '').trim();
    return !t || /^(opcao|opção|option)\s*\d+$/i.test(t) || /^(adicionar\s+)?(opcao|opção|alternativa|resposta)$/i.test(t);
  }

  function looksLikeSignedNumericOption(text) {
    const value = cleanText(stripCopyUiPhrases(text));
    if (!value) return false;
    const withoutLetters = value.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]/g, '').trim();
    // Evita tratar alternativas V/F ou textos comuns como expressão numérica.
    if (!withoutLetters) return false;
    const hasSignedNumber = /(^|[\s(=])[-+±]\s*\d/.test(value.replace(/[–—−]/g, '-'));
    const hasMathSymbol = /[=×÷*/^√²³%]|\d\s*[/]\s*\d/.test(value);
    const digitCount = (value.match(/\d/g) || []).length;
    const lettersCount = (value.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
    return hasSignedNumber || (hasMathSymbol && digitCount > 0 && lettersCount <= 2);
  }

  function normalizeSignedNumericOptionForDuplicate(text) {
    return cleanText(stripCopyUiPhrases(text))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[–—−]/g, '-')
      .replace(/±/g, '+-')
      .replace(/\s*([+-])\s*(?=\d)/g, '$1')
      .replace(/(?<=\d)\s*([+-])\s*(?=\d)/g, '$1')
      .replace(/[×]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[²]/g, '^2')
      .replace(/[³]/g, '^3')
      .replace(/\s+/g, ' ')
      .replace(/["“”'‘’]/g, '')
      .replace(/[,;]/g, '.')
      .replace(/[^a-zA-Z0-9+\-*/^=().%√ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*([+\-*/^=()])\s*/g, '$1')
      .replace(/[.!?]+$/g, '')
      .trim()
      .toLowerCase();
  }

  function normalizeOptionForDuplicateCheck(text) {
    const value = cleanText(stripCopyUiPhrases(text));
    if (isPlaceholderOptionForAudit(value)) return '';

    // V19: em alternativas numéricas, preservar sinais matemáticos.
    // Antes, +25, -25, + 25 e - 25 viravam todos "25", gerando falso positivo.
    // Esta rota só entra para alternativas com número/sinal/fórmula; textos comuns e V/F seguem a regra antiga.
    if (looksLikeSignedNumericOption(value)) return normalizeSignedNumericOptionForDuplicate(value);

    return normalizeText(value)
      .replace(/[–—−]/g, '-')
      .replace(/["“”'‘’]/g, '')
      .replace(/[.!?;:,]+$/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function duplicateOptionAlreadySeen(seenOptions, normalized, raw) {
    if (!normalized || normalized.length < 2) return null;
    const exact = seenOptions.find((item) => item.text === normalized);
    if (exact) return exact;
    const maxLen = Math.max(normalized.length, ...seenOptions.map((item) => item.text.length), 0);
    if (maxLen < 80) return null;
    return seenOptions.find((item) => veryStrictSimilar(item.raw, raw, 0.997)) || null;
  }

  function comparableText(text) {
    return normalizeText(stripCopyUiPhrases(text))
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function editDistanceLimited(a, b, limit = 8) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      let rowMin = cur[0];
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur[j] = value;
        if (value < rowMin) rowMin = value;
      }
      if (rowMin > limit) return limit + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function veryStrictSimilar(a, b, threshold = 0.992) {
    const left = comparableText(a);
    const right = comparableText(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const maxLen = Math.max(left.length, right.length);
    if (maxLen < 80) return false;
    const limit = Math.max(1, Math.floor(maxLen * (1 - threshold)));
    const distance = editDistanceLimited(left, right, limit);
    return (1 - (distance / maxLen)) >= threshold;
  }

  function auditPage() {
    const problems = [];
    const answerKey = [];
    const questions = [];
    const standardOptionCounts = readStandardOptionCounts();
    const standardOptions = standardOptionCounts[0] || 4;
    const expectedQuestionCount = readExpectedQuestionCount();
    const initialBlocks = collectQuestionBlocks();
    const fallbackGroups = Array.from(document.querySelectorAll('[role="radiogroup"]')).filter(visible);
    const blocks = initialBlocks.length ? initialBlocks : uniqueElements(fallbackGroups.map(findQuestionBlockFromRadioGroup));
    const groupsToUse = [];
    const sectionBlocks = getSectionBlocks();
    const sectionContext = buildSectionContext(sectionBlocks);

    if (!blocks.length && !fallbackGroups.length) problems.push('Nenhum grupo de alternativas foi encontrado. A página pode estar na edição sem visualização carregada, ou o Forms mudou a estrutura.');

    blocks.forEach((block, idx) => {
      const group = block.querySelector('[role="radiogroup"]') || fallbackGroups[idx] || block;
      if (!group || !visible(group)) return;
      groupsToUse.push(group);
      const options = findOptionContainers(group);
      const correct = [];
      options.forEach((container, i) => { if (isCorrectOption(container)) correct.push(i); });
      const number = extractQuestionNumber(block) || (idx + 1);
      const prompt = extractQuestionPrompt(block, group);
      const rawOptionTexts = options.map(optionTextForAudit);
      const markerInfo = detectManualOptionMarkers(rawOptionTexts);
      const optionTexts = rawOptionTexts.map((text, optionIndex) => stripOptionMarkerForAudit(text, optionIndex, markerInfo));
      const mathLetterMarkers = options.map((container, optionIndex) => optionMathLetterMarkerForAudit(container, optionIndex));
      const looseLetterMarkers = rawOptionTexts.map((text, optionIndex) => mathLetterMarkers[optionIndex] || optionStartsWithExpectedLetterForMap(text, optionIndex));
      const strictLetterMarkers = rawOptionTexts.map((text, optionIndex) => mathLetterMarkers[optionIndex] || optionStrictLetterMarkerForMap(text, optionIndex));
      const looseLetterCount = looseLetterMarkers.filter(Boolean).length;
      const letterMarkers = markerInfo?.looseSequential || looseLetterCount >= Math.max(3, Math.ceil(rawOptionTexts.length * 0.75)) ? looseLetterMarkers : strictLetterMarkers;
      const emptyModel = isEmptyModel(block);
      const section = sectionForBlock(block, sectionContext);
      questions.push({ order: idx + 1, number, prompt, totalOptions: options.length, correct, optionTexts, rawOptionTexts, letterMarkers, emptyModel, sectionTitle: section?.title || '', sectionIndex: Number.isInteger(section?.index) ? section.index : -1 });
    });

    questions.sort((a, b) => a.number - b.number);
    if (!questions.length) problems.push('Nenhuma questão encontrada para o relatório.');
    if (expectedQuestionCount != null && questions.length !== expectedQuestionCount) {
      problems.push(`Quantidade de questões diferente: encontrado ${questions.length}; configurado ${expectedQuestionCount}`);
    }

    questions.forEach((q, i) => {
      if (!q.prompt) problems.push(`Q${q.number}: Sem enunciado`);
      if (q.emptyModel) problems.push(`Q${q.number}: Questão em branco`);
      if (q.totalOptions && !standardOptionCounts.includes(q.totalOptions)) {
        problems.push(`Q${q.number}: Tem ${q.totalOptions} alternativas; aceitas: ${standardOptionCounts.join(', ')}`);
      }
      if (!q.totalOptions) problems.push(`Q${q.number}: Sem alternativas`);
      if (q.correct.length === 0) problems.push(`Q${q.number}: Sem resposta correta`);
      if (q.correct.length > 1) problems.push(`Q${q.number}: Mais de uma resposta correta`);
      if (q.correct.length === 1) answerKey.push(`${q.number}: ${letter(q.correct[0])}`);
      const seenOptions = [];
      (q.optionTexts || []).forEach((text, optIndex) => {
        const current = normalizeOptionForDuplicateCheck(text);
        if (!current || current.length < 2) return;
        const repeated = duplicateOptionAlreadySeen(seenOptions, current, text);
        if (repeated) problems.push(`Q${q.number}: Alternativa ${letter(optIndex)} igual à alternativa ${letter(repeated.index)}`);
        else seenOptions.push({ text: current, raw: text, index: optIndex });
      });
      if (q.prompt) {
        const np = comparableText(q.prompt);
        const repeated = questions.findIndex((other, j) => {
          if (j >= i) return false;
          const op = comparableText(other.prompt);
          if (!np || !op || np.length < 18 || op.length < 18) return false;
          return np === op || veryStrictSimilar(other.prompt, q.prompt, 0.992);
        });
        if (repeated !== -1) problems.push(`Q${q.number}: Enunciado repetido com Q${questions[repeated].number}`);
      }
    });

    for (let i = 0; i < questions.length; i += 1) if (questions[i].number !== i + 1) problems.push(`Numeração fora da ordem: esperado ${i + 1}, encontrado ${questions[i].number}`);

    const imageInfo = countContentImages(blocks, sectionBlocks);
    return {
      generatedAt: new Date().toLocaleString('pt-BR'),
      url: location.href,
      title: getFormTitle() || document.title,
      mode: pageMode(),
      questions,
      radioGroups: groupsToUse.length || fallbackGroups.length,
      candidateBlocks: blocks.length,
      sections: sectionBlocks.length,
      sectionTitles: sectionContext.map((section) => section.title),
      images: imageInfo.count,
      standardOptions,
      standardOptionCounts,
      expectedQuestionCount,
      problems,
      answerKey
    };
  }

  function buildTextReport(audit) {
    let report = '';
    report += 'RELATÓRIO DE AUDITORIA - ASSISTENTE DE FORMS\n';
    report += `Data: ${audit.generatedAt}\nURL: ${audit.url}\nModo: ${audit.mode}\n`;
    const configuredOptionCounts = audit.standardOptionCounts?.length ? audit.standardOptionCounts : readStandardOptionCounts();
    const configuredQuestionCount = audit.expectedQuestionCount ?? readExpectedQuestionCount();
    report += `Questões extraídas: ${audit.questions.length}\nAlternativas aceitas por questão: ${configuredOptionCounts.join(', ')}\nQuantidade de questões configurada: ${configuredQuestionCount == null ? 'não configurada' : configuredQuestionCount}\nGrupos de alternativas: ${audit.radioGroups}\nImagens de conteúdo: ${audit.images}\nSeções detectadas: ${audit.sections}\nRespostas corretas identificadas: ${audit.answerKey.length}\n\n`;
    if (audit.problems.length) {
      report += `PROBLEMAS ENCONTRADOS (${audit.problems.length}):\n`;
      audit.problems.forEach((p) => { report += `- ${problemTextSimple(p)}\n`; });
    } else report += 'Nenhum problema estrutural aparente.\n';
    report += '\nGABARITO:\n';
    report += audit.answerKey.length ? audit.answerKey.join('\n') + '\n' : 'Nenhuma resposta correta identificada.\n';
    report += '\nQUESTÕES EXTRAÍDAS:\n';
    audit.questions.forEach((q) => {
      const total = q.totalOptions || 0;
      const altLabel = Number(total) === 1 ? 'alternativa' : 'alternativas';
      report += `Q${q.number}: ${total} ${altLabel}, corretas: ${q.correct.map(letter).join(', ') || '-'}\n`;
    });
    return report;
  }

  function problemTextSimple(value) {
    return String(value || '')
      .replace(/parece estar em modelo vazio\/padrão do Forms/gi, 'Questão em branco')
      .replace(/questão em modelo\/padrão do Forms/gi, 'Questão em branco')
      .replace(/sem resposta correta identificada/gi, 'Sem resposta correta')
      .replace(/mais de uma alternativa marcada como correta/gi, 'Mais de uma resposta marcada')
      .replace(/alternativas não identificadas/gi, 'Sem alternativas')
      .replace(/sem enunciado/gi, 'Sem texto da questão')
      .trim();
  }

  function groupProblemsHtml(problems) {
    const grouped = new Map();
    const general = [];
    problems.forEach((problem) => {
      const m = String(problem).match(/^Q(\d{1,3}):\s*(.*)$/i);
      if (m) {
        const q = Number(m[1]);
        if (!grouped.has(q)) grouped.set(q, []);
        grouped.get(q).push(problemTextSimple(m[2] || problem));
      } else {
        general.push(problemTextSimple(problem));
      }
    });
    const generalHtml = general.length ? `<div class="problem-line general"><span class="problem-num">Geral</span><ul class="problem-items">${general.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
    const rows = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([q, items]) => {
      const unique = Array.from(new Set(items));
      return `<div class="problem-line"><span class="problem-num">Q${escapeHtml(q)}</span><ul class="problem-items">${unique.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
    }).join('');
    return rows || generalHtml ? `<div class="problem-list">${generalHtml}${rows}</div>` : '<p class="empty-ok">Nenhum problema encontrado.</p>';
  }

  function groupProblemsData(problems) {
    const grouped = new Map();
    const general = [];
    (problems || []).forEach((problem) => {
      const m = String(problem).match(/^Q(\d{1,3}):\s*(.*)$/i);
      if (m) {
        const q = Number(m[1]);
        if (!grouped.has(q)) grouped.set(q, []);
        grouped.get(q).push(problemTextSimple(m[2] || problem));
      } else {
        general.push(problemTextSimple(problem));
      }
    });
    return { grouped, general };
  }

  function issueTypeClass(item) {
    const t = normalizeText(item);
    if (t.includes('sem resposta')) return 'no-answer';
    if (t.includes('branco') || t.includes('modelo')) return 'blank';
    if (t.includes('alternativa') || t.includes('alternativas')) return 'option';
    if (t.includes('mais de uma')) return 'multi';
    if (t.includes('quantidade de questoes') || t.includes('quantidade de questões')) return 'question-count';
    if (t.includes('numeracao') || t.includes('numeração')) return 'numbering';
    if (t.includes('igual') || t.includes('repetido')) return 'duplicate';
    if (t.includes('enunciado') || t.includes('texto')) return 'text';
    return 'generic';
  }

  function issueTypeIcon(type) {
    return ({
      'no-answer': '✓',
      blank: '○',
      option: 'A',
      multi: '!',
      'question-count': 'Q',
      numbering: '#',
      duplicate: '≋',
      text: 'T',
      generic: '!'
    })[type] || '!';
  }

  function issueSummaryLabel(type, count) {
    const singular = Number(count) === 1;
    return ({
      'no-answer': singular ? 'sem resposta correta' : 'sem resposta correta',
      blank: singular ? 'em branco' : 'em branco',
      option: singular ? 'problema em alternativa' : 'problemas em alternativas',
      multi: singular ? 'resposta múltipla' : 'respostas múltiplas',
      'question-count': singular ? 'quantidade de questões' : 'quantidades de questões',
      numbering: singular ? 'problema de numeração' : 'problemas de numeração',
      duplicate: singular ? 'repetição' : 'repetições',
      text: singular ? 'problema no texto' : 'problemas no texto',
      generic: singular ? 'outro alerta' : 'outros alertas'
    })[type] || (singular ? 'outro alerta' : 'outros alertas');
  }