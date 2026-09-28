

  function mathBodyFingerprint(value) {
    return normalizeText(collapseRepeatedMathText(value || ''))
      .replace(/\\(?:text|mathrm|mathbf|mathit)\s*/g, '')
      .replace(/[{}\s]/g, '')
      .replace(/[​-‍﻿]/g, '');
  }

  function mathBodyWasPreserved(beforeBody, optionContainer, field, optIndex) {
    const expected = mathBodyFingerprint(beforeBody);
    if (!expected) return true;
    const current = mathBodyFingerprint(mathBodyForLetter(optionContainer, field, optIndex));
    if (!current) return false;
    return current === expected || current.includes(expected) || expected.includes(current);
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

  async function replaceMathOptionWithPrefix(field, optionContainer, block, optIndex) {
    const wanted = letter(optIndex);
    const body = mathBodyForLetter(optionContainer, field, optIndex);
    if (!body) return false;
    const attempts = [`${wanted} ${body}`, `\\text{${wanted} }${body}`];
    for (const value of attempts) {
      const editor = await activateMathEditorAtStart(field, optionContainer);
      if (!editor) continue;
      await selectAllMathEditor(editor);
      await sleep(120);
      await sendTextToMathTextarea(editor, value);
      await sleep(280);
      const ok = mathCommitButtonNear(editor) || mathCommitButtonNear(field);
      if (ok) {
        fireRealClick(ok);
        await sleep(360);
      }
      await commitEditedOptionField(editor, block || optionContainer || field);
      await waitForFormsAutosaveAfterEdits(9800);
      await sleep(700);
      if (mathOptionAlreadyHasLetter(optionContainer, field, optIndex)) return true;
    }
    return false;
  }

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
    // PROTEÇÃO PERMANENTE — FUNÇÃO SENSÍVEL AO DOM E AO TEMPO INTERNO DO MICROSOFT FORMS.
    // NUNCA "CORRIGIR", REFATORAR, SIMPLIFICAR OU SUBSTITUIR ESTA FUNÇÃO, MESMO QUE UMA
    // ANÁLISE ESTÁTICA INDIQUE ERROS APARENTES. O COMPORTAMENTO DEPENDE DA PÁGINA REAL.
    // Só alterar mediante pedido explícito do responsável pelo projeto, reprodução no Forms
    // real e testes específicos que comprovem a necessidade. Fora disso, preserve byte a byte.
    if (mathOptionHasRepeatedLeadingLetter(optionContainer, field, optIndex)) {
      return replaceMathOptionWithPrefix(field, optionContainer, block, optIndex);
    }
    if (mathOptionAlreadyHasLetter(optionContainer, field, optIndex)) return true;
    const wanted = letter(optIndex);

    // V11: fazer somente UMA digitação por alternativa matemática.
    // Na V10, quando o Forms demorava a refletir o resultado salvo, a segunda tentativa
    // podia gerar "A A 64". Agora a segunda etapa é só correção/reconstrução, nunca nova digitação.
    const editor = await activateMathEditorAtStart(field, optionContainer);
    if (editor) {
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
      const letterConfirmed = await waitForMathOptionLetter(optionContainer, field, optIndex, 2600);
      if (mathOptionHasRepeatedLeadingLetter(optionContainer, field, optIndex)) {
        return replaceMathOptionWithPrefix(field, optionContainer, block, optIndex);
      }
      if (letterConfirmed || mathOptionAlreadyHasLetter(optionContainer, field, optIndex) || mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex)) {
        // M2 Matemática: depois que a letra aparece visualmente no editor, não esperar
        // o autosave completo em cada alternativa. A espera final da questão continua
        // ativa no fluxo principal, preservando segurança sem travar em A/B/C/D.
        await sleep(180);
        return true;
      }
      // Se a letra ainda não apareceu, volta ao modo conservador antes de tentar reconstruir.
      await waitForFormsAutosaveAfterEdits(6200);
      await sleep(360);
      if (mathOptionHasRepeatedLeadingLetter(optionContainer, field, optIndex)) {
        return replaceMathOptionWithPrefix(field, optionContainer, block, optIndex);
      }
      if (mathOptionAlreadyHasLetter(optionContainer, field, optIndex) || mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex)) return true;
    }

    // Se a tentativa salvou no fim da fórmula, não repetir a letra: reconstruir a alternativa inteira
    // preservando o corpo matemático original e deixando uma única letra no começo.
    return replaceMathOptionWithPrefix(field, optionContainer, block, optIndex);
  }