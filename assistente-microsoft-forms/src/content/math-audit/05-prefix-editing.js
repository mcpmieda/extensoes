

  function mathBodyFingerprint(value) {
    return collapseRepeatedMathText(value || '')
      .replace(/\s/g, '')
      .replace(/[​-‍﻿]/g, '');
  }

  function mathFingerprintsCompatible(a, b) {
    if (!a || !b) return false;
    return a === b;
  }

  function mathIntegrityFingerprints(optionContainer, field) {
    return Array.from(new Set(mathOptionTextSamples(optionContainer, field)
      .map((sample) => mathBodyFingerprint(sample))
      .filter(Boolean)));
  }

  function mathBodyFingerprintAfterInsertedPrefix(sample, optIndex) {
    const wanted = escapeRegExp(letter(optIndex));
    const value = collapseRepeatedMathText(sample || '');
    const prefix = new RegExp('^\\s*' + wanted + '\\s+', 'i');
    return prefix.test(value) ? mathBodyFingerprint(value.replace(prefix, '')) : '';
  }

  function mathBodyWasPreservedAfterInsertion(beforeFingerprints, optionContainer, field, optIndex) {
    if (!Array.isArray(beforeFingerprints) || !beforeFingerprints.length) return false;
    const current = mathOptionTextSamples(optionContainer, field)
      .map((sample) => mathBodyFingerprintAfterInsertedPrefix(sample, optIndex))
      .filter(Boolean);
    const longest = Math.max(...beforeFingerprints.map((fingerprint) => fingerprint.length));
    return beforeFingerprints.some((before) => before.length === longest && current.some((after) => mathFingerprintsCompatible(before, after)));
  }

  function mathExpectedBodyWasPreserved(expected, optionContainer, field, optIndex) {
    const wanted = escapeRegExp(letter(optIndex));
    const expectedText = collapseRepeatedMathText(expected || '').replace(new RegExp('^\\s*' + wanted + '\\s+', 'i'), '');
    const expectedFingerprint = mathBodyFingerprint(expectedText);
    if (!expectedFingerprint) return false;
    return mathOptionTextSamples(optionContainer, field)
      .map((sample) => mathBodyFingerprintAfterInsertedPrefix(sample, optIndex))
      .filter(Boolean)
      .some((current) => mathFingerprintsCompatible(expectedFingerprint, current));
  }

  function mathBodyWasPreserved(beforeBody, optionContainer, field, optIndex) {
    const expected = mathBodyFingerprint(beforeBody);
    if (!expected) return true;
    const current = mathBodyFingerprint(mathBodyForLetter(optionContainer, field, optIndex));
    if (!current) return false;
    return current === expected;
  }

  async function waitForMathOptionLetterRemoved(optionContainer, field, optIndex, timeout = 5200) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (!mathAlternativeVisuallyHasLetter(optionContainer, field, optIndex)) return true;
      await sleep(220);
    }
    return false;
  }

  async function deleteMathPrefixSymbol(editor, useSelectionFallback = false) {
    if (!editor || !mathEquationTextareaLike(editor)) return false;
    await moveMathCursorToStart(editor);
    if (useSelectionFallback) {
      pressMathKey(editor, 'ArrowRight', 'ArrowRight', 39, { shiftKey: true });
      await sleep(90);
      pressMathKey(editor, 'Backspace', 'Backspace', 8);
    } else {
      pressMathKey(editor, 'Delete', 'Delete', 46);
    }
    await sleep(320);
    return true;
  }

  async function removeMathOptionLetterOnly(field, optionContainer, block, optIndex, qn = 0) {
    if (!mathAlternativeVisuallyHasLetter(optionContainer, field, optIndex)) return true;
    const beforeBody = mathBodyForLetter(optionContainer, field, optIndex);
    if (!beforeBody) return false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0 && qn) {
        const fresh = await freshOptionTargetForLetterAction(qn, optIndex, block);
        field = fresh.field || field;
        optionContainer = fresh.optionContainer || optionContainer;
        block = fresh.block || block;
      }
      const editor = await activateMathEditorAtStart(field, optionContainer);
      if (!editor || !mathEquationTextareaLike(editor)) return false;
      await deleteMathPrefixSymbol(editor, attempt > 0);
      const ok = mathCommitButtonNear(editor) || mathCommitButtonNear(field);
      if (ok) {
        fireRealClick(ok);
        await sleep(360);
      }
      await commitEditedOptionField(editor, block || optionContainer || field);
      await waitForFormsAutosaveAfterEdits(5200);
      await sleep(420);

      const removed = await waitForMathOptionLetterRemoved(optionContainer, field, optIndex, 1800);
      if (removed) return mathBodyWasPreserved(beforeBody, optionContainer, field, optIndex);
    }
    return false;
  }

  // Não há mais reconstrução automática de expressão matemática na ação Inserir letras.
  // Falha de confirmação encerra a tentativa sem uma segunda edição destrutiva.

  function firstMathVisualTarget(optionContainer, field) {
    return optionContainer?.querySelector?.('.mq-editable-field, .mq-math-mode, .MathJax, [class*="MathJax"], [data-mathml], math, mjx-container') || field;
  }

  async function activateMathEditorAtStart(field, optionContainer = null) {
    const target = firstMathVisualTarget(optionContainer, field) || optionContainer || field;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { (optionContainer || field)?.scrollIntoView?.({ block: 'center', inline: 'nearest' }); } catch (_) {}
      await sleep(attempt ? 180 : 90);
      const r = target?.getBoundingClientRect?.() || (optionContainer || field)?.getBoundingClientRect?.();
      if (r && r.width && r.height) {
        fireRealClickAt(Math.max(8, r.left + 4), Math.max(8, r.top + Math.min(r.height - 4, Math.max(8, r.height / 2))));
      } else {
        try { fireRealClick(optionContainer || field); } catch (_) { try { (optionContainer || field)?.click?.(); } catch (__) {} }
      }
      await sleep(260 + attempt * 110);
      const editor = findMathTextareaNear(field, optionContainer) || activeEditableNearField(field, optionContainer);
      if (mathEquationTextareaLike(editor)) return editor;
    }
    return findMathTextareaNear(field, optionContainer);
  }

  async function waitForMathOptionLetter(optionContainer, field, optIndex, timeout = 5200) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (mathOptionAlreadyHasLetter(optionContainer, field, optIndex)) return true;
      await sleep(220);
    }
    return false;
  }

  async function insertMathOptionLetterOnly(field, optionContainer, block, optIndex) {
    // Uma única inserção, sem select-all, sem reconstrução e sem remoção de conteúdo.
    if (mathOptionAlreadyHasLetter(optionContainer, field, optIndex) || mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex)) return true;
    const beforeFingerprints = mathIntegrityFingerprints(optionContainer, field);
    if (!beforeFingerprints.length) return false;
    const wanted = letter(optIndex);
    const editor = await activateMathEditorAtStart(field, optionContainer);
    if (!editor) return false;

    await moveMathCursorToStart(editor);
    await typeCharIntoMathTextarea(editor, wanted);
    await typeCharIntoMathTextarea(editor, ' ');
    await sleep(360);
    const ok = mathCommitButtonNear(editor) || mathCommitButtonNear(field);
    if (ok) {
      fireRealClick(ok);
      await sleep(360);
    }
    await commitEditedOptionField(editor, block || optionContainer || field);

    let letterConfirmed = await waitForMathOptionLetter(optionContainer, field, optIndex, 2600);
    if (!letterConfirmed && !mathOptionAlreadyHasLetter(optionContainer, field, optIndex) && !mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex)) {
      await waitForFormsAutosaveAfterEdits(6200);
      await sleep(360);
      letterConfirmed = mathOptionAlreadyHasLetter(optionContainer, field, optIndex) || mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex);
    }
    if (!letterConfirmed) return false;
    if (!mathBodyWasPreservedAfterInsertion(beforeFingerprints, optionContainer, field, optIndex)) return false;
    await sleep(180);
    return true;
  }
