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

  function alternativeStartsWithExpectedLetter(text, optionIndex) {
    const wanted = escapeRegExp(letter(optionIndex));
    const raw = cleanText(text).trim();
    if (!raw) return false;
    // Inserção é deliberadamente não destrutiva: qualquer alternativa que já comece
    // com a letra esperada é preservada byte-a-byte (após cleanText), inclusive
    // símbolos matemáticos como "A - 25", "B +25", "C ± 2" etc.
    return new RegExp(`^${wanted}(?:\\s|$|[\)\].:,;\-–—−+±×÷=<>≤≥/\\\\|])`, 'i').test(raw);
  }

  function alternativeInsertionPreservesOriginal(originalText, nextText, optionIndex) {
    const original = cleanText(originalText).trim();
    const next = cleanText(nextText).trim();
    if (!original) return true;
    if (next === original) return true;
    const wanted = escapeRegExp(letter(optionIndex));
    const match = next.match(new RegExp(`^${wanted}\\s+(.*)$`, 'is'));
    return Boolean(match && cleanText(match[1]).trim() === original);
  }

  function withAlternativeLetter(text, optionIndex, capitalizeBody = false, markerInfo = null) {
    const wanted = letter(optionIndex);
    const raw = cleanText(text).trim();
    if (!raw) return wanted;

    // REGRA DE INTEGRIDADE: inserir letra nunca remove prefixo, separador ou operador
    // existente. A heurística antiga interpretava "A - 25" como "A" + separador
    // e transformava a alternativa em "A 25" numa segunda execução. Não há como
    // distinguir com segurança um separador visual de um operador matemático apenas
    // pelo texto, então a inserção não faz mais essa inferência destrutiva.
    if (alternativeStartsWithExpectedLetter(raw, optionIndex)) {
      if (!capitalizeBody) return raw;
      const prefix = raw.match(new RegExp(`^${escapeRegExp(wanted)}(\\s+)(.*)$`, 'is'));
      if (!prefix) return raw;
      return `${wanted}${prefix[1]}${capitalizeAlternativeBody(prefix[2])}`;
    }

    const body = cleanText(capitalizeBody ? capitalizeAlternativeBody(raw) : raw);
    const result = body ? `${wanted} ${body}` : wanted;
    return protectVFSequenceAfterLetter(raw, result, optionIndex);
  }

  function stripAlternativeLetterOnly(text, optionIndex) {
    const raw = cleanText(text).trim();
    if (!raw) return '';
    const wanted = escapeRegExp(letter(optionIndex));
    if (new RegExp(`^${wanted}$`, 'i').test(raw)) return '';
    // Remoção também é conservadora: retiramos somente a letra e o espaço que a
    // ferramenta pode ter inserido. Pontuação e operadores nunca são descartados,
    // porque “A - 25” pode significar letra A seguida do número negativo -25.
    const spaced = raw.match(new RegExp(`^${wanted}\\s+(.*)$`, 'is'));
    if (spaced) return cleanText(spaced[1]);
    if (new RegExp(`^${wanted}(?=\\S)`, 'i').test(raw)) return cleanText(raw.slice(1));
    return raw;
  }

  function withoutAlternativeLetter(text, optionIndex, capitalizeBody = false, markerInfo = null) {
    const body = stripAlternativeLetterOnly(text, optionIndex);
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