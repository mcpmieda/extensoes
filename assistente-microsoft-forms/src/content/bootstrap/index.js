  // ===== 99-bootstrap.js =====
// Fonte modular: bootstrap.
  if (previousBuild && previousBuild.build === GSSF_BUILD) {
    window.dispatchEvent(new CustomEvent('gssf-toggle-panel'));
    return;
  }

  if (previousBuild) {
    try { previousBuild.destroy?.(); } catch (error) { console.warn('Falha ao encerrar a versão anterior do assistente:', error); }
    try {
      document.getElementById('gssf-root')?.remove();
      document.getElementById('gssf-fab')?.remove();
      document.getElementById('gssf-toast')?.remove();
      document.getElementById('gssf-modal')?.remove();
      document.getElementById('gssf-confirm-modal')?.remove();
      document.getElementById('gssf-work-overlay')?.remove();
      document.getElementById('gssf-question-focus-marker')?.remove();
      document.documentElement.classList.remove('gssf-docked-page', 'gssf-silent-work');
      document.body?.classList.remove('gssf-docked-page');
    } catch (_) {}
  }

  window[GSSF_RUNTIME_KEY] = { build: GSSF_BUILD, version: GSSF_VERSION, loadedAt: Date.now(), destroy: destroyExtension };

  GSSF_LEGACY_RUNTIME_KEYS.forEach((key) => {
    if (key !== GSSF_RUNTIME_KEY) {
      try { delete window[key]; } catch (error) { console.debug('Não foi possível remover identificador legado do assistente.', error); }
    }
  });

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      APP.runtimeMessageHandler = (msg) => {
        if (msg?.type === 'GSSF_FORCE_PANEL') {
          forceActivateFromBrowserAction().catch((error) => reportNonFatalError('runtime:acionamento-manual', error));
          return;
        }
        if (msg?.type === 'GSSF_TOGGLE_PANEL') {
          if (!APP.quizActive) {
            scheduleEligibilityCheck(0);
            return;
          }
          const root = document.getElementById('gssf-root');
          if (!root || root.classList.contains('hidden')) showPanel(); else hidePanel();
        }
      };
      chrome.runtime.onMessage.addListener(APP.runtimeMessageHandler);
    }
  } catch (error) { reportNonFatalError('lifecycle:mensagens-runtime', error); }

  APP.togglePanelHandler = () => {
    if (!APP.quizActive) {
      scheduleEligibilityCheck(0);
      return;
    }
    const root = document.getElementById('gssf-root');
    if (!root || root.classList.contains('hidden')) showPanel(); else hidePanel();
  };

  addLifecycleEventListener(window, 'gssf-toggle-panel', APP.togglePanelHandler);

  if (globalThis.__GSSF_TEST_MODE__) {
    globalThis.__GSSF_TEST_API__ = Object.freeze({
      buildWordHtmlDocument,
      capitalizeAlternativeText,
      cleanClipboardPlainText,
      copyMultilineLines,
      effectiveAnswerOfRecord,
      sourceAnswerForBankQuestion,
      bankFormStatus,
      importMatchInfo,
      sameImportedAnswerFromSource,
      formRecordFingerprint,
      enterOmrMode,
      exitOmrMode,
      firstVFMissingFromField,
      looksLikeVFSequenceAlternative,
      normalizeStandardOptionInput,
      parseQuestionRange,
      preserveQuestionTitleVisualBlocks,
      safeFileNamePart,
      stripCopyUiPhrases,
      vfSequenceTokens,
      withAlternativeLetter,
      withoutAlternativeLetter,
      sanitizeClonedMarkup,
      cleanAllAppSavedData,
      formsObservationRoot,
      quizSignalSummary,
      isQuizOrTestDocument,
      currentFormsDocumentKey,
      setProgress,
      mathOptionAlreadyHasLetter,
      mathAlternativeVisuallyHasLetter,
      cleanMathBodyForLetter,
      alternativeEditLooksApplied
    });
  } else {
    startEligibilityMonitor();
  }
