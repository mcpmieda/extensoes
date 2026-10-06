

  async function runInsertAlternativeLetters() {
    return runAlternativeLetterAction('insert');
  }

  async function runRemoveAlternativeLetters() {
    return runAlternativeLetterAction('remove');
  }

  async function runCapitalizeAlternatives() {
    return runAlternativeLetterAction('capitalize');
  }

  async function runAlternativeLetterAction(mode) {
    await withBusy(async () => {
      if (pageMode() === 'visualização') await returnToEditIfPreview();
      const input = document.getElementById('gssf-letter-range');
      const isRemoving = mode === 'remove';
      const isCapitalizing = mode === 'capitalize';
      const capitalizeWithInsert = mode === 'insert' && Boolean(document.getElementById('gssf-letter-capitalize')?.checked);
      await stepProgress('letters', 5, 'Lendo intervalo...', 90);
      const dashboardQuestions = Number(document.querySelector('#gssf-kpis .gssf-kpi:nth-child(1) b')?.textContent || 0);
      const visibleMax = Math.max(0, ...collectQuestionBlocks().map(questionNumberFromBlock).filter(Boolean));
      const maxQuestion = Math.max(dashboardQuestions, visibleMax);
      const targets = parseQuestionRange(input?.value || '', maxQuestion || 999);
      if (!targets.length) {
        await askConfirm({ title: 'Informe as questões', message: 'Digite uma questão ou intervalo. Exemplo: 1, 3-8 ou 12.', confirmText: 'Entendi' });
        setProgress('letters', 0, '');
        return;
      }
      showTaskOverlay(
        isCapitalizing ? 'Ajustando iniciais' : isRemoving ? 'Removendo letras' : 'Inserindo letras',
        isCapitalizing ? 'Deixando a primeira letra das alternativas em maiúscula.' : isRemoving ? 'Limpando letras antigas das alternativas escolhidas.' : 'Atualizando alternativas nas questões escolhidas.'
      );
      try {
        let changed = 0;
        let hadMathInRun = false;
        const failures = [];
        const skipped = [];
        for (let i = 0; i < targets.length; i += 1) {
          const qn = targets[i];
          setProgress('letters', 10 + Math.round((i / Math.max(1, targets.length)) * 78), `Questão ${qn}...`);
          const block = await resolveWithin(findQuestionBlockByNumber(qn), 9000, null);
          if (!block) {
            failures.push(`Q${qn}: não encontrada`);
            continue;
          }
          // V8: primeira barreira antes de qualquer clique/edição.
          // Usa a mesma detecção do diagnóstico, que já reconhece o modelo vazio
          // mesmo quando versões anteriores colocaram A/B/C/D em "Opção 1...".
          // Restrita apenas ao modo Inserir letras; remover/capitalizar permanecem intactos.
          if (!isRemoving && !isCapitalizing && isEmptyModel(block)) {
            skipped.push(`Q${qn}: em branco`);
            continue;
          }
          await scrollBlockIntoView(block);
          try { block.click(); } catch (_) {}
          await sleep(520);
          let fields = [];
          let optionContainers = [];
          let editBlock = block;
          for (let attempt = 0; attempt < 12 && !fields.length; attempt += 1) {
            const candidates = questionBlockCandidates(qn);
            const freshBlock = candidates.find((candidate) => optionCountForBlock(candidate)) || candidates[0] || block;
            editBlock = freshBlock || editBlock;
            const group = freshBlock.querySelector('[role="radiogroup"]') || freshBlock;
            const options = findOptionContainers(group).slice(0, 12);
            fields = [];
            optionContainers = [];
            for (const option of options) {
              const field = await editableFieldForOption(option);
              if (field) {
                fields.push(field);
                optionContainers.push(option);
              }
            }
            if (!fields.length) {
              fields = optionTextFieldsForQuestion(qn, freshBlock);
              optionContainers = [];
            }
            if (!fields.length) {
              fields = visibleOptionTextFieldsForQuestion(qn);
              optionContainers = [];
            }
            if (!fields.length) await sleep(220);
          }
          if (!fields.length) {
            failures.push(`Q${qn}: sem alternativas editáveis`);
            continue;
          }
          const fieldTexts = fields.map(optionCurrentText);
          const currentTexts = fields.map((field, optIndex) => optionVisibleTextForLetterAction(field, optionContainers[optIndex] || null));
          // V8: segunda barreira após localizar os campos, porque o Forms às vezes
          // troca o bloco ativo depois do clique. Se o bloco fresco for modelo vazio, pula.
          if (!isRemoving && !isCapitalizing && (isEmptyModel(editBlock) || shouldSkipBlankNormalQuestionForLetterInsertion(editBlock, fields, optionContainers, currentTexts))) {
            skipped.push(`Q${qn}: em branco`);
            continue;
          }
          const markerInfo = detectManualOptionMarkers(currentTexts);
          const removalProofs = isRemoving ? currentTexts.map((text, optIndex) =>
            provenAlternativePrefixOrigin(qn, optIndex, text)
              || provenAlternativePrefixOrigin(qn, optIndex, text, mathIntegrityFingerprints(optionContainers[optIndex] || null, fields[optIndex]))) : [];
          const nextTexts = currentTexts.map((text, optIndex) => {
            if (isCapitalizing) return capitalizeAlternativeText(text);
            if (isRemoving) return removalProofs[optIndex]?.mathAfter
              ? removalProofs[optIndex].originalText
              : withoutAlternativeLetter(text, optIndex, false, markerInfo, removalProofs[optIndex]);
            const next = withAlternativeLetter(text, optIndex, capitalizeWithInsert, markerInfo);
            // Cinto de segurança adicional: sem capitalização explícita, a ação Inserir
            // não pode produzir um texto que deixe de conter integralmente o original.
            // Se uma futura heurística violar essa regra, a alternativa não é editada.
            if (!capitalizeWithInsert && !alternativeInsertionPreservesOriginal(text, next, optIndex)) {
              failures.push(`Q${qn} ${letter(optIndex)}: edição bloqueada para preservar o conteúdo original`);
              return cleanText(text);
            }
            return next;
          });
          if (currentTexts.length && currentTexts.every((text, optIndex) => cleanText(text) === cleanText(nextTexts[optIndex]) && cleanText(fieldTexts[optIndex]) === cleanText(nextTexts[optIndex]))) {
            skipped.push(`Q${qn}`);
            continue;
          }
          let qChanged = 0;
          let qHadMath = false;
          for (let optIndex = 0; optIndex < fields.length; optIndex += 1) {
            const field = fields[optIndex];
            const current = optionCurrentText(field);
            const next = nextTexts[optIndex];
            if (cleanText(current) === cleanText(next)) continue;

            let optionContainer = optionContainers[optIndex] || null;
            let activeField = field;
            let activeBlock = editBlock;
            let mathLike = isMathOptionField(activeField, optionContainer, activeBlock);
            if (mathLike) {
              qHadMath = true;
              hadMathInRun = true;
            }
            let applied = false;
            let mathBefore = null;

            if (mathLike) {
              const fresh = await freshOptionTargetForLetterAction(qn, optIndex, activeBlock);
              activeBlock = fresh.block || activeBlock;
              optionContainer = fresh.optionContainer || optionContainer;
              activeField = fresh.field || activeField;
              mathLike = isMathOptionField(activeField, optionContainer, activeBlock);
              if (mathLike) {
                qHadMath = true;
                hadMathInRun = true;
              }

              if (isRemoving) {
                if (removalProofs[optIndex]?.mathAfter) applied = await removeMathOptionLetterOnly(activeField, optionContainer, activeBlock, optIndex, qn, removalProofs[optIndex].mathBefore);
              } else if (!isCapitalizing) {
                // ÚNICA mudança em relação à V7: rota especial para campo matemático.
                mathBefore = mathIntegrityFingerprints(optionContainer, activeField);
                applied = await insertMathOptionLetterOnly(activeField, optionContainer, activeBlock, optIndex);
              } else {
                applied = await setMathOptionTextLikeUser(activeField, next, optionContainer, activeBlock);
              }
            } else {
              // O Forms pode recriar os campos após cada input/blur. Nunca escrever
              // na fotografia dos campos obtida antes de editar a primeira opção.
              const fresh = await freshNormalOptionTarget(qn, optIndex, activeBlock);
              activeBlock = fresh.block || activeBlock;
              optionContainer = fresh.optionContainer || optionContainer;
              activeField = fresh.field;
              applied = isRemoving && removalProofs[optIndex]?.mathAfter ? false : isRemoving && removalProofs[optIndex]
                ? (removeProvenRichTextPrefix(activeField, removalProofs[optIndex], optIndex) || setTextLikeUser(activeField, next))
                : await editNormalAlternativeText(qn, optIndex, activeBlock, next);
              if (applied) {
                await commitNormalAlternativeField(activeField);
                const confirmed = await freshNormalOptionTarget(qn, optIndex, activeBlock);
                applied = Boolean(confirmed.field && alternativeEditLooksApplied(confirmed.field, confirmed.optionContainer, optIndex, next, false));
              }
            }

            if (applied && mathLike) {
              applied = await confirmAlternativeEditVisually(qn, optIndex, next, activeField, optionContainer, activeBlock, true);
            }

            if (applied) {
              if (isRemoving) forgetAlternativePrefixOrigin(qn, optIndex);
              else if (!isCapitalizing && !capitalizeWithInsert && next === `${letter(optIndex)} ${cleanText(currentTexts[optIndex])}`) {
                const mathAfter = mathLike ? mathIntegrityFingerprints(optionContainer, activeField) : null;
                if (mathLike ? mathBefore?.length && mathAfter?.length : alternativeTextEquivalentForEdit(optionCurrentText(activeField), next)) {
                  recordAlternativePrefixOrigin(qn, optIndex, currentTexts[optIndex], next, mathBefore, mathAfter);
                }
              }
              qChanged += 1;
              changed += 1;
            } else {
              const visuallyApplied = await confirmAlternativeEditVisually(qn, optIndex, next, activeField, optionContainer, activeBlock, mathLike);
              if (visuallyApplied) {
                if (isRemoving) forgetAlternativePrefixOrigin(qn, optIndex);
                qChanged += 1;
                changed += 1;
              } else {
                failures.push(`Q${qn} ${letter(optIndex)}: não consegui confirmar edição${mathLike ? ' no editor matemático' : ''}`);
              }
            }
            await sleep(mathLike ? 420 : 95);
          }
          if (qChanged) {
            if (qHadMath) await commitEditedOptionField(fields[fields.length - 1], editBlock);
            if (qHadMath) {
              await waitForFormsAutosaveAfterEdits(3600);
            } else {
              // Campos comuns: a escrita já foi aplicada e conferida visualmente.
              // Evita a espera longa de autosave que deixava a última alternativa parecendo travada.
              await sleep(180);
            }
          }
          if (!isRemoving && !qHadMath) {
            // Conferir mesmo quando nenhuma alternativa foi aplicada na primeira
            // tentativa; antes, questões inteiras com falha não recebiam retry.
            const finalRetried = await retryMissingNormalAlternativeEdits(qn, fields, optionContainers, editBlock, nextTexts);
            if (finalRetried) {
              changed += finalRetried;
              await sleep(180);
            }
            for (let optIndex = 0; optIndex < fields.length; optIndex += 1) {
              const fresh = await freshNormalOptionTarget(qn, optIndex, editBlock);
              const confirmed = fresh.field && alternativeEditLooksApplied(fresh.field, fresh.optionContainer, optIndex, nextTexts[optIndex], false);
              if (!confirmed) continue;
              const failure = `Q${qn} ${letter(optIndex)}: não consegui confirmar edição`;
              const failureIndex = failures.indexOf(failure);
              if (failureIndex >= 0) failures.splice(failureIndex, 1);
            }
          }
        }
        if (input) {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await clearFormsFocusArtifacts();
        if (hadMathInRun) {
          // M2 Matemática: cada questão matemática ainda faz espera final própria.
          // Aqui fica só uma estabilização curta do lote para não duplicar espera longa.
          await waitForFormsAutosaveAfterEdits(2600);
        } else {
          // Campos comuns já salvaram de forma confiável nos testes manuais do usuário.
          // Mantém uma pausa curta só para estabilizar a interface antes do relatório final.
          await sleep(520);
        }
        setProgress('letters', 100, 'Concluído.');
        resetProgressSoon('letters', 900);
        const actionLabel = isCapitalizing ? 'Iniciais ajustadas' : isRemoving ? 'Letras removidas' : 'Letras inseridas';
        log(`${actionLabel} nas alternativas. Itens alterados: ${changed}.${skipped.length ? ' Sem mudança: ' + skipped.join(', ') + '.' : ''}${failures.length ? ' Pendências: ' + failures.join(' | ') : ''}`);
        toast(failures.length ? `${actionLabel} com pendências.` : `${actionLabel}.`);
        scheduleAutoAnalysis(600);
      } finally {
        hideTaskOverlay(700);
      }
    });
  }
