

  function wordMathArtifacts(root) {
    if (!root?.querySelectorAll) return [];
    try {
      return Array.from(root.querySelectorAll('mjx-container, math, .MathJax, [class*="MathJax"], [data-mathml], .mq-editable-field, .mq-math-mode, script[type="math/tex"]'));
    } catch (_) {
      return [];
    }
  }

  function wordMathExportText(root) {
    if (!root) return '';
    const parts = [];
    const add = (value) => { if (value) parts.push(String(value)); };
    try {
      add(root.getAttribute?.('aria-label') || '');
      add(root.getAttribute?.('data-mathml') || '');
      add(root.getAttribute?.('alttext') || '');
      root.querySelectorAll?.('[aria-label],[data-mathml],[alttext]').forEach((el) => {
        add(el.getAttribute?.('aria-label') || '');
        add(el.getAttribute?.('data-mathml') || '');
        add(el.getAttribute?.('alttext') || '');
      });
    } catch (_) {}
    add(root.textContent || '');
    return cleanText(asciiMathLetters(parts.join(' ')).replace(/[\u200b\u200c\u200d\u200e\u200f\ufeff]/g, ' '));
  }

  function wordOptionStartsWithExpectedLetter(option, mathEl, optIndex) {
    const expected = letter(optIndex);
    if (!expected) return false;
    const samples = [wordMathExportText(mathEl), wordMathExportText(option), option?.innerText || option?.textContent || ''];
    return samples.some((sample) => {
      const compact = cleanText(asciiMathLetters(sample || '')).replace(/\s+/g, '');
      if (compact.length < 2) return false;
      if (String(compact[0] || '').toUpperCase() !== expected) return false;
      const next = String(Array.from(compact)[1] || '');
      return /[A-Za-z0-9+\-−=(){}\[\]\/\\]/.test(next) || next.charCodeAt(0) > 127;
    });
  }

  function decodeWordMathHtmlEntities(value) {
    const raw = String(value || '');
    if (!raw) return '';
    try {
      if (!/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/i.test(raw)) return raw;
      const box = document.createElement('textarea');
      box.innerHTML = raw;
      return box.value || raw;
    } catch (_) {
      return raw
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, '&');
    }
  }

  function firstWordMathmlString(mathEl) {
    if (!mathEl) return '';
    const candidates = [];
    try {
      if (String(mathEl.localName || mathEl.tagName || '').toLowerCase() === 'math') {
        candidates.push(new XMLSerializer().serializeToString(mathEl));
      }
      candidates.push(mathEl.getAttribute?.('data-mathml') || '');
      candidates.push(mathEl.getAttribute?.('alttext') || '');
      mathEl.querySelectorAll?.('math,[data-mathml],[alttext]').forEach((el) => {
        if (String(el.localName || el.tagName || '').toLowerCase() === 'math') {
          try { candidates.push(new XMLSerializer().serializeToString(el)); } catch (_) {}
        }
        candidates.push(el.getAttribute?.('data-mathml') || '');
        candidates.push(el.getAttribute?.('alttext') || '');
      });
    } catch (_) {}
    return candidates.map(decodeWordMathHtmlEntities).find((value) => /<\s*math[\s>]/i.test(value || '')) || '';
  }

  function parseWordMathmlDocument(mathml) {
    const raw = decodeWordMathHtmlEntities(mathml || '').trim();
    if (!raw || !/<\s*math[\s>]/i.test(raw)) return null;
    try {
      const doc = new DOMParser().parseFromString(raw, 'application/xml');
      if (doc.querySelector?.('parsererror')) return null;
      let math = doc.documentElement;
      if (!math || String(math.localName || '').toLowerCase() !== 'math') math = doc.querySelector?.('math');
      return math ? { doc, math } : null;
    } catch (_) {
      return null;
    }
  }

  function tokenTextStartsWithExpectedWordLetter(text, expectedLetter) {
    const wanted = String(expectedLetter || '').toUpperCase();
    const chars = Array.from(String(text || ''));
    let firstIndex = -1;
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      if (/^[\s\u00a0\u200b-\u200f\ufeff]$/.test(ch)) continue;
      firstIndex = i;
      break;
    }
    if (firstIndex < 0) return null;
    const first = asciiMathLetters(chars[firstIndex] || '').toUpperCase();
    if (first !== wanted) return null;
    return { chars, firstIndex };
  }

  function removeExpectedLetterFromMathml(mathEl, expectedLetter) {
    if (!mathEl || !expectedLetter) return false;
    const tokenNames = new Set(['mi', 'mn', 'mo', 'mtext']);
    try {
      const walker = mathEl.ownerDocument.createTreeWalker(mathEl, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const name = String(node.localName || node.tagName || '').toLowerCase();
        if (!tokenNames.has(name)) continue;
        const raw = String(node.textContent || '');
        if (!raw || !cleanText(raw)) continue;
        const match = tokenTextStartsWithExpectedWordLetter(raw, expectedLetter);
        if (!match) return false;
        match.chars.splice(match.firstIndex, 1);
        const nextText = match.chars.join('');
        if (cleanText(nextText)) node.textContent = nextText;
        else node.parentNode?.removeChild(node);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function serializeWordMathmlElement(mathEl) {
    try {
      if (!mathEl.getAttribute?.('xmlns')) mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      return new XMLSerializer().serializeToString(mathEl);
    } catch (_) {
      return '';
    }
  }

  function updateMathmlAttributesRemovingWordLetter(mathEl, expectedLetter) {
    if (!mathEl || !expectedLetter) return false;
    let changed = false;
    const targets = [];
    try {
      targets.push(mathEl);
      mathEl.querySelectorAll?.('[data-mathml]').forEach((el) => targets.push(el));
    } catch (_) {}
    targets.forEach((el) => {
      const attr = el.getAttribute?.('data-mathml') || '';
      if (!attr) return;
      const parsed = parseWordMathmlDocument(attr);
      if (!parsed) return;
      if (!removeExpectedLetterFromMathml(parsed.math, expectedLetter)) return;
      const next = serializeWordMathmlElement(parsed.math);
      if (next) {
        try { el.setAttribute('data-mathml', next); changed = true; } catch (_) {}
      }
    });
    return changed;
  }

  function stripVisibleExpectedWordMathLetter(mathEl, expectedLetter) {
    if (!mathEl || !expectedLetter) return false;
    const wanted = String(expectedLetter || '').toUpperCase();
    let changed = false;
    try {
      const tokenEls = Array.from(mathEl.querySelectorAll?.('.mi,.mn,.mo,.mtext,mi,mn,mo,mtext') || []);
      for (const el of tokenEls) {
        const raw = String(el.textContent || '');
        if (!raw || !cleanText(raw)) continue;
        const match = tokenTextStartsWithExpectedWordLetter(raw, wanted);
        if (!match) return false;
        match.chars.splice(match.firstIndex, 1);
        const next = match.chars.join('');
        if (cleanText(next)) el.textContent = next;
        else el.remove();
        changed = true;
        break;
      }
      if (!changed) {
        const walker = document.createTreeWalker(mathEl, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const raw = String(node.nodeValue || '');
          if (!raw || !cleanText(raw)) continue;
          const match = tokenTextStartsWithExpectedWordLetter(raw, wanted);
          if (!match) return false;
          match.chars.splice(match.firstIndex, 1);
          node.nodeValue = match.chars.join('');
          changed = true;
          break;
        }
      }
      ['aria-label', 'alttext'].forEach((attr) => {
        const value = mathEl.getAttribute?.(attr) || '';
        const match = tokenTextStartsWithExpectedWordLetter(value, wanted);
        if (match) {
          match.chars.splice(match.firstIndex, 1);
          try { mathEl.setAttribute(attr, cleanText(match.chars.join(''))); } catch (_) {}
        }
      });
    } catch (_) {}
    return changed;
  }

  function buildWordMathFormulaNode(mathEl, expectedLetter) {
    const mathml = firstWordMathmlString(mathEl);
    if (mathml) {
      const parsed = parseWordMathmlDocument(mathml);
      if (parsed && removeExpectedLetterFromMathml(parsed.math, expectedLetter)) {
        const mathNode = document.importNode(parsed.math, true);
        try {
          mathNode.classList?.add('gssf-word-mathml');
          mathNode.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
          mathNode.style.display = 'inline-block';
          mathNode.style.textAlign = 'left';
          mathNode.style.verticalAlign = 'middle';
          mathNode.style.margin = '0';
        } catch (_) {}
        return { node: mathNode, source: 'mathml' };
      }
    }
    try {
      const clone = mathEl.cloneNode(true);
      const attrChanged = updateMathmlAttributesRemovingWordLetter(clone, expectedLetter);
      const visibleChanged = stripVisibleExpectedWordMathLetter(clone, expectedLetter);
      if (attrChanged || visibleChanged) {
        clone.classList?.add('gssf-word-math-body');
        clone.style.textAlign = 'left';
        clone.style.marginLeft = '0';
        clone.style.marginRight = '0';
        clone.style.display = clone.style.display || 'inline-block';
        return { node: clone, source: 'clone' };
      }
    } catch (_) {}
    return null;
  }

  function optionContainersForWordMathQuestion(questionClone) {
    if (!questionClone?.querySelectorAll) return [];
    let options = [];
    try {
      options = Array.from(questionClone.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]'));
      if (!options.length) options = Array.from(questionClone.querySelectorAll('[role="radio"]'));
    } catch (_) { options = []; }
    return uniqueElements(options).filter((option) => option && questionClone.contains(option) && wordMathArtifacts(option).length);
  }

  async function normalizeMathAlternativesForWordFormulas(root, progressId = 'copy') {
    if (!root?.querySelectorAll) return { changed: 0, failed: 0 };
    const questionScopes = Array.from(root.querySelectorAll('.gssf-copy-question,[data-gssf-copy-question-index]'));
    let changed = 0;
    let failed = 0;
    for (let qi = 0; qi < questionScopes.length; qi += 1) {
      const scope = questionScopes[qi];
      const options = optionContainersForWordMathQuestion(scope);
      if (!options.length) continue;
      for (let oi = 0; oi < Math.min(options.length, 26); oi += 1) {
        const option = options[oi];
        if (!option || option.hasAttribute?.('data-gssf-word-math-formula')) continue;
        const mathEls = wordMathArtifacts(option).filter((el) => !el.closest?.('.gssf-word-math-formula-row'));
        if (!mathEls.length) continue;
        const mathEl = mathEls[0];
        const expected = letter(oi);
        const hasExpectedPrefix = wordOptionStartsWithExpectedLetter(option, mathEl, oi);
        if (!hasExpectedPrefix) {
          try {
            option.style.textAlign = 'left';
            mathEls.forEach((el) => {
              el.style.textAlign = 'left';
              el.style.marginLeft = '0';
              el.style.marginRight = '0';
            });
          } catch (_) {}
          continue;
        }
        setProgress(progressId, 55, `Preparando alternativas matemáticas... Q${qi + 1} ${expected}`);
        try {
          const formula = buildWordMathFormulaNode(mathEl, expected);
          if (!formula?.node) throw new Error('Não consegui reconstruir fórmula sem a letra da alternativa.');
          const row = document.createElement('p');
          row.className = 'gssf-word-math-formula-row';
          row.style.cssText = 'margin:0;text-align:left!important;white-space:normal;line-height:normal;page-break-inside:avoid;';

          const letterSpan = document.createElement('span');
          letterSpan.className = 'gssf-word-option-letter';
          letterSpan.textContent = expected + '  ';
          letterSpan.style.cssText = 'display:inline-block;min-width:18pt;font-family:Arial,Segoe UI,sans-serif;font-style:normal!important;font-weight:normal!important;text-align:left;vertical-align:middle;';

          const formulaSpan = document.createElement('span');
          formulaSpan.className = 'gssf-word-math-formula-body';
          formulaSpan.style.cssText = 'display:inline-block;text-align:left!important;vertical-align:middle;margin:0;padding:0;';
          formulaSpan.appendChild(formula.node);

          row.appendChild(letterSpan);
          row.appendChild(formulaSpan);
          while (option.firstChild) option.removeChild(option.firstChild);
          option.appendChild(row);
          option.style.textAlign = 'left';
          option.setAttribute('data-gssf-word-math-formula', formula.source || '1');
          changed += 1;
        } catch (error) {
          failed += 1;
          console.warn('Não consegui separar alternativa matemática como fórmula no Word:', error);
        }
      }
    }
    return { changed, failed };
  }