  // ===== 20-alternatives.js =====
// Fonte modular: alternatives.
  function capitalizeAlternativeBody(text) {
    const raw = cleanText(text).trim();
    if (!raw) return '';
    return raw.replace(/^([^A-Za-zÀ-ÿ]*)([a-zà-ÿ])/, (_match, prefix, char) => `${prefix}${char.toLocaleUpperCase('pt-BR')}`);
  }

  function vfSequenceTokens(text) {
    const value = cleanText(text)
      .replace(/[–—−]/g, '-')
      .replace(/[|/\\]+/g, '-')
      .replace(/[()\[\]{}]/g, ' ');
    return value.split(/[\s\-]+/)
      .map((part) => normalizeText(part).replace(/[^a-z]/g, ''))
      .filter((part) => part === 'v' || part === 'f');
  }

  function looksLikeVFSequenceAlternative(text) {
    const tokens = vfSequenceTokens(text);
    return tokens.length >= 3;
  }

  function firstVFMissingFromField(containerText, fieldText) {
    const container = cleanText(containerText);
    const field = cleanText(fieldText);
    if (!container || !field || container === field) return false;
    const tokens = vfSequenceTokens(container);
    if (tokens.length < 3) return false;
    const escapedField = escapeRegExp(field).replace(/\s+/g, '\\s+');
    const firstToken = tokens[0];
    const pattern = new RegExp(`^\\s*${firstToken}\\s*[-–—−|/]\\s*${escapedField}\\s*$`, 'i');
    if (pattern.test(container)) return true;
    const compactContainer = normalizeText(container).replace(/[^vf]/g, '');
    const compactField = normalizeText(field).replace(/[^vf]/g, '');
    return compactContainer.length >= 3 && compactField.length >= 2 && compactContainer.slice(1) === compactField;
  }

  function optionVisibleTextForLetterAction(field, optionContainer = null) {
    const fieldText = cleanText(optionCurrentText(field));
    if (!optionContainer) return fieldText;
    let containerText = cleanText(stripCopyUiPhrases(textOf(optionContainer)));
    if (!containerText) return fieldText;
    // Em alguns campos do Forms, principalmente após edição visual, o campo editável pode
    // devolver a sequência V/F sem o primeiro item. Nesses casos, usar o texto visível do
    // contêiner evita destruir informação que o usuário não conseguiria recuperar.
    if (firstVFMissingFromField(containerText, fieldText)) return containerText;
    if (looksLikeVFSequenceAlternative(containerText) && vfSequenceTokens(containerText).length > vfSequenceTokens(fieldText).length) return containerText;
    return fieldText || containerText;
  }

  function protectVFSequenceAfterLetter(originalText, nextText, optionIndex) {
    const originalTokens = vfSequenceTokens(originalText);
    if (originalTokens.length < 3) return nextText;
    const bodyAfterLetter = cleanText(String(nextText || '').replace(new RegExp(`^\\s*${escapeRegExp(letter(optionIndex))}\\s+`, 'i'), ''));
    const nextTokens = vfSequenceTokens(bodyAfterLetter);
    if (nextTokens.length < originalTokens.length) return `${letter(optionIndex)} ${cleanText(originalText)}`;
    return nextText;
  }

  function withAlternativeLetter(text, optionIndex, capitalizeBody = false, markerInfo = null) {
    const wanted = letter(optionIndex);
    const raw = cleanText(text).trim();
    const cleaned = stripAlternativeLetterPrefix(raw, optionIndex, markerInfo);
    const body = cleanText(capitalizeBody ? capitalizeAlternativeBody(cleaned) : cleaned);
    let result;
    if (isAlternativeLetterStandard(raw, optionIndex, markerInfo) && (!capitalizeBody || body === cleanText(stripAlternativeLetterPrefix(raw, optionIndex, markerInfo)))) {
      result = normalizeAlternativeLetterSpacing(raw, optionIndex, markerInfo, capitalizeBody);
    } else {
      result = body ? `${wanted} ${body}` : wanted;
    }
    return protectVFSequenceAfterLetter(raw, result, optionIndex);
  }

  function withoutAlternativeLetter(text, optionIndex, capitalizeBody = false, markerInfo = null) {
    const body = stripAlternativeLetterPrefix(text, optionIndex, markerInfo);
    return cleanText(capitalizeBody ? capitalizeAlternativeBody(body) : body);
  }

  function capitalizeAlternativeText(text) {
    const raw = cleanText(text).trim();
    if (!raw) return '';
    const prefixMatch = raw.match(/^([A-E]\s*[\)\].:,\-–—]\s*|[A-E]\s+)/i);
    if (prefixMatch) {
      const prefix = cleanText(prefixMatch[1] || '');
      const body = raw.slice(prefixMatch[0].length);
      return `${prefix} ${capitalizeAlternativeBody(body)}`.trim();
    }
    return capitalizeAlternativeBody(raw);
  }

  function resolveWithin(promise, ms, fallback = null) {
    let done = false;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!done) resolve(fallback);
      }, ms);
      Promise.resolve(promise).then((value) => {
        done = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(() => {
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      });
    });
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function explicitAlternativePrefixRegex() {
    return /^\s*([A-E])\s*[\)\].:,\-–—]\s*/i;
  }

  function looseAlternativePrefixRegex(optionIndex) {
    const wanted = escapeRegExp(letter(optionIndex));
    return new RegExp(`^\\s*${wanted}\\s+`, 'i');
  }

  function normalizeAlternativeLetterSpacing(text, optionIndex, markerInfo = null, capitalizeBody = false) {
    const wanted = letter(optionIndex);
    const raw = cleanText(text).trim();
    if (!raw) return '';
    const body = stripAlternativeLetterPrefix(raw, optionIndex, markerInfo);
    const prepared = cleanText(capitalizeBody ? capitalizeAlternativeBody(body) : body);
    return prepared ? `${wanted} ${prepared}` : wanted;
  }

  function isAlternativeLetterStandard(text, optionIndex, markerInfo = null) {
    const wanted = letter(optionIndex);
    const raw = cleanText(text).trim();
    if (raw === wanted) return true;
    if (new RegExp(`^${escapeRegExp(wanted)}\\s+\\S`, 'i').test(raw)) return true;
    if (explicitAlternativePrefixRegex().test(raw)) {
      const m = raw.match(explicitAlternativePrefixRegex());
      return m && normalizeText(m[1]) === normalizeText(wanted);
    }
    if (markerInfo?.looseSequential && looseAlternativePrefixRegex(optionIndex).test(raw)) return true;
    return false;
  }

  function stripAlternativeLetterPrefix(text, optionIndex, markerInfo = null) {
    const raw = cleanText(text).trim();
    if (!raw) return '';
    const explicit = raw.replace(explicitAlternativePrefixRegex(), '').trim();
    if (explicit !== raw) return stripWrappingParenthesesForOption(explicit);
    if (markerInfo?.looseSequential && optionIndex >= 0 && optionIndex <= 4) {
      const loose = raw.replace(looseAlternativePrefixRegex(optionIndex), '').trim();
      if (loose !== raw) return stripWrappingParenthesesForOption(loose);
    }
    return raw;
  }