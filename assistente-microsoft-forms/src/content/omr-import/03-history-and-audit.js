

  function reportAnswerData(audit) {
    const byQuestion = new Map();
    audit.questions.forEach((q) => {
      if (q.correct.length === 1) byQuestion.set(Number(q.number), letter(q.correct[0]));
    });
    const overrides = readManualOverrides(audit);
    const currentRecord = getCurrentFormRecord(audit);
    const data = [];
    const currentRecordQuestionNumbers = Object.keys(currentRecord?.questions || {}).map((n) => Number(n)).filter(Number.isFinite);
    const maxQuestion = Math.max(40, Number(audit?.questions?.length || 0), Number(currentRecord?.questionCount || 0), ...currentRecordQuestionNumbers);
    for (let q = 1; q <= maxQuestion; q += 1) {
      const original = byQuestion.get(q) || '';
      const key = String(q);
      const bankQuestion = currentRecord?.questions?.[key] || {};
      const manual = Object.prototype.hasOwnProperty.call(overrides, key) ? String(overrides[key] || '') : String(bankQuestion.manualAnswer || '');
      const imported = String(bankQuestion.importedAnswer || '');
      const current = manual || imported || original;
      const source = manual ? 'manual' : imported ? 'imported' : original ? 'original' : '';
      const conflict = Boolean(imported && original && imported !== original && !manual);
      data.push({ number: q, original, manual, imported, current, source, conflict, importSource: bankQuestion.importSource || null, shiftRisk: bankQuestion.shiftRisk || null });
    }
    return data;
  }

  function answerLabel(value) {
    return value ? String(value).toUpperCase() : 'em branco';
  }

  function changeKind(item) {
    if (item.conflict) return 'attention';
    if (item.imported) return 'imported';
    if (item.manual) return 'manual';
    if (!item.current && item.original) return 'cleared';
    return 'changed';
  }

  function historyKindLabel(kind) {
    if (kind === 'attention') return 'DIVERGENTE';
    if (kind === 'imported') return 'IMPORTADA';
    if (kind === 'manual') return 'ALTERADA';
    if (kind === 'cleared') return 'LIMPA';
    return 'ALTERADA';
  }

  function changeLineHtml(item) {
    const kind = changeKind(item);
    const current = answerLabel(item.current);
    const sourceTitle = item.importSource?.title || 'Forms salvo';
    const sourceQuestion = item.importSource?.sourceQuestion || item.number;
    const matchLabel = item.importSource?.matchLabel || '';
    const shortSource = cleanText(sourceTitle).replace(/\s+/g, ' ').trim();
    const sourceDisplay = item.imported
      ? `${shortSource}${sourceQuestion ? ` • Q${sourceQuestion}` : ''}`
      : 'Neste app';
    let compareLine = '';
    if (item.imported) {
      if (matchLabel) compareLine = normalizeText(matchLabel).includes('diferente') ? 'texto diferente' : matchLabel;
      else if (!item.original) compareLine = 'atual em branco';
      else if (String(item.original || '').toUpperCase() === String(item.imported || '').toUpperCase()) compareLine = 'igual ao atual';
      else compareLine = `atual ${answerLabel(item.original)}`;
    } else if (item.manual) {
      compareLine = item.original ? `atual ${answerLabel(item.original)}` : 'atual em branco';
    } else {
      compareLine = item.original ? `atual ${answerLabel(item.original)}` : 'atual em branco';
    }
    const sourceIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4.5 4.5V20.5H7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M14 3.5v5.5h5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
    const compareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h10l-3-3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17H6l3 3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return `<li class="gssf-history-card ${escapeHtml(kind)}" title="Questão ${escapeHtml(item.number)} • ${escapeHtml(sourceDisplay)} • ${escapeHtml(compareLine)}">
      <div class="gssf-history-card-head">
        <span class="gssf-history-answer">${escapeHtml(item.number)} - ${escapeHtml(current)}</span>
        <span class="gssf-history-status">${escapeHtml(historyKindLabel(kind))}</span>
      </div>
      <div class="gssf-history-detail">
        <span class="gssf-history-icon">${sourceIcon}</span>
        <span class="gssf-history-label">ORIGEM:</span>
        <span class="gssf-history-divider"></span>
        <span class="gssf-history-value">${escapeHtml(sourceDisplay)}</span>
      </div>
      <div class="gssf-history-detail">
        <span class="gssf-history-icon compare">${compareIcon}</span>
        <span class="gssf-history-label">COMPAR:</span>
        <span class="gssf-history-divider"></span>
        <span class="gssf-history-value">${escapeHtml(compareLine)}</span>
      </div>
    </li>`;
  }

  function buildChangePanelHtml(data) {
    const changed = (data || []).filter((item) => item.current !== item.original || item.imported || item.manual);
    if (!changed.length) {
      return '<section class="gssf-history-box"><div class="gssf-history-title"><strong>Histórico de marcações</strong><span>• nenhuma questão com marcações</span></div><p class="gssf-history-empty">Nada para revisar agora.</p></section>';
    }
    const counts = changed.reduce((acc, item) => {
      const kind = changeKind(item);
      acc[kind] = (acc[kind] || 0) + 1;
      return acc;
    }, {});
    const chips = [
      ['manual', 'manuais'],
      ['imported', 'importadas'],
      ['attention', 'divergentes'],
      ['cleared', 'limpas']
    ].filter(([key]) => counts[key]).map(([key, label]) => `<span class="gssf-history-chip ${key}">${escapeHtml(counts[key])} ${escapeHtml(label)}</span>`).join('');
    return `<section class="gssf-history-box"><div class="gssf-history-title"><strong>Histórico de marcações</strong><span>• ${escapeHtml(pluralPt(changed.length, 'questão com marcações', 'questões com marcações'))}</span></div>${chips ? `<div class="gssf-history-chips">${chips}</div>` : ''}<ul id="gssf-history-list" class="gssf-history-grid">${changed.map(changeLineHtml).join('')}</ul></section>`;
  }

  function buildOmrAudit(audit, dataOverride = null) {
    const data = dataOverride || reportAnswerData(audit);
    const realQuestions = audit.questions.length || data.length;
    const auditData = data.filter((item) => item.number <= realQuestions);
    const marked = auditData.filter((item) => item.current).length;
    const blank = Math.max(0, realQuestions - marked);
    const manual = auditData.filter((item) => item.manual).length;
    const imported = auditData.filter((item) => item.imported).length;
    const original = auditData.filter((item) => item.original).length;
    const conflicts = auditData.filter((item) => item.conflict).length;
    const maxOptionCount = Math.max(
      4,
      ...(audit.questions || []).map((q) => Number(q.optionCount || q.options?.length || q.optionTexts?.length || 0)),
      ...auditData.map((item) => (/^[A-Z]$/.test(String(item.current || '')) ? String(item.current).charCodeAt(0) - 64 : 0))
    );
    const distribution = {};
    for (let i = 0; i < Math.min(maxOptionCount, 26); i += 1) distribution[letter(i)] = 0;
    auditData.forEach((item) => {
      const current = String(item.current || '').toUpperCase();
      if (!current) return;
      if (distribution[current] === undefined) distribution[current] = 0;
      distribution[current] += 1;
    });
    const alerts = [];
    if (blank > Math.max(3, Math.round(realQuestions * 0.25))) alerts.push(`${blank} sem resposta marcada.`);
    if (conflicts) alerts.push(`${conflicts} resposta(s) importada(s) diferente(s) da original do Forms atual.`);
    const maxRun = longestAnswerRun(auditData);
    if (maxRun.length >= 5) alerts.push(`${maxRun.length} respostas "${maxRun.letter}" em sequência.`);
    const distValues = Object.values(distribution);
    const maxDist = Math.max(...distValues), minDist = Math.min(...distValues);
    if (marked >= 12 && maxDist - minDist >= Math.max(6, Math.round(marked * 0.35))) alerts.push('Distribuição das alternativas muito desequilibrada.');
    if ((audit.problems || []).some((p) => /Mais de uma resposta correta/i.test(p))) alerts.push('Há questão com mais de uma resposta correta detectada.');
    if ((audit.problems || []).some((p) => /Sem resposta correta/i.test(p))) alerts.push('Há questão sem resposta correta no Forms.');
    const maxBar = Math.max(1, ...distValues);
    const adjustments = manual + imported;
    return {
      cards: [
        { label: 'questões', value: realQuestions, cls: '' },
        { label: 'marcadas', value: marked, cls: 'ok' },
        { label: 'em branco', value: blank, cls: blank ? 'warn' : 'ok' },
        { label: 'ajustes no app', value: adjustments, cls: adjustments ? 'manual' : '' }
      ],
      distribution,
      maxBar,
      alerts
    };
  }

  function longestAnswerRun(data) {
    let best = { letter: '', length: 0 };
    let current = { letter: '', length: 0 };
    data.forEach((item) => {
      const value = item.current || '';
      if (value && value === current.letter) current.length += 1;
      else current = { letter: value, length: value ? 1 : 0 };
      if (current.length > best.length) best = { ...current };
    });
    return best;
  }

  function buildOmrAuditHtml(audit, dataOverride = null) {
    const auditData = buildOmrAudit(audit, dataOverride);
    const cards = auditData.cards.map((card) => `<div class="gssf-audit-card ${card.cls}"><b>${escapeHtml(card.value)}</b><span>${escapeHtml(card.label)}</span></div>`).join('');
    const bars = Object.entries(auditData.distribution).map(([key, value]) => {
      const width = Math.max(3, Math.round((Number(value || 0) / auditData.maxBar) * 100));
      return `<div class="gssf-dist-row"><b>${escapeHtml(key)}</b><span><i style="width:${width}%"></i></span><em>${escapeHtml(value)}</em></div>`;
    }).join('');
    const alerts = auditData.alerts.length
      ? `<div class="gssf-audit-points"><strong>Pontos para conferir</strong><ul>${auditData.alerts.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
      : '<div class="gssf-audit-points ok"><strong>Pontos para conferir</strong><p>Sem alerta importante no gabarito interno.</p></div>';
    const actions = `<div class="gssf-audit-actions">
      <button type="button" id="gssf-omr-reset" class="gssf-btn ok" data-allow-busy="1">Redefinir</button>
      <button type="button" id="gssf-omr-clear-imported" class="gssf-btn ok" data-allow-busy="1">Limpar importadas</button>
      <button type="button" id="gssf-omr-clear-manual" class="gssf-btn ok" data-allow-busy="1">Limpar manuais</button>
    </div>`;
    return `<section class="gssf-omr-audit"><h3>Resumo do gabarito</h3><div class="gssf-omr-audit-layout"><div class="gssf-audit-actions-wrap">${actions}</div><div class="gssf-audit-side">${cards}</div><div class="gssf-audit-wide"><div class="gssf-dist-box compact"><strong>Distribuição das alternativas</strong>${bars}</div>${alerts}</div></div></section>`;
  }

  function omrBankSummaryHtml(audit) {
    const bank = readFormsBank();
    const forms = Object.values(bank.forms || {}).filter(Boolean);
    const current = getCurrentFormRecord(audit);
    const currentAnswers = answerCountFromQuestions(current?.questions || {});
    const currentQuestions = Number(current?.questionCount || audit?.questions?.length || 0);
    const imported = current?.questions ? Object.values(current.questions).filter((q) => q?.importedAnswer).length : 0;
    const manual = current?.questions ? Object.values(current.questions).filter((q) => q?.manualAnswer).length : 0;
    const lastRead = current?.lastReadAt ? formatReadTime(current.lastReadAt) : 'ainda não salvo nesta leitura';
    return `<section class="gssf-omr-bank-summary" aria-label="Resumo do banco local de gabaritos">
      <strong>Banco local</strong>
      <span>${escapeHtml(forms.length)} Forms salvos • atual: ${escapeHtml(currentAnswers)}/${escapeHtml(currentQuestions)} com resposta marcada</span>
      <em>Última leitura: ${escapeHtml(lastRead)}</em>
    </section>`;
  }

  function omrToolsHtml() {
    return '';
  }

  function omrMainBodyHtml(audit) {
    return `${omrToolsHtml()}${buildOmrAuditHtml(audit)}${buildOmrHtml(audit)}`;
  }