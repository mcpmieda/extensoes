

  function optionTextField(option) {
    if (!option) return null;
    const candidates = [];
    if (option.matches?.('input, textarea, [contenteditable="true"], [role="textbox"]')) candidates.push(option);
    candidates.push(...Array.from(option.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]')));
    return candidates.filter((field) => isOptionTextField(field, option)).sort((a, b) => {
      const al = optionFieldScore(a), bl = optionFieldScore(b);
      if (bl !== al) return bl - al;
      return cleanText(optionCurrentText(b) || textOf(b)).length - cleanText(optionCurrentText(a) || textOf(a)).length;
    })[0] || null;
  }

  function editableTextLike(el) {
    if (!el || !visible(el)) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable || el.getAttribute?.('role') === 'textbox';
  }

  function blockedOptionFieldLabel(field) {
    return normalizeText(`${field?.getAttribute?.('aria-label') || ''} ${field?.getAttribute?.('placeholder') || ''} ${field?.getAttribute?.('data-automation-id') || ''} ${field?.getAttribute?.('title') || ''}`);
  }

  function isBlockedOptionField(field) {
    const label = blockedOptionFieldLabel(field);
    if (/titulo da pergunta|título da pergunta|question title|descricao da pergunta|descrição da pergunta|question subtitle|pontos|points|feedback|comentario|comentário|search|pesquisar/.test(label)) return true;
    if (field.closest?.('#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker')) return true;
    return false;
  }

  function optionFieldScore(field) {
    const label = blockedOptionFieldLabel(field);
    let score = 1;
    if (label.includes('texto da opcao de escolha') || label.includes('texto da opção de escolha')) score += 8;
    if (label.includes('opcao') || label.includes('opção') || label.includes('option') || label.includes('choice')) score += 6;
    if (field.closest?.('[data-automation-id="questionChoiceOptionContainer"]')) score += 5;
    if (field.closest?.('[role="radiogroup"]')) score += 3;
    if (field.closest?.('[role="listitem"]')) score += 2;
    const tx = cleanText(optionCurrentText(field) || textOf(field));
    if (tx) score += Math.min(3, Math.ceil(tx.length / 16));
    return score;
  }

  function isOptionTextField(field, optionContext = null) {
    if (!editableTextLike(field) || isBlockedOptionField(field)) return false;
    const label = blockedOptionFieldLabel(field);
    if (label.includes('opcao') || label.includes('opção') || label.includes('option') || label.includes('choice')) return true;
    const optionContainer = field.closest?.('[data-automation-id="questionChoiceOptionContainer"]');
    if (optionContainer && (!optionContext || optionContext.contains?.(field) || optionContainer === optionContext || optionContainer.contains(optionContext))) return true;
    const listItem = field.closest?.('[role="listitem"]');
    if (listItem && listItem.closest?.('[role="radiogroup"]')) return true;
    if (optionContext && optionContext.contains?.(field)) return true;
    return Boolean(field.closest?.('[role="radiogroup"]') && field.getBoundingClientRect().width >= 20);
  }

  function optionCurrentText(field) {
    if (!field) return '';
    if ('value' in field) return cleanText(field.value);
    const text = cleanText(field.textContent || field.innerText || '');
    if (text) return text;
    return cleanText(field.getAttribute?.('aria-label') || '');
  }

  function optionTextFieldsInBlock(block) {
    if (!block) return [];
    const fields = Array.from(block.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')).filter((field) => isOptionTextField(field));
    return uniqueElements(fields).sort(byTop);
  }

  function optionCountForBlock(block) {
    if (!block) return 0;
    const group = block.querySelector('[role="radiogroup"]') || block;
    return findOptionContainers(group).length || optionTextFieldsInBlock(block).length;
  }

  function expandToOptionQuestionBlock(block, number) {
    let cur = block;
    let best = block;
    for (let i = 0; i < 10 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
      if (!visible(cur)) continue;
      const sameQuestion = questionNumberFromBlock(cur) === number || blockStartsWithQuestionNumber(cur, number);
      if (!sameQuestion) continue;
      if (optionCountForBlock(cur)) return cur;
      best = cur;
    }
    return best;
  }

  function questionBlockCandidates(number) {
    const direct = collectQuestionBlocks();
    const wrappers = all('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"], [role="group"]');
    return uniqueElements([...direct, ...wrappers])
      .filter((block) => questionNumberFromBlock(block) === number || blockStartsWithQuestionNumber(block, number))
      .map((block) => expandToOptionQuestionBlock(block, number))
      .filter(Boolean)
      .sort((a, b) => {
      const ao = optionCountForBlock(a), bo = optionCountForBlock(b);
      const ap = ao >= 2 && ao <= 12 ? 0 : 1;
      const bp = bo >= 2 && bo <= 12 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (ao !== bo) return ao - bo;
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
  }

  async function findQuestionBlockByNumber(number) {
    let found = questionBlockCandidates(number)[0];
    if (found && optionCountForBlock(found)) return found;
    const scroller = formsScroller();
    const viewport = Math.max(520, window.innerHeight || 760);
    const height = Math.max(scroller?.scrollHeight || 0, document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
    const maxY = Math.max(0, height - viewport);
    const step = Math.max(360, Math.round(viewport * 0.72));
    const positions = [];
    const addPosition = (value) => {
      const y = Math.max(0, Math.min(maxY, Math.round(value)));
      if (!positions.some((existing) => Math.abs(existing - y) < 32)) positions.push(y);
    };
    const knownMax = Math.max(
      Number(document.querySelector('#gssf-kpis .gssf-kpi:nth-child(1) b')?.textContent || 0),
      ...(APP.lastAudit?.questions || []).map((q) => Number(q.number || 0)).filter(Boolean),
      number
    );
    if (knownMax > 1) {
      const estimated = maxY * ((number - 1) / Math.max(1, knownMax - 1));
      [estimated, estimated - step, estimated + step, estimated - step * 2, estimated + step * 2].forEach(addPosition);
    }
    if (number <= 3) addPosition(0);
    if (knownMax - number <= 2) addPosition(maxY);
    for (let y = 0; y <= maxY && positions.length < 36; y += step * 2) addPosition(y);
    if (!positions.length || positions[positions.length - 1] !== maxY) addPosition(maxY);
    for (const y of positions) {
      if (scroller && scroller !== document.documentElement && scroller !== document.body) scroller.scrollTop = y;
      window.scrollTo(0, y);
      await sleep(y === 0 || y === maxY ? 360 : 210);
      found = questionBlockCandidates(number)[0];
      if (found && optionCountForBlock(found)) return found;
      if (found) return found;
    }
    return null;
  }

  function optionTextFieldsForQuestion(number, knownBlock) {
    const pool = [];
    let cur = knownBlock;
    for (let i = 0; i < 10 && cur && cur !== document.body; i += 1, cur = cur.parentElement) pool.push(cur);
    pool.push(...all('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"], [role="group"]'));
    const candidates = uniqueElements(pool).filter((block) => questionNumberFromBlock(block) === number || blockStartsWithQuestionNumber(block, number)).sort((a, b) => {
      const af = optionTextFieldsInBlock(a).length, bf = optionTextFieldsInBlock(b).length;
      const ap = af >= 2 && af <= 12 ? 0 : 1;
      const bp = bf >= 2 && bf <= 12 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (af !== bf) return af - bf;
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    return optionTextFieldsInBlock(candidates[0]);
  }

  function visibleOptionTextFieldsForQuestion(number) {
    return Array.from(document.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')).filter((field) => {
      if (!isOptionTextField(field)) return false;
      const closestCard = field.closest?.('[data-automation-id="questionDesignerCard"], [data-automation-id="questionWrapper"], [data-automation-id="questionContent"]');
      if (closestCard) {
        const aria = normalizeText(closestCard.getAttribute?.('aria-label') || '');
        if (aria.includes(`pergunta ${number}`) || aria.includes(`questao ${number}`) || aria.includes(`questão ${number}`)) return true;
        if (questionNumberFromBlock(closestCard) === number || blockStartsWithQuestionNumber(closestCard, number)) return true;
      }
      let cur = field;
      for (let i = 0; i < 12 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
        const auto = cur.getAttribute?.('data-automation-id') || '';
        if (!/questionDesignerCard|questionWrapper|questionContent/i.test(auto)) continue;
        const aria = normalizeText(cur.getAttribute?.('aria-label') || '');
        if (aria.includes(`pergunta ${number}`) || aria.includes(`questao ${number}`) || aria.includes(`questão ${number}`)) return true;
        if (questionNumberFromBlock(cur) === number || blockStartsWithQuestionNumber(cur, number)) return true;
      }
      return false;
    }).sort(byTop);
  }

  async function editableFieldForOption(option) {
    if (!option) return null;
    let field = optionTextField(option);
    if (field) return field;
    try { fireRealClick(option); } catch (_) {
      try { option.click(); } catch (__) {}
    }
    await sleep(180);
    const active = document.activeElement;
    if (active && active !== document.body && editableTextLike(active) && !isBlockedOptionField(active)) {
      if (option.contains?.(active)) return active;
      try {
        const ar = active.getBoundingClientRect();
        const or = option.getBoundingClientRect();
        const nearVertically = ar.top >= or.top - 80 && ar.top <= or.bottom + 220;
        const nearHorizontally = ar.left >= or.left - 80 && ar.left <= or.right + 260;
        if (nearVertically && nearHorizontally) return active;
      } catch (_) {}
    }
    field = optionTextField(option);
    if (field) return field;
    return Array.from(option.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')).filter(visible)[0] || null;
  }

