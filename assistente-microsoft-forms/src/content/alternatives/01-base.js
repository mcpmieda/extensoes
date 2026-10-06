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
    // Se a alternativa já começa pela letra esperada e o próximo caractere não é
    // uma letra de palavra, o caso é ambíguo (marcador ou variável matemática).
    // Não editar é mais seguro do que duplicar a letra ou alterar uma expressão.
    return new RegExp(`^${wanted}(?:\\s+|$|(?=[^\\p{L}]))`, 'iu').test(raw);
  }

  function detectAlternativeParenMarkerSequence(optionTexts) {
    const texts = (optionTexts || []).map((text) => cleanText(text).trim());
    // Uma letra isolada pode ser variavel: confirmar a escala inteira A/B/C/D(/E).
    if (texts.length < 3 || texts.length > 5) return false;
    return texts.every((text, index) => new RegExp(`^${escapeRegExp(letter(index))}(?:\\s*\\)|\\s+|$)`, 'i').test(text));
  }

  function normalizeExistingParenAlternative(text, optionIndex, markerInfo = null) {
    if (!markerInfo?.parenSequential || optionIndex < 0 || optionIndex > 4) return null;
    const raw = cleanText(text).trim();
    const wanted = letter(optionIndex);
    const match = raw.match(new RegExp(`^${escapeRegExp(wanted)}\\s*\\)\\s*(.*)$`, 'is'));
    if (!match) return null;
    // Dois ')' no inicio sao ambiguos; nao consumir um a cada nova execucao.
    if (match[1].startsWith(')')) return null;
    // Retirar somente o primeiro ')' do rotulo; preservar o corpo completo.
    return match[1] ? `${wanted} ${match[1]}` : wanted;
  }

  function alternativeInsertionPreservesOriginal(originalText, nextText, optionIndex, markerInfo = null) {
    const original = cleanText(originalText).trim();
    const next = cleanText(nextText).trim();
    if (!original) return true;
    if (next === original) return true;
    const normalizedParen = normalizeExistingParenAlternative(original, optionIndex, markerInfo);
    if (normalizedParen !== null && next === normalizedParen) return true;
    const wanted = escapeRegExp(letter(optionIndex));
    const match = next.match(new RegExp(`^${wanted}\\s+(.*)$`, 'is'));
    return Boolean(match && cleanText(match[1]).trim() === original);
  }

  function withAlternativeLetter(text, optionIndex, capitalizeBody = false, markerInfo = null) {
    const wanted = letter(optionIndex);
    const raw = cleanText(text).trim();
    if (!raw) return wanted;

    const normalizedParen = normalizeExistingParenAlternative(raw, optionIndex, markerInfo);
    if (normalizedParen !== null) {
      if (!capitalizeBody) return normalizedParen;
      const body = normalizedParen.slice(wanted.length).trim();
      return body ? `${wanted} ${capitalizeAlternativeBody(body)}` : wanted;
    }

    // REGRA DE INTEGRIDADE: fora do ')' confirmado acima, nunca remove prefixo ou operador
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

  function alternativeBodyLooksMathSensitive(text) {
    const body = cleanText(text).trim();
    if (!body) return false;
    // Números, agrupadores e operadores/símbolos matemáticos tornam o prefixo
    // A/B/C/D/E ambíguo. Nesses casos, Remover letras não toca no conteúdo.
    return /^(?:[0-9⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]|[([+\-−–—±∓×÷=≠≈≡<>≤≥/\\|%√∛∞∑∏∫∂∆∈∉∪∩∧∨→←↔°′″~^_*·•⊕⊗⌈⌊])/u.test(body);
  }

  const alternativePrefixOrigins = new Map();

  function alternativePrefixOriginKey(questionNumber, optionIndex) {
    return `${globalThis.location?.href || ''}|${questionNumber}|${optionIndex}`;
  }

  function recordAlternativePrefixOrigin(questionNumber, optionIndex, originalText, insertedText, mathBefore = null, mathAfter = null) {
    alternativePrefixOrigins.set(alternativePrefixOriginKey(questionNumber, optionIndex), {
      originalText: cleanText(originalText), insertedText: cleanText(insertedText), mathBefore, mathAfter
    });
  }

  function provenAlternativePrefixOrigin(questionNumber, optionIndex, currentText, mathFingerprints = null) {
    const proof = alternativePrefixOrigins.get(alternativePrefixOriginKey(questionNumber, optionIndex));
    if (!proof) return null;
    if (mathFingerprints) {
      const longest = Math.max(0, ...(proof.mathAfter || []).map(value => value.length));
      return longest && (proof.mathAfter || []).some(value => value.length === longest && mathFingerprints.includes(value)) ? proof : null;
    }
    return cleanText(currentText) === proof.insertedText ? proof : null;
  }

  function forgetAlternativePrefixOrigin(questionNumber, optionIndex) {
    alternativePrefixOrigins.delete(alternativePrefixOriginKey(questionNumber, optionIndex));
  }

  function stripAlternativeLetterOnly(text, optionIndex, proof = null) {
    const raw = cleanText(text).trim();
    if (!raw) return '';
    const wanted = escapeRegExp(letter(optionIndex));
    if (proof && raw === proof.insertedText && raw === `${letter(optionIndex)} ${proof.originalText}`) return proof.originalText;
    if (new RegExp(`^${wanted}$`, 'i').test(raw)) return proof?.insertedText === raw && proof?.originalText === '' ? '' : raw;

    const spaced = raw.match(new RegExp(`^${wanted}\\s+(.*)$`, 'is'));
    if (spaced) {
      // Uma letra seguida de palavra pode ser uma variável. Sem a fotografia da
      // inserção feita nesta sessão, não existe prova para apagá-la.
      return raw;
    }

    // Separadores tipográficos inequivocamente visuais continuam removíveis.
    // Hífen/sinal, operadores, números e quaisquer outros casos compactos ficam intactos.
    const explicit = raw.match(new RegExp(`^${wanted}([\\)\\].:,])(.*)$`, 'is'));
    if (explicit) return cleanText(`${explicit[1]}${explicit[2]}`);
    return raw;
  }

  function withoutAlternativeLetter(text, optionIndex, capitalizeBody = false, markerInfo = null, proof = null) {
    const body = stripAlternativeLetterOnly(text, optionIndex, proof);
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
