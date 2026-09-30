

  function authoredQuestionPromptTextForBlankCheck(block, group = null) {
    if (!block) return '';
    const clone = block.cloneNode(true);
    clone.querySelectorAll([
      '[role="radiogroup"]',
      '[data-automation-id="questionChoiceOptionContainer"]',
      '[role="radio"]',
      'input[type="radio"]',
      'button',
      '[role="button"]',
      'svg',
      'path',
      '#gssf-root',
      '#gssf-fab',
      '#gssf-toast',
      '#gssf-modal',
      '#gssf-confirm-modal',
      '#gssf-work-overlay'
    ].join(',')).forEach((el) => el.remove());
    let value = cleanText(stripCopyUiPhrases(clone.textContent || ''));
    value = value.replace(/^\s*\d{1,3}\s*[.\-–—:)]?\s*/g, '').trim();

    const titleFields = Array.from(block.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')).filter((field) => {
      if (!visible(field) || isOptionTextField(field, group || block)) return false;
      const label = blockedOptionFieldLabel(field);
      return /titulo da pergunta|título da pergunta|question title|question text|pergunta/.test(label);
    });
    const fieldValue = titleFields.map((field) => {
      const text = cleanText(optionCurrentText(field) || textOf(field));
      const placeholder = cleanText(field.getAttribute?.('placeholder') || field.getAttribute?.('aria-label') || '');
      if (text && normalizeText(text) !== normalizeText(placeholder)) return text;
      return '';
    }).filter(Boolean).join(' ');
    if (fieldValue) value = `${value} ${fieldValue}`.trim();

    return cleanText(value);
  }

  function isBlankQuestionPromptText(text) {
    let t = normalizeText(text)
      .replace(/^\s*\d{1,3}\s*[.\-–—:)]?\s*/g, '')
      .replace(/\b(titulo da pergunta|título da pergunta|question title|question text|digite sua pergunta|digite a pergunta|adicionar descrição|adicionar descricao|descricao da pergunta|descrição da pergunta|question subtitle)\b/g, ' ')
      .replace(/\b(pontos|points|obrigatoria|obrigatória|required|mais opcoes|mais opções|opcoes da pergunta|opções da pergunta)\b/g, ' ')
      .replace(/\b(texto da opcao de escolha|texto da opção de escolha|texto da alternativa|texto da resposta|choice option text|choice text|option text|answer text)\b/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return true;
    if (/^(pergunta|questao|questão|question|sem titulo|sem título|untitled question)$/.test(t)) return true;
    if (/^(pergunta|questao|questão|question)\s*\d{0,3}$/.test(t)) return true;
    return false;
  }

  function optionPlaceholderCoreForBlankCheck(text, optionIndex = -1) {
    let t = normalizeText(stripCopyUiPhrases(text))
      .replace(/\b(texto da opcao de escolha|texto da opção de escolha|texto da alternativa|texto da resposta|choice option text|choice text|option text|answer text)\b/g, ' ')
      .replace(/\b(adicionar opcao|adicionar opção|adicionar alternativa|add option|add choice)\b/g, ' ')
      .replace(/[.:;]+$/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (optionIndex >= 0 && optionIndex <= 25) {
      // Se uma versão anterior já tiver colocado A/B/C/D no modelo vazio, ainda tratamos
      // como placeholder para evitar nova alteração em cima da questão em branco.
      t = t.replace(new RegExp(`^\\s*${escapeRegExp(letter(optionIndex))}\\s+`, 'i'), '').trim();
    }
    return t;
  }

  function isSequentialPlaceholderOptionText(text, optionIndex) {
    const raw = cleanText(stripCopyUiPhrases(text));
    if (!raw) return true;
    const stripped = stripOptionMarkerForAudit(raw, optionIndex, { looseSequential: true });
    if (isPlaceholderOptionForAudit(stripped)) return true;
    const t = optionPlaceholderCoreForBlankCheck(stripped, optionIndex);
    if (!t) return true;
    const expectedNumber = Number(optionIndex) + 1;
    if (expectedNumber > 0) {
      const exactExpected = new RegExp(`^(opcao|opção|option|choice|alternativa|resposta)\\s*${expectedNumber}$`, 'i');
      if (exactExpected.test(t)) return true;
    }
    return /^(opcao|opção|option|choice|alternativa|resposta)\s*\d{1,2}$/i.test(t)
      || /^(opcao|opção|option|choice|alternativa|resposta)$/i.test(t);
  }

  function stripPlaceholderOptionsFromPromptForBlankCheck(promptText, optionTexts = []) {
    let value = cleanText(promptText);
    if (!value || !Array.isArray(optionTexts) || !optionTexts.length) return value;

    optionTexts.forEach((text, optIndex) => {
      const pieces = uniqueElements([
        cleanText(text),
        stripOptionMarkerForAudit(text, optIndex, { looseSequential: true }),
        optionPlaceholderCoreForBlankCheck(text, optIndex)
      ].filter(Boolean)).filter((piece) => isSequentialPlaceholderOptionText(piece, optIndex));

      pieces.forEach((piece) => {
        if (!piece) return;
        const normalizedPiece = optionPlaceholderCoreForBlankCheck(piece, optIndex);
        [piece, normalizedPiece].filter(Boolean).forEach((candidate) => {
          value = cleanText(value.replace(new RegExp(`(^|\\s)${escapeRegExp(candidate)}(?=\\s|$)`, 'gi'), ' '));
        });
      });
    });

    return cleanText(value);
  }

  function optionBlankPlaceholderEvidenceForInsertion(field, optionContainer = null, visibleText = '', optIndex = -1) {
    const primaryPieces = [
      visibleText,
      optionCurrentText(field),
      textOf(optionContainer)
    ].map(cleanText).filter(Boolean);
    if (primaryPieces.length) {
      return primaryPieces.every((piece) => isSequentialPlaceholderOptionText(piece, optIndex));
    }
    const attrPieces = [
      field?.getAttribute?.('aria-label') || '',
      field?.getAttribute?.('placeholder') || '',
      optionContainer?.getAttribute?.('aria-label') || '',
      optionContainer?.getAttribute?.('title') || ''
    ].map(cleanText).filter(Boolean);
    if (!attrPieces.length) return true;
    return attrPieces.some((piece) => isSequentialPlaceholderOptionText(piece, optIndex));
  }

  function promptBlankAfterRemovingPlaceholderEvidence(block, group, optionEvidenceTexts = []) {
    const promptText = authoredQuestionPromptTextForBlankCheck(block, group);
    let promptWithoutPlaceholders = stripPlaceholderOptionsFromPromptForBlankCheck(promptText, optionEvidenceTexts);
    promptWithoutPlaceholders = normalizeText(promptWithoutPlaceholders)
      .replace(/^\s*\d{1,3}\s*[.\-–—:)]?\s*/g, '')
      .replace(/\b(texto da opcao de escolha|texto da opção de escolha|texto da alternativa|texto da resposta|choice option text|choice text|option text|answer text)\b/g, ' ')
      .replace(/\b(opcao|opção|option|choice|alternativa|resposta)\s*\d{1,2}\b/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return isBlankQuestionPromptText(promptWithoutPlaceholders);
  }

  function shouldSkipBlankNormalQuestionForLetterInsertion(block, fields = [], optionContainers = [], currentTexts = null) {
    if (!block || !fields.length) return false;
    const group = block.querySelector?.('[role="radiogroup"]') || block;
    const optionsCount = fields.length;
    if (optionsCount < 2 || optionsCount > 8) return false;

    // Não tocar na rota matemática. Se qualquer alternativa tiver artefato real de fórmula,
    // a lógica antiga/estável de Matemática continua decidindo.
    for (let i = 0; i < fields.length; i += 1) {
      if (isMathOptionField(fields[i], optionContainers[i] || null, block)) return false;
    }

    const texts = currentTexts || fields.map((field, optIndex) => optionVisibleTextForLetterAction(field, optionContainers[optIndex] || null));
    const optionEvidenceTexts = fields.map((field, optIndex) => cleanText([
      texts[optIndex] || '',
      optionCurrentText(field),
      textOf(optionContainers[optIndex] || null),
      field?.getAttribute?.('aria-label') || '',
      field?.getAttribute?.('placeholder') || '',
      optionContainers[optIndex]?.getAttribute?.('aria-label') || '',
      optionContainers[optIndex]?.getAttribute?.('title') || ''
    ].filter(Boolean).join(' ')));

    // Primeira validação forte: todas as alternativas ainda são somente placeholders do Forms
    // (Opção 1, Opção 2...) ou labels de campo que contêm somente esse placeholder.
    const placeholderOptions = fields.every((field, optIndex) => optionBlankPlaceholderEvidenceForInsertion(field, optionContainers[optIndex] || null, texts[optIndex] || '', optIndex));
    if (!placeholderOptions) return false;

    // Segunda validação: depois de remover os placeholders das alternativas, o enunciado
    // precisa ficar vazio ou apenas com o termo padrão Pergunta/Question.
    if (!promptBlankAfterRemovingPlaceholderEvidence(block, group, optionEvidenceTexts)) return false;

    const hasContentImage = Array.from(block.querySelectorAll('img')).some((img) => meaningfulImage(img));
    if (hasContentImage) return false;
    return true;
  }

  function isEmptyModel(block, knownOptionTexts = null) {
    if (!block) return false;
    const group = block.querySelector?.('[role="radiogroup"]') || block;
    // Array.filter/map passam um índice como segundo argumento.
    const optionTexts = Array.isArray(knownOptionTexts) ? knownOptionTexts : findOptionContainers(group).map(optionTextForAudit);
    if (optionTexts.length >= 2 && optionTexts.every((text, index) => isSequentialPlaceholderOptionText(text, index)) && isBlankQuestionPromptText(authoredQuestionPromptTextForBlankCheck(block, group))) return true;
    const t = normalizeText(textOf(block));
    return t.includes('pergunta') && t.includes('opcao 1') && t.includes('opcao 2') && t.includes('opcao 3') && t.includes('opcao 4');
  }
