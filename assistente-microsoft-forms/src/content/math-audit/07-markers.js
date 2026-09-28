

  function stripWrappingParenthesesForOption(text) {
    const value = cleanText(text);
    const wrapped = value.match(/^\((.*)\)$/s);
    return wrapped ? cleanText(wrapped[1]) : value;
  }

  function stripExplicitOptionMarker(text, index) {
    const value = cleanText(text);
    if (!value || index < 0 || index > 4) return value;
    const stripped = value.replace(optionMarkerPattern(index, false), '').trim();
    return stripped === value ? value : stripWrappingParenthesesForOption(stripped);
  }

  function optionStartsWithExpectedLooseMarker(text, index) {
    const value = cleanText(asciiMathLetters(text));
    if (!value || index < 0 || index > 4) return false;
    if (optionMarkerPattern(index, false).test(value)) return true;
    return optionMarkerPattern(index, true).test(value);
  }

  function optionHasParenOnlySeparatorMarkerForLetterMap(text, index) {
    const value = cleanText(asciiMathLetters(stripCopyUiPhrases(text)));
    if (!value || index < 0 || index > 4) return false;
    const expected = escapeRegExp(letter(index));
    // Somente para a conferência visual. "A) texto" não é considerado letra pronta,
    // porque a ferramenta oficial insere "A texto". Não altera inserir/remover letras nem Word.
    return new RegExp('^\\s*' + expected + '\\s*\\)\\s*(?=\\S|$)', 'i').test(value);
  }

  function optionStartsWithExpectedLetterForMap(text, index) {
    if (optionHasParenOnlySeparatorMarkerForLetterMap(text, index)) return false;
    return optionStartsWithExpectedLooseMarker(text, index);
  }

  function optionStrictLetterMarkerForMap(text, index) {
    const value = cleanText(asciiMathLetters(stripCopyUiPhrases(text)));
    if (!value || index < 0 || index > 4) return false;
    if (optionHasParenOnlySeparatorMarkerForLetterMap(value, index)) return false;
    return optionMarkerPattern(index, false).test(value);
  }

  function optionMathLetterMarkerForAudit(optionContainer, optionIndex) {
    if (!optionContainer || optionIndex < 0 || optionIndex > 4) return false;
    const field = optionTextField(optionContainer);
    if (mathAlternativeVisuallyHasLetter(optionContainer, field, optionIndex)) return true;
    return mathOptionTextSamples(optionContainer, field).some((sample) => optionStartsWithExpectedLetterForMap(collapseRepeatedMathText(sample), optionIndex));
  }

  function detectManualOptionMarkers(optionTexts) {
    const raw = (optionTexts || []).map((text) => cleanText(stripCopyUiPhrases(text)));
    const usable = raw.filter((text) => text && !isPlaceholderOptionForAudit(text)).length;
    const expectedCount = Math.min(raw.length, 5);
    if (usable < 3 || expectedCount < 3) return { looseSequential: false };
    let matches = 0;
    for (let i = 0; i < expectedCount; i += 1) {
      if (optionStartsWithExpectedLooseMarker(raw[i], i)) matches += 1;
    }
    return { looseSequential: matches >= Math.max(3, Math.ceil(expectedCount * 0.75)) };
  }

  function stripOptionMarkerForAudit(text, index, markerInfo = null) {
    const value = cleanText(stripCopyUiPhrases(text));
    if (!value) return '';
    const explicit = stripExplicitOptionMarker(value, index);
    if (explicit !== value) return explicit;
    if (markerInfo?.looseSequential && index >= 0 && index <= 4 && optionMarkerPattern(index, true).test(value)) {
      return stripWrappingParenthesesForOption(value.replace(optionMarkerPattern(index, true), '').trim());
    }
    return value;
  }

