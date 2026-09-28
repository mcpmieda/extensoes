

  function unwrapCopyElement(el) {
    const parent = el?.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  function isCopyBlankLineElement(el) {
    if (!el || !/^(DIV|P|LI)$/i.test(el.tagName || '')) return false;
    if (cleanText(el.textContent || '')) return false;
    if (el.querySelector?.('img,svg,video,canvas')) return false;
    return Boolean(el.querySelector?.('br') || /<br\b/i.test(el.innerHTML || ''));
  }

  function preserveCopyBlankLineElement(el) {
    if (!el) return;
    try {
      el.innerHTML = '<br>';
      el.style.whiteSpace = 'pre-wrap';
      el.style.minHeight = el.style.minHeight || '1em';
      el.style.lineHeight = el.style.lineHeight || 'normal';
    } catch (_) {}
  }

  function preserveCopyLineBreaks(container) {
    if (!container) return;
    container.querySelectorAll('div,p,li,span,[contenteditable="true"],[role="textbox"]').forEach((el) => {
      if (isCopyBlankLineElement(el)) {
        preserveCopyBlankLineElement(el);
        return;
      }
      const text = el.textContent || '';
      if (/\n/.test(text)) {
        try { el.style.whiteSpace = 'pre-wrap'; } catch (_) {}
      }
    });
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const value = String(node.nodeValue || '');
      if (!/\n/.test(value)) return;
      const parent = node.parentNode;
      if (!parent) return;
      const fragment = document.createDocumentFragment();
      const parts = value.replace(/\r\n?/g, '\n').split('\n');
      parts.forEach((part, index) => {
        if (index) fragment.appendChild(document.createElement('br'));
        if (part) fragment.appendChild(document.createTextNode(part));
      });
      parent.replaceChild(fragment, node);
    });
  }

  function copyCanonicalWithMap(value) {
    const source = String(value || '').replace(/\u00a0/g, ' ');
    let canonical = '';
    const map = [];
    let lastSpace = false;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      const decomposed = ch.normalize ? ch.normalize('NFD') : ch;
      for (let j = 0; j < decomposed.length; j += 1) {
        const part = decomposed[j];
        if (/[\u0300-\u036f]/.test(part)) continue;
        if (/\s/.test(part)) {
          if (!lastSpace) {
            canonical += ' ';
            map.push(i);
            lastSpace = true;
          }
          continue;
        }
        canonical += part.toLowerCase();
        map.push(i);
        lastSpace = false;
      }
    }
    return { canonical: canonical.trim(), map, rawCanonical: canonical, rawMap: map };
  }

  function questionAriaLabelForLineBreaks(sourceBlock) {
    const labels = [];
    const add = (value) => {
      const text = String(value || '');
      if (text && /\n/.test(text) && /(t[íi]tulo\s+da\s+pergunta|question\s+title|question\s+text)/i.test(text)) labels.push(text);
    };
    try { add(sourceBlock?.getAttribute?.('aria-label') || ''); } catch (_) {}
    try {
      Array.from(sourceBlock?.querySelectorAll?.('[aria-label]') || []).slice(0, 80).forEach((el) => add(el.getAttribute?.('aria-label') || ''));
    } catch (_) {}
    return labels.sort((a, b) => b.length - a.length)[0] || '';
  }

  function questionAriaPromptLinesForCopy(sourceBlock) {
    let label = questionAriaLabelForLineBreaks(sourceBlock);
    if (!label) return [];
    label = String(label || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/^\s*\d+\s*[.)]?\s*/i, '')
      .replace(/^\s*(t[íi]tulo\s+da\s+pergunta|question\s+title|question\s+text)\s*/i, '')
      .replace(/\b(Op[cç][aã]o\s+[úu]nica|V[áa]rias\s+respostas?)\b.*$/i, '')
      .trim();
    if (!label || !/\n/.test(label)) return [];
    const raw = label.split('\n').map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''));
    const lines = [];
    let blankRun = 0;
    raw.forEach((line) => {
      const cleaned = stripCopyUiPhrases(line).trim();
      if (!cleanText(cleaned)) {
        blankRun += 1;
        if (lines.length && blankRun <= 1) lines.push('');
        return;
      }
      blankRun = 0;
      lines.push(cleaned);
    });
    while (lines.length && !cleanText(lines[0])) lines.shift();
    while (lines.length && !cleanText(lines[lines.length - 1])) lines.pop();
    return copyRepairFalseWrappedLines(lines);
  }

  function copyNodeInsideOptionsOrMath(node, root) {
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !root?.contains?.(el)) return true;
    try {
      const option = el.closest?.('[data-automation-id="questionChoiceOptionContainer"],[role="radiogroup"],[role="radio"],input[type="radio"],input[type="checkbox"],.gssf-word-math-formula-row,.gssf-word-math-formula-body,.gssf-word-mathml,.gssf-word-math-body');
      if (option && root.contains(option)) return true;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION)$/i.test(el.tagName || '')) return true;
      if (el.closest?.('#gssf-root')) return true;
    } catch (_) { return true; }
    return false;
  }

  function copyPromptTextNodeInfos(root) {
    const infos = [];
    if (!root) return infos;
    let cursor = 0;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (copyNodeInsideOptionsOrMath(node, root)) return NodeFilter.FILTER_REJECT;
          const value = String(node.nodeValue || '');
          if (!value) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const value = String(node.nodeValue || '');
        infos.push({ node, start: cursor, end: cursor + value.length, value });
        cursor += value.length;
      }
    } catch (_) {}
    return infos;
  }

  function copyBreakCountsForAriaLines(lines) {
    const result = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!cleanText(lines[i])) continue;
      let j = i + 1;
      let blanks = 0;
      while (j < lines.length && !cleanText(lines[j])) { blanks += 1; j += 1; }
      if (j < lines.length) result.push({ line: lines[i], brs: Math.min(3, 1 + blanks) });
    }
    return result;
  }

  function insertCopyBreaksAtTextPosition(infos, absolutePos, brs) {
    if (!infos?.length || !brs) return false;
    let target = null;
    for (const info of infos) {
      if (absolutePos > info.start && absolutePos <= info.end) { target = info; break; }
      if (absolutePos === info.start && info.start === info.end) { target = info; break; }
    }
    if (!target) return false;
    const node = target.node;
    const parent = node?.parentNode;
    if (!parent) return false;
    const offset = Math.max(0, Math.min(String(node.nodeValue || '').length, absolutePos - target.start));
    try {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < brs; i += 1) frag.appendChild(document.createElement('br'));
      if (offset <= 0) parent.insertBefore(frag, node);
      else if (offset >= String(node.nodeValue || '').length) parent.insertBefore(frag, node.nextSibling);
      else {
        const after = node.splitText(offset);
        parent.insertBefore(frag, after);
      }
      let p = parent.nodeType === Node.ELEMENT_NODE ? parent : parent.parentElement;
      for (let guard = 0; p && guard < 4; guard += 1, p = p.parentElement) {
        if (p.style && !copyNodeInsideOptionsOrMath(p, infos[0]?.node?.ownerDocument?.body || p)) {
          p.style.whiteSpace = p.style.whiteSpace || 'normal';
          p.style.lineHeight = p.style.lineHeight || 'normal';
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyAriaLineBreaksToQuestionClone(sourceBlock, clonedBlock) {
    if (!sourceBlock || !clonedBlock) return false;
    const lines = questionAriaPromptLinesForCopy(sourceBlock);
    if (!copyLinesNeedPreservation(lines)) return false;
    const breakItems = copyBreakCountsForAriaLines(lines);
    if (!breakItems.length) return false;
    const infos = copyPromptTextNodeInfos(clonedBlock);
    if (!infos.length) return false;
    const promptText = infos.map((info) => info.value).join('');
    const mapped = copyCanonicalWithMap(promptText);
    if (!mapped.rawCanonical || mapped.rawCanonical.length < 8) return false;
    const inserts = [];
    let cursor = 0;
    let found = 0;
    for (const item of breakItems) {
      const needle = copyCanonicalWithMap(item.line).canonical;
      if (!needle || needle.length < 2) continue;
      let pos = mapped.rawCanonical.indexOf(needle, cursor);
      if (pos < 0) pos = mapped.rawCanonical.indexOf(needle);
      if (pos < 0) continue;
      const endCanon = pos + needle.length - 1;
      const endOriginal = (mapped.rawMap[endCanon] ?? -1) + 1;
      if (endOriginal > 0) inserts.push({ pos: endOriginal, brs: item.brs });
      cursor = endCanon + 1;
      found += 1;
    }
    if (found < 1 || !inserts.length) return false;
    const merged = new Map();
    inserts.forEach((item) => merged.set(item.pos, Math.max(merged.get(item.pos) || 0, item.brs)));
    const ordered = Array.from(merged.entries()).map(([pos, brs]) => ({ pos, brs })).sort((a, b) => b.pos - a.pos);
    let applied = 0;
    ordered.forEach((item) => {
      if (insertCopyBreaksAtTextPosition(infos, item.pos, item.brs)) applied += 1;
    });
    if (applied) {
      try {
        clonedBlock.setAttribute('data-gssf-copy-aria-linebreaks', String(applied));
        clonedBlock.style.whiteSpace = clonedBlock.style.whiteSpace || 'normal';
      } catch (_) {}
      return true;
    }
    return false;
  }