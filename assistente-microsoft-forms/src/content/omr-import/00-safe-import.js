  // Evidência completa, distinta das prévias truncadas usadas na interface.
  function importNodeEvidence(node, prompt = false) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll(prompt
      ? '[role="radiogroup"], [data-automation-id="questionChoiceOptionContainer"], button, [role="button"], svg, path'
      : 'button, [role="button"], svg, path').forEach((el) => el.remove());
    const math = Array.from(clone.querySelectorAll('math, [data-mathml], [data-latex], [data-math]'))
      .filter((el) => !el.parentElement?.closest('math, [data-mathml], [data-latex], [data-math]'))
      .map(questionHistoryCanonicalMath);
    const images = Array.from(clone.querySelectorAll('img')).map((el) => el.getAttribute('src') || '');
    const scripts = Array.from(clone.querySelectorAll('sup, sub')).map((el) => [el.tagName, el.textContent]);
    return { math, images, scripts };
  }

  function buildImportEvidence(block, group, options, optionTexts, number) {
    const clone = block.cloneNode(true);
    clone.querySelectorAll('[role="radiogroup"], [data-automation-id="questionChoiceOptionContainer"], svg, path, button, [role="button"]').forEach((el) => el.remove());
    const prompt = cleanText(clone.textContent).replace(new RegExp(`^${number}\\s*[.)]?\\s*`), '');
    return {
      version: 1,
      prompt: JSON.stringify([prompt, importNodeEvidence(clone, true)]),
      options: options.map((node, i) => JSON.stringify([cleanText(optionTexts[i]), importNodeEvidence(node)]))
    };
  }

  function resolveSafeImport(audit, sourceQuestion) {
    const blocked = (label) => ({ level: 'blocked', label });
    const evidence = sourceQuestion?.importEvidence;
    if (evidence?.version !== 1 || !evidence.prompt || !Array.isArray(evidence.options)) return blocked('Reabra a origem para atualizar a leitura completa.');
    const answer = String(sourceAnswerForBankQuestion(sourceQuestion)).trim().toUpperCase();
    const index = /^[A-Z]$/.test(answer) ? answer.charCodeAt(0) - 65 : -1;
    if (index < 0 || index >= evidence.options.length || evidence.options.length !== Number(sourceQuestion.optionCount)) return blocked('Resposta inválida na origem.');
    if (new Set(evidence.options).size !== evidence.options.length) return blocked('Alternativas repetidas na origem: associação ambígua.');
    const candidates = (audit?.questions || []).filter((q) => !q.emptyModel && q.importEvidence?.version === 1 && q.importEvidence.prompt === evidence.prompt);
    if (candidates.length !== 1) return blocked(candidates.length ? 'Enunciado repetido: destino ambíguo.' : 'Conteúdo diferente ou leitura incompleta no destino.');
    const destination = candidates[0];
    const destOptions = destination.importEvidence.options;
    if (!Array.isArray(destOptions) || destOptions.length !== evidence.options.length || destOptions.length !== destination.totalOptions
      || new Set(destOptions).size !== destOptions.length || !evidence.options.every((value) => destOptions.includes(value))) return blocked('Alternativas diferentes ou ambíguas no destino.');
    const destIndex = destOptions.indexOf(evidence.options[index]);
    return { level: 'similar', label: `Conteúdo conferido: origem Q${sourceQuestion.questionNumber} → destino Q${destination.number}`, destination, answer: letter(destIndex) };
  }
