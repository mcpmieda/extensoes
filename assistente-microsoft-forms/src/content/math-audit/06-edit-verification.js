

  function alternativeTextEquivalentForEdit(a, b) {
    return normalizeText(cleanText(a || '')).replace(/\s+/g, ' ').trim() === normalizeText(cleanText(b || '')).replace(/\s+/g, ' ').trim();
  }

  function alternativePrefixVisualRegex(optIndex) {
    return new RegExp('^\\s*' + escapeRegExp(letter(optIndex)) + '(?:\\s+|$)', 'i');
  }

  function alternativeTextHasVisualPrefix(text, optIndex) {
    const value = cleanText(asciiMathLetters(String(text || ''))).replace(/[​-‍﻿]/g, '').trim();
    if (!value) return false;
    return alternativePrefixVisualRegex(optIndex).test(value);
  }

  function mathAlternativeVisuallyHasLetter(optionContainer, field, optIndex) {
    if (mathOptionAlreadyHasLetter(optionContainer, field, optIndex) || mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex)) return true;
    return mathOptionTextSamples(optionContainer, field).some((sample) => alternativeTextHasVisualPrefix(collapseRepeatedMathText(sample), optIndex));
  }

  function alternativeEditLooksApplied(field, optionContainer, optIndex, expected, mathLike) {
    const current = optionVisibleTextForLetterAction(field, optionContainer);
    const mathField = Boolean(mathLike || isMathOptionField(field, optionContainer, null));
    if (!mathField) return cleanText(current) === cleanText(expected);
    if (alternativeTextEquivalentForEdit(current, expected)) return true;
    const expectedHasPrefix = alternativeTextHasVisualPrefix(expected, optIndex);

    const visualHasPrefix = mathAlternativeVisuallyHasLetter(optionContainer, field, optIndex);
    if (visualHasPrefix && expectedHasPrefix) return mathExpectedBodyWasPreserved(expected, optionContainer, field, optIndex);
    if (!visualHasPrefix && !expectedHasPrefix) {
      const expectedBody = mathBodyFingerprint(expected);
      const currentBody = mathBodyFingerprint(mathOptionTextSamples(optionContainer, field)[0] || current);
      return mathFingerprintsCompatible(expectedBody, currentBody);
    }
    return false;
  }

  async function confirmAlternativeEditVisually(qn, optIndex, expected, field, optionContainer, activeBlock, mathLike) {
    for (let attempt = 0; attempt < (mathLike ? 9 : 3); attempt += 1) {
      let block = activeBlock;
      let option = optionContainer;
      let candidateField = field;
      if (attempt > 0) {
        const fresh = mathLike ? await freshOptionTargetForLetterAction(qn, optIndex, activeBlock) : await freshNormalOptionTarget(qn, optIndex, activeBlock);
        block = fresh.block || block;
        option = fresh.optionContainer || option;
        candidateField = fresh.field || candidateField;
      }
      if (candidateField && alternativeEditLooksApplied(candidateField, option, optIndex, expected, mathLike)) return true;
      await sleep(attempt < 3 ? 260 : 420);
    }
    return false;
  }

  async function retryMissingNormalAlternativeEdits(qn, fields, optionContainers, activeBlock, nextTexts, options = {}) {
    // Conferência segura para alternativas NORMAIS.
    // V17: corrige casos raros em que uma alternativa comum fica visualmente sem a letra.
    // V20: roda também depois do autosave, porque o Forms pode aceitar a edição no campo,
    // mostrar a alteração por alguns segundos e depois reverter opções intermediárias.
    // A rota de Matemática continua isolada e nunca é tratada aqui.
    let fixed = 0;
    for (let optIndex = 0; optIndex < fields.length; optIndex += 1) {
      const expected = cleanText(nextTexts?.[optIndex] || '');
      if (!expected) continue;
      const fresh = await freshNormalOptionTarget(qn, optIndex, activeBlock);
      const field = fresh.field;
      const optionContainer = fresh.optionContainer || optionContainers?.[optIndex] || null;
      const block = fresh.block || activeBlock;
      if (!field) continue;
      if (isMathOptionField(field, optionContainer, block)) continue;
      const current = optionVisibleTextForLetterAction(field, optionContainer);
      if (cleanText(current) === cleanText(expected)) continue;
      const ok = await editNormalAlternativeText(qn, optIndex, block, expected);
      if (ok) {
        await commitNormalAlternativeField(field);
        const confirmed = await freshNormalOptionTarget(qn, optIndex, block);
        if (confirmed.field && alternativeEditLooksApplied(confirmed.field, confirmed.optionContainer, optIndex, expected, false)) fixed += 1;
      }
    }
    return fixed;
  }

  async function freshNormalOptionTarget(qn, optIndex, fallbackBlock) {
    const candidates = questionBlockCandidates(qn).filter((block) => block.isConnected);
    const block = candidates.find((candidate) => optionTextFieldsForQuestion(qn, candidate).length)
      || candidates[0] || (fallbackBlock?.isConnected ? fallbackBlock : null);
    if (!block) return { block: null, optionContainer: null, field: null };
    const group = block.querySelector('[role="radiogroup"]') || block;
    const optionContainer = findOptionContainers(group)[optIndex] || null;
    let field = optionTextField(optionContainer) || optionTextFieldsForQuestion(qn, block)[optIndex];
    if (!field?.isConnected) {
      const fresh = await freshOptionTargetForLetterAction(qn, optIndex, block);
      return { ...fresh, field: fresh.field?.isConnected ? fresh.field : null };
    }
    return { block, optionContainer, field };
  }

  function setNormalAlternativeText(field, value) {
    if (!field?.isConnected || isMathOptionField(field, null, null)) return false;
    // Um textbox Rooster inativo é apenas uma representação do texto. Escrever
    // nele pelo fallback altera o DOM sem passar pelo editor/salvamento do Forms.
    if (!('value' in field) && !field.isContentEditable) return false;
    if (field.isContentEditable) {
      // Prefixo + capitalização deve editar somente o trecho que mudou. Substituir
      // todo o HTML destruiria formatação; a rotina antiga recusava spans/b/negrito.
      field.focus();
      if (!field.isConnected) return false;
      const original = String(field.textContent || '');
      const requested = String(value ?? '');
      if (original === requested) return true;
      let start = 0;
      while (start < original.length && start < requested.length && original[start] === requested[start]) start += 1;
      let end = original.length;
      let requestedEnd = requested.length;
      while (end > start && requestedEnd > start && original[end - 1] === requested[requestedEnd - 1]) {
        end -= 1;
        requestedEnd -= 1;
      }
      const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node;
      let offset = 0;
      while ((node = walker.nextNode())) {
        nodes.push({ node, start: offset, end: offset + node.textContent.length });
        offset += node.textContent.length;
      }
      const position = (index) => {
        const entry = nodes.find((item) => index <= item.end);
        return entry ? [entry.node, index - entry.start] : [field, 0];
      };
      const range = document.createRange();
      const [startNode, startOffset] = position(start);
      const [endNode, endOffset] = position(end);
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        if (!document.execCommand('insertText', false, requested.slice(start, requestedEnd))) return false;
      } catch (_) { return false; }
      return cleanText(field.textContent) === cleanText(requested);
    }
    return setTextLikeUser(field, value);
  }

  async function editNormalAlternativeText(qn, optIndex, block, value) {
    let fresh = await freshNormalOptionTarget(qn, optIndex, block);
    let field = fresh.field;
    if (!field || isMathOptionField(field, fresh.optionContainer, fresh.block)) return false;
    // O clique/foco monta o Rooster e acrescenta contenteditable e um div interno.
    // Esperar essa montagem e reler o campo evita escrever no textbox inativo.
    try { fireRealClick(field); } catch (_) { try { field.click(); } catch (__) {} }
    try { field.focus(); } catch (_) {}
    for (let attempt = 0; attempt < 8; attempt += 1) {
      fresh = await freshNormalOptionTarget(qn, optIndex, fresh.block || block);
      field = fresh.field;
      if (field?.isConnected && ('value' in field || field.isContentEditable)) {
        if (isMathOptionField(field, fresh.optionContainer, fresh.block)) return false;
        const applied = setNormalAlternativeText(field, value);
        if (applied) await commitNormalAlternativeField(field);
        return applied;
      }
      await sleep(60);
    }
    return false;
  }

  async function commitNormalAlternativeField(field) {
    if (!field?.isConnected) return;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.blur();
    await sleep(120);
  }

  async function freshOptionTargetForLetterAction(qn, optIndex, fallbackBlock = null) {
    const block = await resolveWithin(findQuestionBlockByNumber(qn), 5000, fallbackBlock);
    if (!block) return { block: fallbackBlock, optionContainer: null, field: null };
    try { block.click(); } catch (_) {}
    await sleep(180);
    const group = block.querySelector('[role="radiogroup"]') || block;
    const options = findOptionContainers(group).slice(0, 12);
    const optionContainer = options[optIndex] || null;
    let field = null;
    if (optionContainer) field = await editableFieldForOption(optionContainer);
    if (!field) field = optionTextFieldsForQuestion(qn, block)[optIndex] || visibleOptionTextFieldsForQuestion(qn)[optIndex] || null;
    return { block, optionContainer, field };
  }

  async function activateMathEditorForField(field, optionContainer = null) {
    const targets = uniqueElements([field, optionContainer]).filter(Boolean);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      for (const target of targets) {
        try { target.scrollIntoView?.({ block: 'center', inline: 'nearest' }); } catch (_) {}
        await sleep(80);
        try { fireRealClick(target); } catch (_) { try { target.click?.(); } catch (__) {} }
        await sleep(attempt ? 220 : 160);
        const editor = activeEditableNearField(field, optionContainer);
        if (editor) return editor;
      }
      const r = field.getBoundingClientRect();
      fireRealClickAt(Math.max(20, r.left + 12), Math.max(20, r.top + 12));
      await sleep(220);
      const editor = activeEditableNearField(field, optionContainer);
      if (editor) return editor;
    }
    return activeEditableNearField(field, optionContainer) || field;
  }

  async function setMathOptionTextLikeUser(field, value, optionContainer = null, block = null) {
    // Fallback para ações que não sejam inserção segura de letras em campos de Matemática.
    // Para A/B/C/D em fórmulas, a V11 usa insertMathOptionLetterOnly(), porque o Forms
    // salva melhor quando a letra é digitada como prefixo e confirmada alternativa por alternativa.
    const beforeFieldText = optionCurrentText(field);
    const editor = await activateMathEditorForField(field, optionContainer);
    if (!editor) return false;
    selectEditableContentForUserInsert(editor);
    await sleep(60);
    const inserted = insertTextIntoFocusedEditor(editor, value, false);
    await sleep(180);
    pressEditorConfirmKeys(editor);
    await sleep(160);
    const ok = mathCommitButtonNear(editor) || mathCommitButtonNear(field);
    if (ok) {
      fireRealClick(ok);
      await sleep(360);
    }
    await commitEditedOptionField(editor, block || optionContainer || field);
    await sleep(260);
    await waitForFormsAutosaveAfterEdits(7800);
    const afterFieldText = optionVisibleTextForLetterAction(field, optionContainer);
    const wanted = normalizeText(value).slice(0, 1);
    const changed = normalizeText(afterFieldText) !== normalizeText(beforeFieldText);
    const hasWantedPrefix = new RegExp(`^\\s*${escapeRegExp(wanted)}(\\s|$)`, 'i').test(cleanText(asciiMathLetters(afterFieldText)));
    return inserted || changed || hasWantedPrefix;
  }