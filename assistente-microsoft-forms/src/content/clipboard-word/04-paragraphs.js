

  function copyCollectTitleLeafBlocks(root) {
    const blocks = [];
    const walk = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      if (el !== root && isCopyBlankLineElement(el)) {
        blocks.push(el);
        return;
      }
      if (copyTitleBlockIsSemanticStandalone(el)) {
        blocks.push(el);
        return;
      }
      const text = cleanText(el.textContent || '');
      const nested = Array.from(el.children || []).filter((child) => {
        if (isCopyBlankLineElement(child)) return true;
        if (copyTitleBlockIsSemanticStandalone(child)) return true;
        if (child.getAttribute?.('data-gssf-copy-real-block') === '1' || child.getAttribute?.('data-gssf-copy-block-layout') === '1') return Boolean(cleanText(child.textContent || '') || copyTitleBlockIsSemanticStandalone(child));
        return false;
      });
      if (el !== root && (el.getAttribute?.('data-gssf-copy-real-block') === '1' || el.getAttribute?.('data-gssf-copy-block-layout') === '1') && text && !nested.length) {
        blocks.push(el);
        return;
      }
      if (!nested.length && el !== root && text) {
        blocks.push(el);
        return;
      }
      (nested.length ? nested : Array.from(el.children || [])).forEach(walk);
    };
    try { walk(root); } catch (_) {}
    return blocks.filter((block, index, arr) => {
      if (!block) return false;
      if (!cleanText(block.textContent || '') && !copyTitleBlockIsSemanticStandalone(block) && !isCopyBlankLineElement(block)) return false;
      return arr.findIndex((other) => other === block) === index;
    });
  }

  function copyTitleTextStartsQuote(text) { return /^[\s"'“”‘’«]/.test(String(text || '')); }

  function copyTitleTextStartsPunctuation(text) { return /^[\s,.;:!?)]/.test(String(text || '')); }

  function copyTitleTextStartsLowercase(text) { return /^[a-zà-öø-ÿ]/.test(String(text || '').trim()); }

  function copyTitleTextEndsTerminal(text) { return /[.!?][\s"'”’)]*$/.test(String(text || '').trim()); }

  function copyTitleTextEndsColon(text) { return /:[\s"'”’)]*$/.test(String(text || '').trim()); }

  function copyTitleTextIsHeadingLike(text) {
    const raw = String(text || '').trim();
    const letters = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/g, '');
    if (letters.length < 4) return false;
    if (/[a-zà-öø-ÿ]/.test(letters)) return false;
    return raw.length <= 80;
  }

  function copyTitleTextIsConnector(text) {
    const n = normalizeText(text || '').replace(/\s+/g, ' ').trim();
    return /^(,|;|:|\.|e|ou)$/.test(n);
  }

  function copyTitleBlockMostlyFormatted(el) {
    try {
      const text = cleanText(el?.textContent || '');
      if (!text) return false;
      const ownStyle = String(el?.getAttribute?.('style') || '');
      const hasFmt = /(?:font-weight|font-style|text-decoration)\s*:/i.test(ownStyle)
        || Boolean(el?.querySelector?.('b,strong,em,i,u,[style*="font-weight" i],[style*="font-style" i],[style*="text-decoration" i]'))
        || /^(B|STRONG|EM|I|U)$/i.test(String(el?.tagName || ''));
      if (!hasFmt) return false;
      const direct = cleanText(copyDirectTextOnly(el));
      if (direct && direct.length > Math.max(2, Math.floor(text.length * 0.35))) return false;
      return text.length <= 220;
    } catch (_) { return false; }
  }

  function copyTitleBlockHasExplicitLine(el) {
    try {
      return el?.getAttribute?.('data-gssf-copy-explicit-line') === '1'
        || Boolean(el?.querySelector?.('[data-gssf-copy-explicit-line="1"]'));
    } catch (_) {
      return false;
    }
  }

  function copyShouldMergeTitleBlocks(prev, next, forceInlineRoot) {
    if (!prev || !next) return false;
    if (copyTitleBlockIsSemanticStandalone(prev) || copyTitleBlockIsSemanticStandalone(next)) return false;
    if (copyTitleBlockHasExplicitLine(prev) || copyTitleBlockHasExplicitLine(next)) return false;
    const a = cleanText(prev.textContent || '');
    const b = cleanText(next.textContent || '');
    if (!a || !b) return false;
    if (forceInlineRoot) return true;
    if (/^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(a) && copyTitleTextStartsLowercase(b)) return true;
    if (copyTitleTextStartsPunctuation(b)) return true;
    if (copyTitleTextIsConnector(b)) return true;
    if (copyTitleTextIsConnector(a)) return true;
    if (copyTitleTextIsHeadingLike(a)) return false;
    if (copyTitleTextEndsColon(a)) return false;
    if (!copyTitleTextEndsTerminal(a) && !copyTitleTextEndsColon(a) && (copyTitleTextStartsQuote(b) || copyTitleBlockMostlyFormatted(next))) return true;
    return false;
  }

  function copyStripBlockDataAttrs(el) {
    try {
      Array.from(el?.attributes || []).forEach((attr) => {
        if (/^data-gssf-copy-(real-block|block-layout|title-blocks|inline-merge)$/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    } catch (_) {}
  }

  function copyAppendInlineNode(target, node) {
    if (!target || !node) return;
    try {
      if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(node.nodeValue || '')); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = String(node.tagName || '').toUpperCase();
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(tag)) return;
      if (/^(DIV|P|ARTICLE|SECTION)$/i.test(tag) && !copyTitleBlockIsSemanticStandalone(node)) {
        Array.from(node.childNodes || []).forEach((child) => copyAppendInlineNode(target, child));
        return;
      }
      const clone = node.cloneNode(false);
      copyStripBlockDataAttrs(clone);
      try {
        if (clone.style && !/^(UL|OL|LI|IMG|PICTURE|SVG|VIDEO|CANVAS|MATH|MJX-CONTAINER)$/i.test(tag)) {
          if (/^(SPAN|B|STRONG|EM|I|U)$/i.test(tag)) clone.style.display = 'inline';
          clone.style.marginTop = '0';
          clone.style.marginBottom = '0';
          clone.style.lineHeight = 'normal';
          clone.style.whiteSpace = clone.style.whiteSpace || 'normal';
        }
      } catch (_) {}
      Array.from(node.childNodes || []).forEach((child) => copyAppendInlineNode(clone, child));
      target.appendChild(clone);
    } catch (_) {}
  }

  function copyAppendBlockInlineToParagraph(target, block) {
    if (!target || !block) return;
    try {
      const text = cleanText(block.textContent || '');
      if (!text && !copyTitleBlockIsSemanticStandalone(block)) return;
      const existing = cleanText(target.textContent || '');
      const noSpaceBefore = copyTitleTextStartsPunctuation(text) || (/^[a-zà-öø-ÿ]/.test(text) && /^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(existing));
      if (existing && !/\s$/.test(target.textContent || '') && !noSpaceBefore) target.appendChild(document.createTextNode(' '));
      copyAppendInlineNode(target, block);
    } catch (_) {}
  }

  function copyBuildTitleParagraphFromGroup(group) {
    const div = document.createElement('div');
    div.className = 'gssf-word-title-line';
    markCopyRealParagraphBlock(div);
    try { div.style.marginTop = '0'; div.style.marginBottom = '0'; div.style.lineHeight = 'normal'; } catch (_) {}
    const blank = (group || []).length === 1 && (isCopyBlankLineElement(group[0]) || group[0]?.getAttribute?.('data-gssf-word-blank-line') === '1');
    if (blank) {
      div.appendChild(document.createElement('br'));
      div.setAttribute('data-gssf-word-blank-line', '1');
    } else {
      (group || []).forEach((block) => copyAppendBlockInlineToParagraph(div, block));
    }
    return div;
  }

  function normalizeQuestionTitleBlocksSmart(container) {
    if (!container?.querySelectorAll) return;
    let roots = [];
    try { roots = Array.from(container.querySelectorAll('[data-gssf-copy-title-blocks]')); } catch (_) { return; }
    roots.forEach((root) => {
      try {
        if (root.closest?.('[data-automation-id="questionChoiceOptionContainer"],[role="radio"],[role="radiogroup"],.gssf-word-math-formula-row')) return;
        const blocks = copyCollectTitleLeafBlocks(root);
        if (blocks.length < 2) return;
        const originalComparable = copyTextComparable(root.textContent || '');
        const blockComparable = copyTextComparable(blocks.map((b) => b.textContent || '').join(' '));
        if (originalComparable && blockComparable && originalComparable !== blockComparable && !originalComparable.includes(blockComparable) && !blockComparable.includes(originalComparable)) return;
        const forceInlineRoot = root.getAttribute?.('data-gssf-copy-inline-merge') === '1';
        const groups = [];
        let current = [blocks[0]];
        for (let i = 0; i < blocks.length - 1; i += 1) {
          const prev = blocks[i];
          const next = blocks[i + 1];
          if (copyShouldMergeTitleBlocks(prev, next, forceInlineRoot)) current.push(next);
          else { groups.push(current); current = [next]; }
        }
        groups.push(current);
        const needsRewrite = forceInlineRoot
          || groups.some((group) => group.length > 1)
          || blocks.some((block) => copyTitleBlockHasExplicitLine(block) || block.parentElement !== root || block.querySelector?.('[data-gssf-copy-real-block],[data-gssf-copy-block-layout]'));
        if (!needsRewrite) return;
        while (root.firstChild) root.removeChild(root.firstChild);
        groups.forEach((group) => {
          if (group.length === 1 && copyTitleBlockIsSemanticStandalone(group[0])) {
            const clone = group[0].cloneNode(true);
            try { clone.style.marginTop = '0'; clone.style.marginBottom = '0'; clone.style.lineHeight = 'normal'; } catch (_) {}
            root.appendChild(clone);
          } else {
            root.appendChild(copyBuildTitleParagraphFromGroup(group));
          }
        });
        root.setAttribute('data-gssf-copy-title-blocks', String(groups.length));
        root.removeAttribute('data-gssf-copy-inline-merge');
      } catch (_) {}
    });
  }

  function preserveQuestionTitleVisualBlocks(container) {
    if (!container?.querySelectorAll) return;
    let titles = [];
    try {
      titles = Array.from(container.querySelectorAll('[data-automation-id="questionTitle"], [data-gssf-copy-preserved-lines="1"]'));
    } catch (_) { return; }
    titles.forEach((title) => {
      try {
        if (title.closest?.('[data-automation-id="questionChoiceOptionContainer"],[role="radio"],[role="radiogroup"],.gssf-word-math-formula-row')) return;
        const roots = Array.from(title.querySelectorAll?.('.text-format-content') || []);
        if (!roots.length && title.matches?.('.text-format-content')) roots.push(title);
        if (!roots.length) roots.push(title);
        roots.forEach((root) => {
          if (!root || root.closest?.('[data-automation-id="questionChoiceOptionContainer"],[role="radio"],[role="radiogroup"],.gssf-word-math-formula-row')) return;
          let realRoot = ensureCopyTitleBlockContainer(root);
          const children = Array.from(realRoot.childNodes || []).filter(childLooksLikeStandalonePromptLine);
          if (children.length >= 2) {
            children.forEach((child) => {
              markCopyNodeAsVisualBlock(child);
              markNestedPromptLineSpans(child);
            });
            try { realRoot.setAttribute('data-gssf-copy-title-blocks', String(children.length)); } catch (_) {}
          } else {
            markNestedPromptLineSpans(realRoot);
            // Fragmentos inline (negrito, itálico, sublinhado) pertencem à mesma
            // linha. Marcamos apenas elementos de bloco já existentes; nunca
            // embrulhamos nós inline em parágrafos artificiais.
            const structuralBlocks = Array.from(realRoot.querySelectorAll?.('div,p,li') || []).filter((block) => {
              if (block.closest?.('[data-automation-id="questionChoiceOptionContainer"],[role="radio"],[role="radiogroup"]')) return false;
              return Boolean(cleanText(block.textContent || '') || isCopyBlankLineElement(block));
            });
            if (structuralBlocks.length >= 2) {
              structuralBlocks.forEach((block) => markCopyRealParagraphBlock(block));
              try { realRoot.setAttribute('data-gssf-copy-title-blocks', String(structuralBlocks.length)); } catch (_) {}
            }
          }
        });
      } catch (_) {}
    });
    normalizeQuestionTitleBlocksSmart(container);
  }

  function replaceCopyElementWithLines(el, lines) {
    if (!el || !copyLinesNeedPreservation(lines)) return false;
    try {
      while (el.firstChild) el.removeChild(el.firstChild);
      lines.forEach((line) => el.appendChild(buildCopyLineElement(line)));
      el.style.display = 'block';
      el.style.whiteSpace = 'normal';
      el.style.lineHeight = el.style.lineHeight || 'normal';
      el.setAttribute('data-gssf-copy-preserved-lines', '1');
      return true;
    } catch (_) {
      return false;
    }
  }

  function copyTextBreakCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const selector = [
      '[contenteditable="true"]',
      '[role="textbox"]',
      'textarea',
      '[aria-label*="Título da pergunta" i]',
      '[aria-label*="Titulo da pergunta" i]',
      '[aria-label*="Question title" i]',
      '[aria-label*="Question text" i]',
      '[data-automation-id*="questionTitle" i]',
      '[data-automation-id*="richText" i]'
    ].join(',');
    let items = [];
    try { items = uniqueElements(Array.from(root.querySelectorAll(selector))); }
    catch (_) { return []; }
    return items.filter((el) => {
      if (!el || el.querySelector?.('img,svg,video,canvas')) return false;
      const text = el.value || el.innerText || el.textContent || '';
      if (!cleanText(text)) return false;
      if (isCopyUiText(text)) return false;
      return true;
    });
  }

  function preserveCopyTextBreaksFromOriginal(sourceBlock, clonedBlock) {
    if (!sourceBlock || !clonedBlock) return;
    const sourceCandidates = copyTextBreakCandidates(sourceBlock);
    const cloneCandidates = copyTextBreakCandidates(clonedBlock);
    const max = Math.min(sourceCandidates.length, cloneCandidates.length);
    for (let i = 0; i < max; i += 1) {
      const sourceEl = sourceCandidates[i];
      const cloneEl = cloneCandidates[i];
      if (!cloneEl || !clonedBlock.contains(cloneEl)) continue;
      const sourceText = sourceEl?.value || sourceEl?.innerText || sourceEl?.textContent || '';
      const lines = copyMultilineLines(sourceText);
      if (!copyLinesNeedPreservation(lines)) continue;
      const sourceComparable = copyTextComparable(lines.join(' '));
      const cloneComparable = copyTextComparable(cloneEl?.textContent || cloneEl?.innerText || '');
      if (sourceComparable && cloneComparable && !sourceComparable.includes(cloneComparable) && !cloneComparable.includes(sourceComparable)) continue;
      if ((copyElementLooksFormatted(sourceEl) || copyElementLooksFormatted(cloneEl)) && replaceCopyElementWithFormattedSource(sourceEl, cloneEl, lines)) continue;
      replaceCopyElementWithLines(cloneEl, lines);
    }
  }