

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
    if (alternativeTextEquivalentForEdit(current, expected)) return true;
    const expectedHasPrefix = alternativeTextHasVisualPrefix(expected, optIndex);
    if (alternativeTextHasVisualPrefix(current, optIndex) && expectedHasPrefix) return true;
    if (mathLike || isMathOptionField(field, optionContainer, null)) {
      const visualHasPrefix = mathAlternativeVisuallyHasLetter(optionContainer, field, optIndex);
      if (visualHasPrefix && expectedHasPrefix) return true;
      if (!visualHasPrefix && !expectedHasPrefix) {
        const expectedBody = mathBodyFingerprint(expected);
        const currentBody = mathBodyFingerprint(mathBodyForLetter(optionContainer, field, optIndex) || current);
        return Boolean(currentBody && (!expectedBody || currentBody === expectedBody || currentBody.includes(expectedBody) || expectedBody.includes(currentBody)));
      }
    }
    return false;
  }

  async function confirmAlternativeEditVisually(qn, optIndex, expected, field, optionContainer, activeBlock, mathLike) {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      let block = activeBlock;
      let option = optionContainer;
      let candidateField = field;
      if (attempt > 0) {
        const fresh = await freshOptionTargetForLetterAction(qn, optIndex, activeBlock);
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
      const fresh = await freshOptionTargetForLetterAction(qn, optIndex, activeBlock);
      const field = fresh.field || fields[optIndex];
      const optionContainer = fresh.optionContainer || optionContainers?.[optIndex] || null;
      const block = fresh.block || activeBlock;
      if (!field) continue;
      if (isMathOptionField(field, optionContainer, block)) continue;
      const current = optionVisibleTextForLetterAction(field, optionContainer);
      if (alternativeTextEquivalentForEdit(current, expected)) continue;
      const ok = setTextLikeUser(field, expected);
      if (ok) {
        fixed += 1;
        if (options.commitEach) {
          await commitEditedOptionField(field, block);
          if (options.waitSave) await waitForFormsAutosaveAfterEdits(3600);
        } else {
          await sleep(160);
        }
      }
    }
    return fixed;
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