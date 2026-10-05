

  function currentVisibleQuestionNumber() {
    // A coleta é atualizada pela análise; a rolagem só consulta geometria.
    const blocks = APP.scrollQuestionBlocks || [];
    if (!blocks.length) return 0;
    const viewTop = 0;
    const viewBottom = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const targetY = Math.round(viewBottom * 0.42);
    let best = null;
    let bestScore = Infinity;
    for (const { block, number: n } of blocks) {
      if (!block.isConnected) continue;
      if (!n) continue;
      const r = block.getBoundingClientRect();
      if (r.bottom < viewTop + 40 || r.top > viewBottom - 40) continue;
      const center = r.top + Math.min(r.height, viewBottom) / 2;
      const score = Math.abs(center - targetY);
      if (score < bestScore) { best = n; bestScore = score; }
    }
    return best || 0;
  }

  function paintActiveLetterMapNumber(number) {
    const box = document.getElementById('gssf-letter-map');
    if (!box) return;
    const active = Number(number || 0);
    APP.letterMapActiveNumber = active;
    box.querySelectorAll('.gssf-letter-dot.current').forEach((el) => el.classList.remove('current'));
    if (active) box.querySelector(`.gssf-letter-dot[data-q="${String(active)}"]`)?.classList.add('current');
  }

  function clearLetterMapTrailAnimation() {
    try {
      (APP.letterMapTrailTimers || []).forEach((timer) => clearTimeout(timer));
      APP.letterMapTrailTimers = [];
      document.querySelectorAll('#gssf-letter-map .gssf-letter-dot.travel').forEach((el) => el.classList.remove('travel'));
    } catch (_) {}
  }

  function animateLetterMapTrail(toNumber, fromNumber = APP.letterMapActiveNumber) {
    const box = document.getElementById('gssf-letter-map');
    const to = Number(toNumber || 0);
    if (!box || !to) return;
    const buttons = Array.from(box.querySelectorAll('.gssf-letter-dot[data-q]'));
    if (!buttons.length) return;
    const numbers = buttons.map((btn) => Number(btn.dataset.q || 0)).filter(Boolean).sort((a, b) => a - b);
    if (!numbers.includes(to)) return;
    const from = numbers.includes(Number(fromNumber || 0)) ? Number(fromNumber || 0) : to;
    if (from === to) return;
    clearLetterMapTrailAnimation();
    const ascending = to > from;
    const path = numbers.filter((n) => ascending ? (n > from && n <= to) : (n < from && n >= to)).sort((a, b) => ascending ? a - b : b - a);
    const delay = Math.max(18, Math.min(42, Math.round(620 / Math.max(1, path.length))));
    path.forEach((n, index) => {
      const timer = setTimeout(() => {
        const dot = box.querySelector(`.gssf-letter-dot[data-q="${String(n)}"]`);
        if (!dot) return;
        dot.classList.remove('travel');
        void dot.offsetWidth;
        dot.classList.add('travel');
        const cleanup = setTimeout(() => dot.classList.remove('travel'), 360);
        APP.letterMapTrailTimers.push(cleanup);
      }, index * delay);
      APP.letterMapTrailTimers.push(timer);
    });
  }

  function forceActiveLetterMapNumber(number, ms = 1400) {
    const active = Number(number || 0);
    if (!active) return;
    APP.letterMapForcedNumber = active;
    APP.letterMapForcedUntil = Date.now() + Math.max(250, Number(ms || 0));
    paintActiveLetterMapNumber(active);
  }

  function updateActiveLetterMapNow() {
    const box = document.getElementById('gssf-letter-map');
    if (!box) return;
    const forced = APP.letterMapForcedNumber && Date.now() < APP.letterMapForcedUntil ? Number(APP.letterMapForcedNumber) : 0;
    if (!forced && APP.letterMapForcedNumber) {
      APP.letterMapForcedNumber = 0;
      APP.letterMapForcedUntil = 0;
    }
    const number = forced || currentVisibleQuestionNumber();
    if (!number && !APP.letterMapActiveNumber) return;
    paintActiveLetterMapNumber(number || 0);
  }

  function scheduleActiveLetterMapUpdate() {
    if (document.hidden || APP.busy || document.getElementById('gssf-root')?.classList.contains('hidden')) return;
    if (APP.letterMapScrollTimer) return;
    APP.letterMapScrollTimer = requestAnimationFrame(() => {
      APP.letterMapScrollTimer = null;
      updateActiveLetterMapNow();
    });
  }

  function bindIssueJumpButtons() {
    document.querySelectorAll('#gssf-inline-issues .gssf-pending-number[data-q]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => jumpToQuestion(Number(btn.dataset.q || 0)));
    });
  }

  function officialQuestionNumberFromLabel(value) {
    const text = cleanText(value || '');
    const normalized = normalizeText(text);
    if (!normalized) return 0;
    if (/\b(titulo da secao|section title|section heading|descricao da secao|secao de descricao|section description)\b/.test(normalized)) return 0;
    const titlePattern = '(titulo da pergunta|question title|question heading|question text|pergunta titulo)';
    if (new RegExp(titlePattern).test(normalized)) {
      const m = normalized.match(new RegExp('(?:^|\\bquestionwrapper\\s*)(\\d{1,3})\\s*[\\.\\):\\-–—]?\\s*(?=(?:' + titlePattern + ')\\b)'));
      if (m) return parseInt(m[1], 10);
    }
    if (/\b(questionnumber|question number|numero da pergunta|pergunta numero|numberbadge|number badge|questionindex|question index|question ordinal)\b/.test(normalized)) {
      const m = normalized.match(/(?:questao|pergunta|question|q)\s*\.?\s*(\d{1,3})\b/i) || normalized.match(/\b(\d{1,3})\b/);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  }

  function explicitQuestionNumberFromLabel(value) {
    return officialQuestionNumberFromLabel(value);
  }

  function isPromptOrOptionTextNode(el) {
    if (!el?.closest) return false;
    const directTextHost = el.closest('[role="textbox"], [contenteditable="true"], textarea, input');
    if (directTextHost) return true;
    const host = el.closest('[aria-label], [data-automation-id], [class], [role="listitem"], [role="radio"], [role="radiogroup"]');
    const hint = normalizeText(`${host?.getAttribute?.('aria-label') || ''} ${host?.getAttribute?.('data-automation-id') || ''} ${host?.className || ''} ${host?.getAttribute?.('role') || ''}`);
    return /titulo da pergunta|título da pergunta|question title|descricao da pergunta|descrição da pergunta|question subtitle|opcao|opção|option|alternativa|resposta|answer|choice|radio|math|formula|editor|textbox/.test(hint);
  }

  function isNumberPrefixInsideLongText(el, number, block = null) {
    const value = String(number || '').trim();
    if (!value || !el) return false;
    const prefixPattern = new RegExp(`^${escapeRegExp(value)}\\s*[.)\\-–—:]\\s+\\S`, 'u');
    const loosePromptPattern = new RegExp(`^${escapeRegExp(value)}\\s+\\S.{18,}`, 'u');
    let cur = el;
    for (let i = 0; i < 5 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
      if (block && cur !== block && !block.contains?.(cur)) break;
      const tx = cleanText(textOf(cur));
      if (tx.length > value.length + 3 && prefixPattern.test(tx)) return true;
      const hint = nodeHint(cur);
      if (tx.length > 28 && loosePromptPattern.test(tx) && /textbox|title|subtitle|description|editor|content/.test(hint)) return true;
      if (cur === block) break;
    }
    return false;
  }

  function hasOfficialNumberContext(el, number) {
    if (!el) return false;
    const wanted = Number(number || 0);
    let cur = el;
    for (let i = 0; i < 5 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
      const label = cleanText(`${cur.getAttribute?.('aria-label') || ''} ${cur.getAttribute?.('title') || ''}`);
      if (explicitQuestionNumberFromLabel(label) === wanted) return true;
      const hint = normalizeText(`${cur.id || ''} ${cur.className || ''} ${cur.getAttribute?.('data-automation-id') || ''} ${cur.getAttribute?.('data-testid') || ''} ${cur.getAttribute?.('role') || ''}`);
      if (/question\s*number|questionnumber|pergunta\s*numero|pergunta\s*n[uú]mero|numero\s*da\s*pergunta|n[uú]mero\s*da\s*pergunta|question\s*index|questionindex|question\s*ordinal|ordinal|counter|badge|numberbadge|index/.test(hint)) return true;
      if (/textbox|title|subtitle|description|editor|choice|option|answer|radio/.test(hint)) return false;
    }
    return false;
  }

  function looksLikeQuestionNumberBadge(el, number, block = null) {
    if (!el || !visible(el)) return false;
    const value = String(number || '').trim();
    if (!value) return false;
    const label = cleanText(el.getAttribute?.('aria-label') || '');
    const text = cleanText(el.textContent || label);
    if (text !== value) return false;
    if (el.closest?.('[role="radiogroup"], [role="radio"], input[type="radio"], [data-automation-id="questionChoiceOptionContainer"]')) return false;
    if (isPromptOrOptionTextNode(el)) return false;
    if (isNumberPrefixInsideLongText(el, value, block)) return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.width > 84 || r.height > 84) return false;
      if (block) {
        const br = block.getBoundingClientRect();
        const dx = r.left - br.left;
        const dy = r.top - br.top;
        if (dx < -8 || dy < -8 || dx > Math.min(135, Math.max(82, br.width * 0.22)) || dy > 125) return false;
      }
    } catch (_) { return false; }
    if (!hasOfficialNumberContext(el, value)) return false;
    return true;
  }

  function findJumpTarget(number) {
    const targetNumber = Number(number || 0);
    if (!targetNumber) return null;

    // V11: mapa seguro. Não usa mais texto livre começando com número,
    // pois isso podia fazer uma questão como Q3 apontar para um enunciado
    // interno de outra questão. A lógica de inserir letras não usa esta função.
    const blocks = collectQuestionBlocks();
    const direct = blocks.find((block) => questionNumberFromBlock(block) === targetNumber);
    if (direct) return direct;

    // Último recurso: aceitar apenas selo compacto de número com contexto oficial.
    const candidates = all('*').filter((el) => looksLikeQuestionNumberBadge(el, targetNumber));
    const possible = [];
    for (const node of candidates) {
      let cur = node;
      for (let i = 0; i < 12 && cur && cur !== document.body; i += 1, cur = cur.parentElement) {
        if (!visible(cur)) continue;
        const r = cur.getBoundingClientRect();
        const radios = cur.querySelectorAll('[role="radio"], input[type="radio"]').length;
        const groups = cur.querySelectorAll('[role="radiogroup"]').length;
        const txt = normalizeText(textOf(cur).slice(0, 260));
        if (r.width > 240 && r.height > 70 && (radios >= 2 || groups >= 1 || hasOptionSignals(cur)) && !/^secao\s+\d/.test(txt) && questionNumberFromBlock(cur) === targetNumber) {
          possible.push(cur);
        }
      }
    }
    if (possible.length) {
      return uniqueElements(possible).sort((a, b) => {
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        return (ar.height - br.height) || (ar.width - br.width);
      })[0];
    }
    return null;
  }

  function clearQuestionMapHighlight() {
    try {
      document.querySelectorAll('.gssf-question-highlight,[data-gssf-focus-label],[data-gssf-map-jump-seq]').forEach((el) => {
        el.classList?.remove?.('gssf-question-highlight');
        el.removeAttribute?.('data-gssf-focus-label');
        el.removeAttribute?.('data-gssf-map-jump-seq');
      });
    } catch (_) {}
    clearTimeout(APP.mapJumpHighlightTimer);
  }

  function showQuestionFocusMarker(target, number, seq = 0) {
    clearTimeout(showQuestionFocusMarker.t);
    try {
      document.querySelectorAll('[data-gssf-focus-label]').forEach((el) => {
        if (el !== target) el.removeAttribute('data-gssf-focus-label');
      });
    } catch (_) {}
    target.setAttribute('data-gssf-focus-label', `Questão ${number}`);
    showQuestionFocusMarker.t = setTimeout(() => {
      if (!seq || target.getAttribute('data-gssf-map-jump-seq') === String(seq)) {
        target.removeAttribute('data-gssf-focus-label');
      }
    }, 2300);
  }

  async function findJumpTargetStable(number) {
    let target = findJumpTarget(number);
    if (target) return target;
    await sleep(240);
    target = findJumpTarget(number);
    if (target) return target;
    try {
      target = await findQuestionBlockByNumber(number);
      if (target) return target;
    } catch (_) {}
    try {
      await runAutoAnalysis(false);
      target = findJumpTarget(number);
      if (target) return target;
    } catch (_) {}
    await sleep(360);
    return findJumpTarget(number);
  }

  async function jumpToQuestion(number) {
    if (!number) return;
    animateLetterMapTrail(number, APP.letterMapActiveNumber);
    forceActiveLetterMapNumber(number, 2200);
    const seq = (APP.mapJumpSeq || 0) + 1;
    APP.mapJumpSeq = seq;
    clearTimeout(APP.mapJumpToastTimer);
    clearQuestionMapHighlight();
    const target = await findJumpTargetStable(number);
    if (seq !== APP.mapJumpSeq) return;
    if (!target) {
      APP.mapJumpToastTimer = setTimeout(() => {
        if (seq === APP.mapJumpSeq) toast(`Não encontrei a questão ${number}. Atualize a análise e tente novamente.`);
      }, 380);
      return;
    }
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (_) { try { target.scrollIntoView({ block: 'center' }); } catch (__) {} }
    setTimeout(() => {
      if (seq !== APP.mapJumpSeq) return;
      clearQuestionMapHighlight();
      target.setAttribute('data-gssf-map-jump-seq', String(seq));
      target.classList.remove('gssf-question-highlight');
      void target.offsetWidth;
      target.classList.add('gssf-question-highlight');
      showQuestionFocusMarker(target, number, seq);
      forceActiveLetterMapNumber(number, 1200);
      setTimeout(scheduleActiveLetterMapUpdate, 320);
      setTimeout(scheduleActiveLetterMapUpdate, 900);
      APP.mapJumpHighlightTimer = setTimeout(() => {
        if (target.getAttribute('data-gssf-map-jump-seq') === String(seq)) {
          target.classList.remove('gssf-question-highlight');
          target.removeAttribute('data-gssf-focus-label');
          target.removeAttribute('data-gssf-map-jump-seq');
        }
      }, 2500);
    }, 430);
    log(`Indo até a questão ${number}.`);
  }

  function updateInlineReport(audit) {
    const issues = document.getElementById('gssf-inline-issues');
    const key = document.getElementById('gssf-inline-key');
    const openOmr = document.getElementById('gssf-open-omr');
    if (!issues || !key) return;
    const pendingTotal = document.getElementById('gssf-pending-total');
    const pendingProblems = audit.problems || [];
    if (pendingTotal) pendingTotal.textContent = String(pendingProblems.length);
    const pendingRenderKey = JSON.stringify(pendingProblems);
    if (issues.dataset.pendingRenderKey !== pendingRenderKey) {
      issues.innerHTML = inlineProblemsHtml(pendingProblems);
      issues.dataset.pendingRenderKey = pendingRenderKey;
      bindIssueJumpButtons();
    }
    key.innerHTML = inlineKeyHtml(audit);
    updateQuestionMap(audit);
    updateLetterMap(audit);
    if (openOmr) openOmr.disabled = APP.busy;
    updateDashboardExtras(audit);
    saveCurrentFormToBank(audit);
  }

  function updateDashboardExtras(audit) {
    const box = document.getElementById('gssf-dashboard-extra');
    if (!box || !audit) return;
    const blank = audit.questions.filter((q) => q.emptyModel).length;
    const withoutAnswer = audit.questions.filter((q) => q.correct.length === 0).length;
    const items = [
      { label: 'Corretas', value: audit.answerKey.length, cls: 'ok', icon: '✓' },
      { label: 'Pendências', value: audit.problems.length, cls: audit.problems.length ? 'warn' : 'ok', icon: '!' },
      { label: 'Em branco', value: blank, cls: blank ? 'warn' : 'ok', icon: '□' },
      { label: 'Sem resposta', value: withoutAnswer, cls: withoutAnswer ? 'warn' : 'ok', icon: '-' }
    ];
    box.innerHTML = items.map((item) => `<span class="gssf-extra-pill ${item.cls}"><i>${escapeHtml(item.icon)}</i><b>${escapeHtml(item.value)}</b> ${escapeHtml(item.label)}</span>`).join('');
  }

  function setInlineLoading(message = 'Carregando formulário...') {
    const issues = document.getElementById('gssf-inline-issues');
    const key = document.getElementById('gssf-inline-key');
    const extra = document.getElementById('gssf-dashboard-extra');
    const map = document.getElementById('gssf-question-map');
    const letterMap = document.getElementById('gssf-letter-map');
    const pendingTotal = document.getElementById('gssf-pending-total');
    if (pendingTotal) pendingTotal.textContent = '—';
    if (extra) extra.innerHTML = '';
    if (issues) {
      delete issues.dataset.pendingRenderKey;
      issues.innerHTML = `<p class="gssf-muted">${escapeHtml(message || 'As pendências aparecem aqui após a leitura.')}</p>`;
    }
    if (key) key.innerHTML = '<p class="gssf-muted">O gabarito aparece após a leitura.</p>';
    if (map) map.innerHTML = '<p class="gssf-muted">O mapa aparece após a leitura.</p>';
    if (letterMap) letterMap.innerHTML = '<p class="gssf-muted">A leitura aparece após a análise.</p>';
  }
