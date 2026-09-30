

  function getQuestionBlocksFromList() {
    const sections = new Set(getSectionBlocks());
    return getQuestionListChildren().filter((child) => {
      if (sections.has(child) || isLikelySectionBlock(child)) return false;
      const n = questionNumberFromBlock(child);
      const hasOptions = hasOptionSignals(child);
      const hasQuestionHint = /question|pergunta|office-form-question|choice/.test(nodeHint(child));
      const r = child.getBoundingClientRect();
      return (n > 0 || hasOptions || hasQuestionHint) && r.width > 260 && r.height > 45;
    }).sort(byTop);
  }

  function blocksByQuestionWrappers() {
    const selectors = [
      '[data-automation-id="questionWrapper"]',
      '[aria-label*="Título da pergunta" i]',
      '[aria-label*="Titulo da pergunta" i]',
      '[aria-label*="Question title" i]'
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(','))).filter((el) => {
      if (!visible(el) || el.closest('#gssf-root')) return false;
      if (isLikelySectionBlock(el)) return false;
      const r = el.getBoundingClientRect();
      const hint = nodeHint(el);
      const hasOptions = hasOptionSignals(el);
      const hasImage = Array.from(el.querySelectorAll('img')).some(meaningfulImage);
      return r.width > 260 && r.height > 45 && (questionNumberFromBlock(el) > 0 || hasOptions || hasImage || /question|pergunta/.test(hint));
    });
    return uniqueElements(candidates).sort(byTop);
  }

  function findQuestionBlockFromRadioGroup(rg) {
    let current = rg;
    let best = null;
    for (let i = 0; i < 12 && current && current !== document.body; i += 1, current = current.parentElement) {
      if (!visible(current)) continue;
      const tx = textOf(current);
      const radioCount = current.querySelectorAll('[role="radio"], input[type="radio"]').length;
      const groupCount = current.querySelectorAll('[role="radiogroup"]').length;
      const r = current.getBoundingClientRect();
      if (radioCount >= 2 && radioCount <= 12 && groupCount <= 3 && tx.length > 12 && r.width > 240) best = current;
      if (/question|office-form-question|choice/i.test(nodeHint(current)) && best) return current;
    }
    return best || rg.parentElement || rg;
  }

  function blocksByRadioGroups() {
    return uniqueElements(Array.from(document.querySelectorAll('[role="radiogroup"]')).filter(visible).map(findQuestionBlockFromRadioGroup)).sort(byTop);
  }

  function findQuestionBlockAroundNumberNode(el) {
    let cur = el;
    let best = null;
    for (let i = 0; i < 14 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
      if (!visible(cur)) continue;
      const r = cur.getBoundingClientRect();
      const tx = textOf(cur);
      const hasOptions = cur.querySelectorAll('[role="radio"], input[type="radio"]').length;
      const imgs = cur.querySelectorAll('img').length;
      const hint = nodeHint(cur);
      const looks = r.width > 260 && r.height > 50 && tx.length > 8;
      if (hasOptions >= 2 || imgs > 0 || looks) best = cur;
      if (/question|office-form-question|choice/i.test(hint) && looks) return cur;
    }
    return best;
  }

  function blocksByNumbers() {
    const root = document.querySelector('#question-list,[data-automation-id="formRoot"],main,[role="main"]') || document;
    const candidates = Array.from(root.querySelectorAll('[aria-label],button,span,div')).slice(0, 1200);
    const nums = candidates.map((el) => {
      if (isIgnoredAppNode(el)) return null;
      const t = textOf(el);
      if (!/^\d{1,3}$/.test(t)) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return { el, n: parseInt(t, 10), top: r.top + scrollY };
    }).filter(Boolean).sort((a, b) => a.top - b.top);
    const map = new Map();
    for (const item of nums) if (!map.has(item.n)) map.set(item.n, item);
    const blocks = [];
    let i = 1;
    while (map.has(i)) {
      const block = findQuestionBlockAroundNumberNode(map.get(i).el);
      if (block) blocks.push(block);
      i += 1;
    }
    return uniqueElements(blocks).sort(byTop);
  }

  function uniqueElements(elements) {
    const out = [];
    const seen = new Set();
    for (const el of elements) {
      if (!el || seen.has(el) || el.closest?.('#gssf-root')) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function collectQuestionBlocks() {
    let blocks = uniqueElements(getQuestionBlocksFromList());
    if (!blocks.length) blocks = uniqueElements(blocksByQuestionWrappers());
    if (!blocks.length) blocks = uniqueElements(blocksByRadioGroups());
    if (!blocks.length) blocks = uniqueElements(blocksByNumbers());
    if (!blocks.length) { APP.scrollQuestionBlocks = []; return []; }

    const byNumber = new Map();
    blocks.forEach((block) => { const n = questionNumberFromBlock(block); if (n > 0 && !byNumber.has(n)) byNumber.set(n, block); });
    const numbers = [...byNumber.keys()];
    if (!numbers.length) { APP.scrollQuestionBlocks = []; return blocks.sort(byTop); }

    const sequence = [];
    const max = Math.max(...numbers);
    for (let i = 1; i <= max; i += 1) {
      const block = byNumber.get(i);
      if (block) sequence.push(block); else break;
    }
    const result = (sequence.length ? sequence : blocks).sort(byTop);
    APP.scrollQuestionBlocks = result.map((block) => ({ block, number: questionNumberFromBlock(block) }));
    return result;
  }
