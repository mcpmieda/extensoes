

  function pendingSummaryHtml(problems) {
    const counts = new Map();
    (problems || []).forEach((problem) => {
      const match = String(problem).match(/^Q\d{1,3}:\s*(.*)$/i);
      const item = problemTextSimple(match ? match[1] : problem);
      const type = issueTypeClass(item);
      counts.set(type, (counts.get(type) || 0) + 1);
    });
    const order = ['duplicate', 'blank', 'no-answer', 'option', 'multi', 'question-count', 'numbering', 'text', 'generic'];
    const chips = order.filter((type) => counts.has(type)).map((type) => {
      const count = counts.get(type);
      return `<span class="gssf-pending-summary-chip issue-${escapeHtml(type)}"><i aria-hidden="true"></i><b>${escapeHtml(count)}</b> ${escapeHtml(issueSummaryLabel(type, count))}</span>`;
    }).join('');
    return chips ? `<div class="gssf-pending-summary" aria-label="Resumo dos tipos de pendência">${chips}</div>` : '';
  }

  function issueLinesHtml(items) {
    const unique = Array.from(new Set(items));
    return `<div class="gssf-pending-issues">${unique.map((item) => {
      const type = issueTypeClass(item);
      return `<div class="gssf-pending-issue issue-${escapeHtml(type)}"><span class="gssf-pending-issue-icon" aria-hidden="true">${escapeHtml(issueTypeIcon(type))}</span><span>${escapeHtml(item)}</span></div>`;
    }).join('')}</div>`;
  }

  function pendingQuestionCardHtml(number, items, general = false) {
    const unique = Array.from(new Set(items));
    const count = unique.length;
    const numberHtml = general
      ? '<span class="gssf-pending-number general" aria-hidden="true">!</span>'
      : `<button type="button" class="gssf-pending-number" data-q="${escapeHtml(number)}" title="Ir até a questão ${escapeHtml(number)}" aria-label="Ir até a questão ${escapeHtml(number)}">${escapeHtml(number)}</button>`;
    const title = general ? 'Geral' : `Questão ${number}`;
    const subtitle = general ? 'Problemas gerais do formulário' : '';
    return `<article class="gssf-pending-question-card${general ? ' general' : ''}">
      ${numberHtml}
      <div class="gssf-pending-main">
        <div class="gssf-pending-top">
          <div class="gssf-pending-title"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}</div>
          <span class="gssf-pending-problem-count" title="${escapeHtml(count)} ${count === 1 ? 'pendência' : 'pendências'}">${escapeHtml(count)}</span>
        </div>
        ${issueLinesHtml(unique)}
      </div>
    </article>`;
  }

  function inlineProblemsHtml(problems) {
    const { grouped, general } = groupProblemsData(problems);
    const cards = [];
    if (general.length) cards.push(pendingQuestionCardHtml('!', general, true));
    Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).forEach(([q, items]) => {
      cards.push(pendingQuestionCardHtml(q, items));
    });
    if (!cards.length) return '<p class="gssf-okline">Nenhuma pendência encontrada.</p>';
    return `${pendingSummaryHtml(problems)}<div class="gssf-pending-list">${cards.join('')}</div>`;
  }

  function inlineKeyHtml(audit) {
    const data = reportAnswerData(audit).filter((item) => item.current);
    if (!data.length) return '<p class="gssf-muted">Nenhuma resposta correta foi encontrada ainda.</p>';
    return `<div class="gssf-mini-key-list">${data.map((item) => `<span><b>${escapeHtml(item.number)}</b><em>${escapeHtml(item.current)}</em></span>`).join('')}</div>`;
  }

  function questionMapHtml(audit) {
    const questionMap = new Map((audit?.questions || []).filter((q) => q.number > 0).map((q) => [q.number, q]));
    const unique = Array.from(questionMap.keys()).sort((a, b) => a - b);
    if (!unique.length) return '<p class="gssf-muted">O mapa aparece após a leitura.</p>';
    const problemNumbers = new Set();
    (audit?.problems || []).forEach((problem) => {
      const m = String(problem).match(/^Q(\d{1,3}):/i);
      if (m) problemNumbers.add(Number(m[1]));
    });
    const dotHtml = (n) => {
      const q = questionMap.get(n);
      const filled = Boolean(q && !q.emptyModel && (q.prompt || q.totalOptions));
      const classes = ['gssf-map-dot'];
      if (filled) classes.push('filled');
      if (q?.emptyModel) classes.push('blank');
      if (problemNumbers.has(n)) classes.push('issue');
      return `<button type="button" class="${classes.join(' ')}" data-q="${escapeHtml(n)}" title="Ir até a questão ${escapeHtml(n)}">${escapeHtml(n)}</button>`;
    };
    if (!readSettings().mapBySections) return `<div class="gssf-map-grid">${unique.map(dotHtml).join('')}</div>`;
    const grouped = new Map();
    unique.forEach((n) => {
      const q = questionMap.get(n);
      const title = cleanText(q?.sectionTitle || '') || 'Sem seção';
      const key = `${Number.isInteger(q?.sectionIndex) ? q.sectionIndex : 999}:${title}`;
      if (!grouped.has(key)) grouped.set(key, { title, numbers: [] });
      grouped.get(key).numbers.push(n);
    });
    return `<div class="gssf-section-map">${Array.from(grouped.values()).map((group) => `
      <div class="gssf-section-map-row">
        <strong title="${escapeHtml(group.title)}">${escapeHtml(group.title)}</strong>
        <div class="gssf-map-grid">${group.numbers.map(dotHtml).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function bindQuestionMapButtons() {
    document.querySelectorAll('#gssf-question-map .gssf-map-dot[data-q]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const number = Number(btn.dataset.q || 0);
        jumpToQuestion(number);
      });
    });
  }

  function updateQuestionMap(audit) {
    const map = document.getElementById('gssf-question-map');
    if (!map) return;
    map.innerHTML = questionMapHtml(audit);
    bindQuestionMapButtons();
  }

  function letterStatusForQuestion(q) {
    if (!q) return 'missing';
    if (q.emptyModel) return 'blank';
    const total = Number(q.totalOptions || 0);
    if (!total) return 'missing';
    const markers = Array.isArray(q.letterMarkers) ? q.letterMarkers.slice(0, total) : [];
    const checked = markers.filter(Boolean).length;
    if (checked >= total) return 'complete';
    if (checked > 0) return 'partial';
    return 'missing';
  }

  function letterStatusTitle(status, number) {
    if (status === 'complete') return `Questão ${number}: letras completas`;
    if (status === 'partial') return `Questão ${number}: letras parciais`;
    if (status === 'blank') return `Questão ${number}: questão em branco`;
    return `Questão ${number}: falta inserir letras`;
  }

  function letterMapHtml(audit) {
    const questions = (audit?.questions || []).filter((q) => Number(q.number) > 0).sort((a, b) => Number(a.number) - Number(b.number));
    if (!questions.length) return '<p class="gssf-muted">A leitura aparece após a análise.</p>';
    return `<div class="gssf-letter-grid">${questions.map((q) => {
      const number = Number(q.number || 0);
      const status = letterStatusForQuestion(q);
      const classes = ['gssf-letter-dot', status];
      if (APP.letterMapActiveNumber && Number(APP.letterMapActiveNumber) === number) classes.push('current');
      return `<button type="button" class="${classes.join(' ')}" data-q="${escapeHtml(number)}" title="${escapeHtml(letterStatusTitle(status, number))}">${escapeHtml(number)}</button>`;
    }).join('')}</div>`;
  }

  function bindLetterMapButtons() {
    document.querySelectorAll('#gssf-letter-map .gssf-letter-dot[data-q]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => jumpToQuestion(Number(btn.dataset.q || 0)));
    });
  }

  function updateLetterMap(audit) {
    const box = document.getElementById('gssf-letter-map');
    if (!box) return;
    box.innerHTML = letterMapHtml(audit);
    bindLetterMapButtons();
    updateActiveLetterMapNow();
  }