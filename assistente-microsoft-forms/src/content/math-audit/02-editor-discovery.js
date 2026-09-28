

  function nodeAttrText(el) {
    if (!el) return '';
    return normalizeText([
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('placeholder') || '',
      el.getAttribute?.('data-automation-id') || '',
      el.getAttribute?.('title') || '',
      el.className || '',
      el.id || ''
    ].join(' '));
  }

  function fieldRectDistanceScore(a, b) {
    try {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const ax = ar.left + ar.width / 2, ay = ar.top + ar.height / 2;
      const bx = br.left + br.width / 2, by = br.top + br.height / 2;
      return Math.abs(ax - bx) + Math.abs(ay - by);
    } catch (_) { return 999999; }
  }

  function nearElement(a, b, padX = 520, padY = 420) {
    if (!a || !b) return false;
    try {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const ax = ar.left + ar.width / 2, ay = ar.top + ar.height / 2;
      const bx = br.left + br.width / 2, by = br.top + br.height / 2;
      return Math.abs(ax - bx) <= padX && Math.abs(ay - by) <= padY;
    } catch (_) { return false; }
  }

  function mathEditorVisibleNear(field) {
    if (!field) return false;
    const mathHints = /alternar para latex|latex|equation|f[oó]rmula|formula|raiz|pot[eê]ncia|expoente|fra[cç][aã]o|sqrt|sum|inserir uma equa[cç][aã]o/i;
    const candidates = all('button, [role="button"], [role="dialog"], [role="grid"], [role="textbox"], [aria-label], [title], input, textarea, [contenteditable="true"]')
      .filter((el) => visible(el) && !el.closest?.('#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker'))
      .filter((el) => nearElement(field, el, 640, 520));
    return candidates.some((el) => mathHints.test(`${nodeAttrText(el)} ${normalizeText(textOf(el)).slice(0, 260)}`));
  }

  function isMathOptionField(field, optionContainer = null, block = null) {
    // V18: detecção mais rígida para não confundir campo normal com editor matemático.
    // O Forms mantém um botão/alternância "Matemática" dentro da questão, mas isso NÃO
    // significa que as alternativas sejam fórmulas. Só usamos a rota especial quando a
    // própria alternativa/campo tem artefatos reais de MathJax/MathQuill/equação.
    const mathArtifacts = 'script[type="math/tex"], [data-mathml], .MathJax, [class*="MathJax"], mjx-container, math, .mq-editable-field, .mq-math-mode';
    const directText = normalizeText([
      nodeAttrText(field),
      nodeAttrText(optionContainer)
    ].join(' '));
    if (/inserir uma equa[cç][aã]o|alternar para latex|equation|latex|f[oó]rmula|formula/.test(directText)) {
      // Só aceitar por texto/aria-label quando o próprio campo for um editor textual ativo.
      if (field?.matches?.('textarea, input, [role="textbox"], [contenteditable="true"]') || field?.isContentEditable) return true;
    }
    if (optionContainer?.querySelector?.(mathArtifacts)) return true;
    if (field?.matches?.(mathArtifacts)) return true;
    if (field?.closest?.('.mq-editable-field, .mq-math-mode, mjx-container')) return true;

    const active = document.activeElement;
    if (mathEquationTextareaLike(active) && nearElement(field, active, 620, 520)) {
      // O textarea oculto de equação pode ficar ativo depois do clique, mas só deve
      // ativar a rota matemática se a alternativa clicada tiver MathJax/MathQuill real.
      if (optionContainer?.querySelector?.(mathArtifacts)) return true;
      const visual = firstMathVisualTarget(optionContainer, field);
      if (visual && visual !== field && nearElement(visual, active, 620, 520)) return true;
    }
    return false;
  }

  function activeEditableNearField(field, optionContainer = null) {
    const active = document.activeElement;
    const pool = [];
    if (active && active !== document.body) pool.push(active);
    if (optionContainer) pool.push(...Array.from(optionContainer.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')));
    pool.push(...Array.from(document.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')));
    return uniqueElements(pool).filter((el) => {
      if (!editableTextLike(el) || !visible(el) || isBlockedOptionField(el)) return false;
      if (el.closest?.('#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker')) return false;
      if (optionContainer && optionContainer.contains?.(el)) return true;
      return mathEquationTextareaLike(el) && nearElement(field, el, 620, 520);
    }).sort((a, b) => {
      const aa = mathEquationTextareaLike(a) ? -20000 : (a === active ? -1000 : 0);
      const bb = mathEquationTextareaLike(b) ? -20000 : (b === active ? -1000 : 0);
      return (aa + fieldRectDistanceScore(a, field)) - (bb + fieldRectDistanceScore(b, field));
    })[0] || null;
  }

  function selectEditableContentForUserInsert(el) {
    if (!el) return false;
    try { el.focus(); } catch (_) {}
    try { el.dispatchEvent(new FocusEvent('focus', { bubbles: true })); } catch (_) {}
    try {
      if (typeof el.select === 'function' && ('value' in el)) {
        el.select();
        try { el.setSelectionRange(0, String(el.value || '').length); } catch (_) {}
        return true;
      }
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch (_) { return false; }
  }

  function editorTextNow(el) {
    if (!el) return '';
    if ('value' in el) return cleanText(el.value);
    return cleanText(el.textContent || el.innerText || el.getAttribute?.('aria-label') || '');
  }

  function insertTextIntoFocusedEditor(el, value, allowDomFallback = false) {
    if (!el) return false;
    const before = editorTextNow(el);
    try { el.focus(); } catch (_) {}
    try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: value })); } catch (_) {}
    let ok = false;
    try { ok = Boolean(document.execCommand?.('insertText', false, value)); } catch (_) { ok = false; }
    if (!ok && 'value' in el) {
      try {
        const proto = Object.getPrototypeOf(el);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        ok = true;
      } catch (_) {}
    }
    if (!ok && allowDomFallback) {
      try { el.innerText = value; ok = true; } catch (_) { try { el.textContent = value; ok = true; } catch (__) {} }
    }
    try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value })); } catch (_) { try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (__) {} }
    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' })); } catch (_) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    const after = editorTextNow(el);
    return ok || normalizeText(after) !== normalizeText(before) || normalizeText(after).includes(normalizeText(value).slice(0, 16));
  }

  function pressEditorConfirmKeys(el) {
    if (!el) return;
    ['keydown', 'keypress', 'keyup'].forEach((type) => {
      try { el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13 })); } catch (_) {}
    });
  }