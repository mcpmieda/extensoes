  // ===== 10-forms-dom.js =====
// Fonte modular: forms dom.
  function exactLabel(label) {
    const target = normalizeText(label);
    return all('*').filter((el) => normalizeText(textOf(el)) === target || normalizeText(el.getAttribute?.('aria-label')) === target);
  }

  async function waitFor(fn, timeout = GSSF_TIMING.waitForMs) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = fn();
      if (result && (!Array.isArray(result) || result.length)) return result;
      await sleep(90);
    }
    return [];
  }

  function getQuestionListChildren() {
    const ql = document.querySelector('#question-list');
    const source = ql
      ? Array.from(ql.children)
      : uniqueElements(Array.from(document.querySelectorAll('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"]'))
        .map((el) => el.closest?.('[data-automation-id="questionWrapper"]') || el.parentElement || el));
    return source.filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 260 && r.height > 35 && textOf(el).length > 1;
    }).sort(byTop);
  }

  function byTop(a, b) {
    return (a.getBoundingClientRect().top + scrollY) - (b.getBoundingClientRect().top + scrollY);
  }

  function closestQuestionListChild(el) {
    const ql = document.querySelector('#question-list');
    if (!ql || !el) return null;
    let cur = el;
    while (cur && cur !== document.body && cur !== ql) {
      if (cur.parentElement === ql) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function nodeHint(el) {
    return normalizeText([
      el?.tagName,
      el?.id,
      el?.className,
      el?.getAttribute?.('role'),
      el?.getAttribute?.('data-automation-id'),
      el?.getAttribute?.('data-testid'),
      el?.getAttribute?.('aria-label')
    ].filter(Boolean).join(' '));
  }

  function questionNumberFromBlock(block) {
    if (!block) return 0;
    const selfLabel = cleanText(block.getAttribute?.('aria-label') || '');
    const selfHint = cleanText(`${selfLabel} ${block.className || ''} ${block.id || ''} ${block.getAttribute?.('data-automation-id') || ''}`);

    // V11-MAPA3: primeiro tenta o número oficial do wrapper/card do Forms.
    // Isso corrige casos em que o enunciado começa com outro número, por exemplo:
    // "45 3. Relacione...". Antes a leitura podia pegar o "3" interno e parar o mapa em 44.
    const wrapperMatch = selfHint.match(/(?:^|\b)(?:questionwrapper|question\s*wrapper)\s*(\d{1,3})\s*[.\-–—:)]/i)
      || selfLabel.match(/^\s*(\d{1,3})\s*[.\-–—:)]?\s*(?:t[ií]tulo da pergunta|titulo da pergunta|question title|pergunta)\b/i);
    if (wrapperMatch) return parseInt(wrapperMatch[1], 10);

    const selfMatch = selfLabel.match(/(?:quest[aã]o|pergunta|q)\s*\.?\s*(\d{1,3})\b/i);
    if (selfMatch) return parseInt(selfMatch[1], 10);
    const candidates = Array.from(block.querySelectorAll('[aria-label], [class*="number"], [class*="question"], span, div')).filter(visible).slice(0, 120);
    for (const el of candidates) {
      const label = cleanText(el.getAttribute?.('aria-label') || '');
      const t = cleanText(el.textContent || label);
      const m = t.match(/(?:quest[aã]o|pergunta|q)\s*\.?\s*(\d{1,3})\b/i) || t.match(/^\s*(\d{1,3})\s*[.\-)]?\s*$/);
      if (m) return parseInt(m[1], 10);
    }
    const whole = textOf(block);
    const m = whole.match(/^\s*(\d{1,3})\s+/) || whole.match(/(?:quest[aã]o|pergunta|q)\s*\.?\s*(\d{1,3})\b/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function blockStartsWithQuestionNumber(block, number) {
    const t = cleanText(textOf(block));
    return new RegExp(`^${number}\\s*[.\\-)]?(\\s|$)`).test(t);
  }

  function hasOptionSignals(el) {
    if (!el) return false;
    if (el.querySelector('[role="radiogroup"], [role="radio"], input[type="radio"], [data-automation-id="questionChoiceOptionContainer"]')) return true;
    return Array.from(el.querySelectorAll('[role="listitem"]')).some((item) => {
      if (!visible(item)) return false;
      return Array.from(item.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')).some((field) => {
        const label = normalizeText(`${field.getAttribute?.('aria-label') || ''} ${textOf(field)}`);
        return label.includes('opcao') || label.includes('opção') || label.includes('option');
      });
    });
  }

  function looksLikeSectionText(text) {
    const t = normalizeText(text);
    if (!t) return false;
    if (t === 'nova secao' || t === 'remover secao' || t === 'apenas secao' || t === 'somente secao') return false;
    if (t === 'section' || t === 'secao' || /^secao\s+\d{1,3}$/.test(t)) return true;
    if (/^secao\s+sem\s+titulo/.test(t)) return true;
    return false;
  }

  function isLikelySectionBlock(el) {
    if (!el || !visible(el)) return false;
    const hint = nodeHint(el);
    if (/menu|dialog|callout|flyout|tooltip/.test(hint)) return false;
    if (hasOptionSignals(el)) return false;
    const text = normalizeText(textOf(el));
    const aria = normalizeText(el.getAttribute?.('aria-label') || '');
    const aid = normalizeText(el.getAttribute?.('data-automation-id') || '');
    if (/^\d{1,3}\.\s*secao\b/.test(aria)) return true;
    if (/^secao\s+\d{1,3}\b/.test(text)) return true;
    if ((text === 'secao' || text.startsWith('secao ')) && /questiondesignercard|questionwrapper/.test(hint)) return true;
    if (/sectiontitle/.test(aid) || /titulo da secao/.test(aria)) return true;
    return false;
  }

  function findLooseSectionBlock(el) {
    let cur = el;
    let best = null;
    for (let i = 0; i < 12 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
      if (!visible(cur)) continue;
      const r = cur.getBoundingClientRect();
      const tx = textOf(cur);
      const hint = nodeHint(cur);
      if (/menu|dialog|callout|flyout|tooltip/.test(hint)) continue;
      if (r.width > 260 && r.height > 35 && r.height < 760 && tx.length > 0 && tx.length < 1200 && isLikelySectionBlock(cur)) best = cur;
      if (best && /questionwrapper|questiondesignercard|sectiontitle/.test(hint)) return best;
    }
    return best;
  }

  function getSectionBlocks() {
    const now = Date.now();
    const cache = APP.sectionBlocksCache || { value: null, at: 0 };
    if (!APP.busy && cache.value && now - cache.at < 500) return cache.value.slice();
    const set = new Set();
    Array.from(document.querySelectorAll('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"]')).forEach((el) => {
      const block = el.closest?.('[data-automation-id="questionWrapper"]') || findLooseSectionBlock(el) || el;
      if (isLikelySectionBlock(block) && !block.closest('#gssf-root')) set.add(block);
    });
    const labelCandidates = all('*').filter((el) => looksLikeSectionText(textOf(el)) || looksLikeSectionText(el.getAttribute?.('aria-label')));
    for (const label of labelCandidates) {
      const block = closestQuestionListChild(label) || findLooseSectionBlock(label);
      if (block && isLikelySectionBlock(block) && !block.closest('#gssf-root')) set.add(block);
    }

    for (const child of getQuestionListChildren()) {
      if (isLikelySectionBlock(child)) { set.add(child); continue; }
      const tx = normalizeText(textOf(child));
      const hasOptions = hasOptionSignals(child);
      const hint = nodeHint(child);
      const headText = normalizeText(Array.from(child.querySelectorAll('*')).filter(visible).slice(0, 8).map(textOf).join(' '));
      if (!hasOptions && (/\bsecao\b/.test(headText) || /\bsection\b/.test(hint) || /^secao\b/.test(tx))) set.add(child);
    }
    // O Forms expõe o mesmo cabeçalho de seção em mais de um nó acessível
    // (questionWrapper + sectionTitle). Manter ambos infla o contador e faz a
    // rotina de remoção tentar processar a mesma seção mais de uma vez.
    const sectionPriority = (el) => {
      const hint = nodeHint(el);
      if (el.getAttribute?.('data-automation-id') === 'questionWrapper' || /questionwrapper/.test(hint)) return 30;
      if (el.getAttribute?.('data-automation-id') === 'questionDesignerCard' || /questiondesignercard/.test(hint)) return 20;
      if (/sectiontitle/.test(hint)) return 5;
      return 10;
    };
    const sameSectionRect = (a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return Math.abs(ra.top - rb.top) <= 3
        && Math.abs(ra.left - rb.left) <= 3
        && Math.abs(ra.width - rb.width) <= 3
        && Math.abs(ra.height - rb.height) <= 3;
    };
    const ranked = Array.from(set).filter(visible).sort((a, b) => {
      const priority = sectionPriority(b) - sectionPriority(a);
      if (priority) return priority;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    });
    const unique = [];
    for (const candidate of ranked) {
      const duplicate = unique.some((kept) => kept.contains(candidate)
        || candidate.contains(kept)
        || sameSectionRect(kept, candidate));
      if (!duplicate) unique.push(candidate);
    }
    const result = unique.sort(byTop);
    if (!APP.busy) APP.sectionBlocksCache = { value: result, at: now };
    return result;
  }

  function sectionTitleFromBlock(block, index = 0) {
    if (!block) return `Seção ${index + 1}`;
    const trimKnownSubtitle = (text) => {
      const value = cleanText(text);
      const subtitleIndex = value.search(/\s+(linguagens\s*,|linguagens e suas\b|c[oó]digos e suas\b|ci[eê]ncias humanas\b|ci[eê]ncias da natureza\b|matem[aá]tica e suas\b|suas tecnologias\b)/i);
      if (subtitleIndex > 2) return value.slice(0, subtitleIndex).trim();
      const upperLead = value.match(/^([A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s]{2,}?)(?=\s+[A-ZÀ-Ý]?[a-zà-ÿ])/);
      return upperLead ? upperLead[1].trim() : value;
    };
    const cleanTitleLine = (text) => trimKnownSubtitle(cleanText(text)
      .replace(/^(se[cç][aã]o|section)\s*\d{0,3}\s*[:.\-–—]?\s*/i, '')
      .replace(/\b(adicionar|duplicar|remover|mover|mais op[cç][oõ]es)\b.*$/i, '')
      .trim());
    const firstUsefulLine = (text) => String(text || '')
      .replace(/\u00a0/g, ' ')
      .split(/[\r\n]+/)
      .map(cleanTitleLine)
      .find((line) => line && !looksLikeSectionText(line) && normalizeText(line) !== 'sem titulo' && !/^(descri[cç][aã]o|subt[ií]tulo)$/i.test(line));
    const candidates = [];
    Array.from(block.querySelectorAll('[role="heading"], h1, h2, h3, [aria-label*="título da seção" i], [aria-label*="titulo da secao" i], [aria-label*="section title" i], [contenteditable="true"], [role="textbox"]'))
      .forEach((el) => {
        candidates.push(el.getAttribute?.('aria-label') || '');
        candidates.push(el.innerText || el.textContent || '');
      });
    candidates.push(block.innerText || block.textContent || '');
    const found = candidates.map(firstUsefulLine).find(Boolean);
    return (found || `Seção ${index + 1}`).slice(0, 44);
  }

  function buildSectionContext(sectionBlocks) {
    return (sectionBlocks || []).map((block, index) => ({
      index,
      title: sectionTitleFromBlock(block, index),
      top: block.getBoundingClientRect().top + scrollY
    })).sort((a, b) => a.top - b.top);
  }

  function sectionForBlock(block, sections) {
    if (!block || !sections?.length) return null;
    const top = block.getBoundingClientRect().top + scrollY;
    let current = null;
    for (const section of sections) {
      if (section.top <= top + 6) current = section;
      else break;
    }
    return current;
  }