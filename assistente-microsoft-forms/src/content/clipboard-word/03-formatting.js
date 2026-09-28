

  function copyElementLooksFormatted(el) {
    if (!el?.querySelectorAll) return false;
    try {
      if (/^(B|STRONG|EM|I|U)$/i.test(el.tagName || '')) return true;
      if (el.querySelector('b,strong,em,i,u,[style*="font-weight" i],[style*="font-style" i],[style*="text-decoration" i]')) return true;
      const items = [el].concat(Array.from(el.querySelectorAll('*')).slice(0, 260));
      for (const node of items) {
        if (!node || /^(IMG|PICTURE|SVG|VIDEO|CANVAS)$/i.test(node.tagName || '')) continue;
        const text = cleanText(node.textContent || '');
        if (!text) continue;
        const cs = window.getComputedStyle ? getComputedStyle(node) : null;
        if (!cs) continue;
        const weight = String(cs.fontWeight || '');
        const weightNumber = parseInt(weight, 10);
        if (/bold/i.test(weight) || (!Number.isNaN(weightNumber) && weightNumber >= 600)) return true;
        if (/italic/i.test(String(cs.fontStyle || ''))) return true;
        if (/underline/i.test(String(cs.textDecorationLine || cs.textDecoration || ''))) return true;
      }
    } catch (_) {}
    return false;
  }

  function copyMathLikeSelector() {
    return 'mjx-container, math, .MathJax, [class*="MathJax"], [data-mathml], .mq-editable-field, .mq-math-mode, script[type="math/tex"], .gssf-word-math-formula-body, .gssf-word-mathml, .gssf-word-math-body';
  }

  function isInsideCopyMathLike(el) {
    try {
      const selector = copyMathLikeSelector();
      return Boolean(el?.matches?.(selector) || el?.closest?.(selector));
    } catch (_) {
      return false;
    }
  }

  function sourceHasBlockTextChild(source) {
    try {
      const children = Array.from(source?.children || []);
      return children.some((child) => {
        if (!cleanText(child.textContent || '')) return false;
        if (child.querySelector?.('img,svg,video,canvas')) return false;
        const cs = window.getComputedStyle ? getComputedStyle(child) : null;
        const display = String(cs?.display || '');
        return /^(block|list-item|flow-root)$/i.test(display);
      });
    } catch (_) {
      return false;
    }
  }

  function applyWordBlockLayoutFromOriginal(source, clone, cs) {
    if (!source || !clone?.style || !cs) return;
    if (isInsideCopyMathLike(source) || isInsideCopyMathLike(clone)) return;
    if (source.querySelector?.('img,svg,video,canvas')) return;

    const text = cleanText(source.textContent || '');
    if (!text || isCopyUiText(text)) return;

    const sourceTag = String(source.tagName || '').toUpperCase();
    const cloneTag = String(clone.tagName || '').toUpperCase();
    if (/^(IMG|PICTURE|SVG|VIDEO|CANVAS|MATH|MJX-CONTAINER|SCRIPT|STYLE|TABLE|TBODY|THEAD|TR|TD|TH)$/.test(cloneTag)) return;

    const display = String(cs.display || '');
    const isEditableText = source.getAttribute?.('contenteditable') === 'true' || /textbox/i.test(String(source.getAttribute?.('role') || ''));
    const isTextBlock = /^(block|list-item|flow-root)$/i.test(display) || isEditableText || /^(DIV|P|LI|H[1-6])$/.test(sourceTag);
    if (!isTextBlock) return;

    // Evita transformar um contêiner grande inteiro em parágrafo quando os filhos já representam os parágrafos reais.
    // A correção principal mira os elementos do Forms que são visualmente bloco, mas viram SPAN inline no Word.
    if (sourceHasBlockTextChild(source) && !/^(SPAN|P|LI|H[1-6])$/.test(sourceTag)) return;

    clone.style.display = cloneTag === 'LI' ? 'list-item' : 'block';
    clone.style.whiteSpace = clone.style.whiteSpace || 'normal';
    clone.style.lineHeight = clone.style.lineHeight || 'normal';
    if (!clone.style.marginBottom) clone.style.marginBottom = '0';
    if (!clone.style.marginTop) clone.style.marginTop = '0';
    clone.setAttribute('data-gssf-copy-block-layout', '1');
  }

  function applyInlineFormattingFromOriginal(sourceRoot, cloneRoot) {
    if (!sourceRoot || !cloneRoot) return;
    let sourceItems = [];
    let cloneItems = [];
    try {
      sourceItems = [sourceRoot].concat(Array.from(sourceRoot.querySelectorAll?.('*') || []));
      cloneItems = [cloneRoot].concat(Array.from(cloneRoot.querySelectorAll?.('*') || []));
    } catch (_) { return; }
    const max = Math.min(sourceItems.length, cloneItems.length, 1200);
    for (let i = 0; i < max; i += 1) {
      const source = sourceItems[i];
      const clone = cloneItems[i];
      if (!source || !clone || !clone.style) continue;
      if (/^(IMG|PICTURE|SVG|VIDEO|CANVAS)$/i.test(source.tagName || '')) continue;
      try {
        const tag = String(source.tagName || '').toUpperCase();
        const cs = window.getComputedStyle ? getComputedStyle(source) : null;
        const weight = String(cs?.fontWeight || '');
        const weightNumber = parseInt(weight, 10);
        if (/^(B|STRONG)$/.test(tag) || /bold/i.test(weight) || (!Number.isNaN(weightNumber) && weightNumber >= 600)) {
          clone.style.fontWeight = '700';
        }
        if (/^(I|EM)$/.test(tag) || /italic/i.test(String(cs?.fontStyle || ''))) {
          clone.style.fontStyle = 'italic';
        }
        if (/^U$/.test(tag) || /underline/i.test(String(cs?.textDecorationLine || cs?.textDecoration || ''))) {
          clone.style.textDecoration = clone.style.textDecoration || 'underline';
        }
        applyWordBlockLayoutFromOriginal(source, clone, cs);
      } catch (_) {}
    }
  }

  function replaceCopyElementWithFormattedSource(sourceEl, cloneEl, lines) {
    if (!sourceEl || !cloneEl || !copyLinesNeedPreservation(lines)) return false;
    let formatted;
    try {
      formatted = sourceEl.cloneNode(true);
      applyInlineFormattingFromOriginal(sourceEl, formatted);
      applyInlineFormattingFromOriginal(sourceEl, cloneEl);
      formatted.querySelectorAll?.('script,style,noscript,img,svg,video,canvas').forEach((el) => el.remove());
      formatted.removeAttribute?.('contenteditable');
      formatted.removeAttribute?.('role');
      formatted.removeAttribute?.('aria-label');
      sanitizeCopyClone(formatted);
      preserveCopyLineBreaks(formatted);
    } catch (_) {
      return false;
    }
    const comparable = copyTextComparable(formatted.textContent || formatted.innerText || '');
    if (!comparable || comparable.length < 4) return false;
    try {
      while (cloneEl.firstChild) cloneEl.removeChild(cloneEl.firstChild);
      if (formatted.childNodes.length) {
        while (formatted.firstChild) cloneEl.appendChild(formatted.firstChild);
      } else if (cleanText(formatted.textContent || '')) {
        cloneEl.textContent = formatted.textContent;
      } else {
        lines.forEach((line) => cloneEl.appendChild(buildCopyLineElement(line)));
      }
      cloneEl.style.display = 'block';
      cloneEl.style.whiteSpace = 'pre-wrap';
      cloneEl.style.lineHeight = cloneEl.style.lineHeight || 'normal';
      cloneEl.setAttribute('data-gssf-copy-preserved-formatting', '1');
      cloneEl.setAttribute('data-gssf-copy-preserved-lines', '1');
      return true;
    } catch (_) {
      return false;
    }
  }

  function copyRepairFalseWrappedLines(lines) {
    const out = [];
    try {
      (Array.isArray(lines) ? lines : []).forEach((line) => {
        const raw = String(line || '');
        const text = cleanText(raw);
        if (out.length && /^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(cleanText(out[out.length - 1] || '')) && /^[a-zà-öø-ÿ]/.test(text)) {
          out[out.length - 1] = String(out[out.length - 1] || '') + raw.replace(/^\s+/g, '');
          return;
        }
        out.push(raw);
      });
    } catch (_) {
      return Array.isArray(lines) ? lines : [];
    }
    return out;
  }

  function copyMultilineLines(value) {
    const lines = stripCopyUiPhrases(String(value || ''))
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''));
    while (lines.length && !cleanText(lines[0])) lines.shift();
    while (lines.length && !cleanText(lines[lines.length - 1])) lines.pop();
    return copyRepairFalseWrappedLines(lines);
  }

  function copyLinesNeedPreservation(lines) {
    if (!Array.isArray(lines) || lines.length < 2) return false;
    const useful = lines.filter((line) => cleanText(line));
    if (!useful.length) return false;
    if (cleanText(useful.join(' ')).length < 4) return false;
    return true;
  }

  function copyTextComparable(value) {
    return normalizeText(stripCopyUiPhrases(value || '')).replace(/[^a-z0-9]+/g, '');
  }

  function buildCopyLineElement(line) {
    const div = document.createElement('div');
    div.setAttribute('data-gssf-copy-explicit-line', '1');
    div.style.display = 'block';
    div.style.margin = '0';
    div.style.padding = '0';
    div.style.lineHeight = 'normal';
    div.style.whiteSpace = 'pre-wrap';
    if (cleanText(line)) div.textContent = line;
    else {
      div.innerHTML = '<br>';
      div.style.minHeight = '1em';
      div.setAttribute('data-gssf-word-blank-line', '1');
    }
    return div;
  }

  function copyDirectTextOnly(el) {
    if (!el) return '';
    try {
      return Array.from(el.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.nodeValue || '')
        .join('');
    } catch (_) {
      return '';
    }
  }

  function markCopyNodeAsVisualBlock(el, margin = '0') {
    if (!el || !el.style) return;
    try {
      const tag = String(el.tagName || '').toUpperCase();
      if (/^(SCRIPT|STYLE|NOSCRIPT|IMG|PICTURE|SVG|VIDEO|CANVAS|MATH|MJX-CONTAINER)$/.test(tag)) return;
      el.style.display = tag === 'LI' ? 'list-item' : 'block';
      el.style.whiteSpace = el.style.whiteSpace || 'normal';
      el.style.lineHeight = el.style.lineHeight || 'normal';
      if (!el.style.marginTop) el.style.marginTop = '0';
      if (!el.style.marginBottom) el.style.marginBottom = '0';
      el.setAttribute('data-gssf-copy-block-layout', '1');
    } catch (_) {}
  }

  function childLooksLikeStandalonePromptLine(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      const tag = String(el.tagName || '').toUpperCase();
      if (/^(SCRIPT|STYLE|NOSCRIPT|IMG|PICTURE|SVG|VIDEO|CANVAS|MATH|MJX-CONTAINER)$/.test(tag)) return false;
      if (/^(UL|OL|LI|P|DIV|H[1-6]|BR)$/.test(tag)) return true;
      const text = cleanText(el.textContent || '');
      if (!text || isCopyUiText(text)) return false;
      if (!/^(SPAN|B|STRONG|EM|I|U)$/i.test(tag)) return false;
      const inlineDisplay = String(el.style?.display || (window.getComputedStyle ? getComputedStyle(el).display : '') || '');
      if (/^(block|list-item|flow-root)$/i.test(inlineDisplay)) return true;
      if (el.getAttribute?.('data-gssf-copy-block-layout') === '1' || el.getAttribute?.('data-gssf-copy-real-block') === '1') return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function markNestedPromptLineSpans(el) {
    if (!el?.children) return;
    try {
      const directText = cleanText(copyDirectTextOnly(el));
      const children = Array.from(el.children || []).filter(childLooksLikeStandalonePromptLine);
      if (children.length < 2 || directText.length > 2) return;
      children.forEach((child) => {
        markCopyNodeAsVisualBlock(child);
        markNestedPromptLineSpans(child);
      });
    } catch (_) {}
  }

  function copyElementCanContainWordBlocks(el) {
    const tag = String(el?.tagName || '').toUpperCase();
    return /^(DIV|P|LI|UL|OL|ARTICLE|SECTION|TD|TH|BODY)$/i.test(tag);
  }

  function ensureCopyTitleBlockContainer(root) {
    if (!root || copyElementCanContainWordBlocks(root)) return root;
    const tag = String(root.tagName || '').toUpperCase();
    if (!/^(SPAN|B|STRONG|EM|I|U)$/i.test(tag)) return root;
    const parent = root.parentNode;
    if (!parent) return root;
    try {
      const wrapper = document.createElement('div');
      Array.from(root.attributes || []).forEach((attr) => {
        try { wrapper.setAttribute(attr.name, attr.value); } catch (_) {}
      });
      if (/^(B|STRONG)$/i.test(tag)) wrapper.style.fontWeight = wrapper.style.fontWeight || '700';
      if (/^(I|EM)$/i.test(tag)) wrapper.style.fontStyle = wrapper.style.fontStyle || 'italic';
      if (/^U$/i.test(tag)) wrapper.style.textDecoration = wrapper.style.textDecoration || 'underline';
      while (root.firstChild) wrapper.appendChild(root.firstChild);
      parent.replaceChild(wrapper, root);
      return wrapper;
    } catch (_) {
      return root;
    }
  }

  function markCopyRealParagraphBlock(el, marginBottom = '0') {
    if (!el || !el.style) return;
    try {
      const tag = String(el.tagName || '').toUpperCase();
      if (/^(SCRIPT|STYLE|NOSCRIPT|IMG|PICTURE|SVG|VIDEO|CANVAS|MATH|MJX-CONTAINER)$/.test(tag)) return;
      el.style.display = tag === 'LI' ? 'list-item' : 'block';
      el.style.whiteSpace = el.style.whiteSpace || 'normal';
      el.style.lineHeight = el.style.lineHeight || 'normal';
      el.style.marginTop = el.style.marginTop || '0';
      el.style.marginBottom = el.style.marginBottom || '0';
      el.setAttribute('data-gssf-copy-block-layout', '1');
      el.setAttribute('data-gssf-copy-real-block', '1');
    } catch (_) {}
  }

  function copyTitleBlockIsSemanticStandalone(el) {
    try {
      const tag = String(el?.tagName || '').toUpperCase();
      if (/^(UL|OL|TABLE|THEAD|TBODY|TR|TD|TH|IMG|PICTURE|SVG|VIDEO|CANVAS|MATH|MJX-CONTAINER)$/i.test(tag)) return true;
      if (el?.matches?.('.gssf-word-math-formula-row,.gssf-word-math-formula-body,.gssf-word-mathml,.gssf-word-math-body')) return true;
    } catch (_) {}
    return false;
  }