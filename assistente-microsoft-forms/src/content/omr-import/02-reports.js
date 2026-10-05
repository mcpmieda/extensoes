

  function buildOmrHtml(audit) {
    const data = reportAnswerData(audit);
    const templateSrc = chrome.runtime.getURL('assets/omr-template.jpg');
    const letters = ['A', 'B', 'C', 'D'];
    const cols = [
      { start: 1, end: 15, xs: [95.5, 125.5, 155.5, 185.5] },
      { start: 16, end: 30, xs: [335.5, 365.5, 395.5, 425.5] },
      { start: 31, end: 40, xs: [575.5, 605.5, 635.5, 665.5] }
    ];
    const y0 = 48.8;
    const step = 30;
    const buttons = [];
    cols.forEach((col) => {
      for (let q = col.start; q <= col.end; q += 1) {
        const question = audit.questions.find(item => Number(item.number) === q);
        if (audit.nativeAnswerKey === false && (!question || question.totalOptions < 2 || question.totalOptions > 4)) continue;
        const row = q - col.start;
        const y = y0 + (row * step);
        const item = data.find((x) => x.number === q) || { original: '', current: '' };
        letters.forEach((l, index) => {
          if (audit.nativeAnswerKey === false && index >= question.totalOptions) return;
          const selected = item.current === l ? ' selected' : '';
          const original = item.original === l ? ' original-answer' : '';
          const changed = item.current !== item.original;
          const originalMuted = changed && item.original === l && item.current !== l ? ' original-muted' : '';
          const changedAnswer = changed && item.current === l && item.imported !== l ? ' changed-answer' : '';
          const importedAnswer = item.imported === l ? ' imported-answer' : '';
          const title = item.importSource && item.imported === l
            ? `Importada de: ${item.importSource.title || 'Forms salvo'} - questão ${item.importSource.sourceQuestion || q}`
            : `Questão ${q} alternativa ${l}`;
          const leftPct = ((col.xs[index] / 1000) * 100).toFixed(3);
          const topPct = ((y / 485) * 100).toFixed(3);
          buttons.push(`<button type="button" class="omr-bubble${selected}${original}${originalMuted}${changedAnswer}${importedAnswer}" data-q="${q}" data-letter="${l}" data-original="${item.original || ''}" data-current="${item.current || ''}" style="left:${leftPct}%;top:${topPct}%" aria-label="Questão ${q} alternativa ${l}" title="${escapeHtml(title)}"></button>`);
        });
      }
    });
    const sectionBands = buildOmrSectionBands(audit, cols, y0, step);
    const changedHtml = buildChangePanelHtml(data);
    const riskAlert = buildResetRiskAlertHtml(audit);
    return `
      <div class="gssf-omr-legend"><span><i class="original"></i>Original do Forms atual</span><span><i class="manual"></i>Alterada neste app</span><span><i class="imported"></i>Importada de outro Forms</span><span><i class="conflict"></i>Resposta divergente</span></div>
      ${riskAlert}
      <div class="omr-viewport"><div id="omr-sheet" class="omr-sheet"><img class="omr-template" src="${templateSrc}" alt="Modelo de gabarito">${sectionBands}${buttons.join('')}</div></div>
      <div id="omr-change-panel">${changedHtml}</div>`;
  }

  function buildHtmlReport(audit) {
    const status = audit.problems.length ? 'Revise os itens abaixo antes de usar o simulado.' : 'Nenhum problema encontrado.';
    const key = audit.answerKey.length ? audit.answerKey.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<em>Nenhuma resposta correta identificada.</em>';
    const formTitle = cleanText(audit.title || getFormTitle() || 'Simulado');
    const problemHtml = groupProblemsHtml(audit.problems);
    const omrHtml = buildOmrHtml(audit);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório do Simulado - ${escapeHtml(formTitle)}</title><style>
      :root{color-scheme:light}
      body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a}
      main{max-width:1180px;margin:auto;padding:24px}
      .hero,.card{background:#fff;border:1px solid #dbe5f0;border-radius:22px;padding:18px;box-shadow:0 16px 36px rgba(15,23,42,.08)}
      .hero{background:linear-gradient(135deg,#eff6ff,#ecfdf5)}
      h1{margin:0;font-size:24px} h2{font-size:17px;margin:0 0 10px}
      .muted{color:#64748b;font-size:12px;word-break:break-all}.status{color:#334155;margin-bottom:6px}
      .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}
      .kpi{background:#fff;border:1px solid #dbeafe;border-radius:16px;padding:12px;text-align:center}
      .kpi strong{display:block;font-size:26px;color:#1d4ed8}.kpi span{font-size:11px;text-transform:uppercase;font-weight:800;color:#475569}
      .card{margin-top:14px}.empty-ok{margin:0;color:#166534;font-weight:800}
      .problem-list{display:flex;flex-direction:column;gap:10px;max-width:860px}.problem-line{display:grid;grid-template-columns:72px 1fr;align-items:stretch;background:#f8fafc;border:1px solid #dbe5f0;border-radius:16px;overflow:hidden}.problem-num{background:#1d4ed8;color:#fff;display:grid;place-items:center;font-weight:950;font-size:16px}.problem-items{margin:0;padding:10px 14px 10px 28px}.problem-items li{margin:2px 0;font-size:14px;line-height:1.35}.problem-line.general .problem-num{background:#7c2d12}
      .keybox{display:flex;gap:7px;flex-wrap:wrap}.keybox span{background:#dbeafe;border:1px solid #bfdbfe;border-radius:999px;padding:6px 10px;font-weight:900}
      .omr-intro{margin:0 0 12px;color:#334155;font-size:14px}.gssf-history-box{display:grid;gap:6px;margin:12px 0 0;padding:10px;border:1px solid #dbe5f0;border-radius:14px;background:#fff}.gssf-history-title{display:flex;align-items:center;flex-wrap:wrap;gap:5px}.gssf-history-title strong{font-size:14px}.gssf-history-title span{font-size:10px;color:#64748b}.gssf-history-chips{display:flex;flex-wrap:wrap;gap:4px}.gssf-history-chip{padding:2px 7px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:9px;font-weight:900}.gssf-history-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(178px,1fr));gap:5px;margin:0;padding:0;list-style:none}.gssf-history-card{display:grid;overflow:hidden;border:1.5px solid #f2cb57;border-radius:11px;background:#fffdf7}.gssf-history-card.manual{border-color:#9fc2ff;background:#f9fbff}.gssf-history-card-head{display:flex;gap:7px;padding:7px 8px 6px}.gssf-history-answer,.gssf-history-status{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border-radius:9px;white-space:nowrap;font-weight:900}.gssf-history-answer{background:#0d8985;color:#fff}.gssf-history-status{height:27px;background:#fff4d8;border:1.5px solid #f2ce68;color:#ae7600;font-size:10px}.gssf-history-card.manual .gssf-history-status{background:#edf4ff;border-color:#adcaff;color:#2864d2}.gssf-history-detail{display:grid;grid-template-columns:25px 47px 1px minmax(0,1fr);align-items:center;column-gap:6px;min-height:34px;padding:5px 8px}.gssf-history-detail+.gssf-history-detail{border-top:1px solid #eee4c7}.gssf-history-icon{display:grid;place-items:center;width:25px;height:25px;border-radius:999px;background:#e7f2ef;color:#138d88}.gssf-history-icon svg{width:13px;height:13px}.gssf-history-label{font-size:9px;font-weight:900;color:#138d88}.gssf-history-divider{align-self:stretch;width:1px;background:#e9dfc4}.gssf-history-value{min-width:0;font-size:9px;line-height:1.15;color:#374151}
      .omr-viewport{overflow:auto;background:#fff;border:1px solid #dbe5f0;border-radius:16px;padding:12px}.omr-sheet{position:relative;width:1000px;height:485px;background:#fff;margin:0 auto;font-family:Arial,sans-serif;color:#111;overflow:visible}.omr-template{position:absolute;left:0;top:0;width:1000px;height:485px;display:block;user-select:none;pointer-events:none}.gssf-omr-section-band{position:absolute;z-index:1;pointer-events:auto;background:var(--gssf-section-fill);border:1px solid var(--gssf-section-border);border-radius:5px}.gssf-omr-section-band span{position:absolute;right:2px;top:4px;bottom:4px;width:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;writing-mode:vertical-rl;text-orientation:mixed;font-size:9px;line-height:1;font-weight:500;color:var(--gssf-section-ink)}.omr-bubble{position:absolute;width:26px;height:26px;border:0;border-radius:999px;background:transparent;padding:0;box-sizing:border-box;cursor:pointer;z-index:2}.omr-bubble.selected::after{content:'';position:absolute;left:50%;top:50%;width:20px;height:20px;border-radius:999px;background:#000;transform:translate(-50%,-50%)}.omr-bubble.changed-answer{box-shadow:0 0 0 2px #2563eb}.omr-bubble.original-muted{box-shadow:0 0 0 2px rgba(34,197,94,.28)}.omr-bubble.changed-empty{box-shadow:0 0 0 2px #f97316}.omr-bubble:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
      @media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}main{padding:12px}}
    </style></head><body><main>
      <section class="hero"><h1>Relatório de Auditoria do Simulado — ${escapeHtml(formTitle)}</h1><p class="status">${escapeHtml(status)}</p><p class="muted">${escapeHtml(audit.url)}</p><div class="grid"><div class="kpi"><strong>${audit.questions.length}</strong><span>questões</span></div><div class="kpi"><strong>${audit.answerKey.length}</strong><span>gabarito</span></div><div class="kpi"><strong>${audit.problems.length}</strong><span>atenções</span></div><div class="kpi"><strong>${audit.images}</strong><span>imagens</span></div><div class="kpi"><strong>${audit.sections}</strong><span>seções</span></div></div></section>
      <section class="card"><h2>Problemas encontrados</h2>${problemHtml}</section>
      <section class="card"><h2>Gabarito detectado</h2><div class="keybox">${key}</div></section>
      <section class="card"><h2>Preencher gabarito</h2><p class="omr-intro">Modelo igual ao gabarito usado no EvalBee. As respostas detectadas ficam em preto. Clique em uma bolinha para mudar manualmente. A alteração fica salva para este formulário quando a estrutura das questões for a mesma.</p>${omrHtml}</section>
    </main></body></html>`;
  }

  function writeHtmlToWindow(targetWindow, html) {
    if (!targetWindow || targetWindow.closed) return false;
    try {
      targetWindow.document.open();
      targetWindow.document.write(html);
      targetWindow.document.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildLoadingReportHtml() {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gerando relatório...</title><style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;display:grid;place-items:center;height:100vh}.box{background:#fff;border:1px solid #dbe5f0;border-radius:22px;padding:24px;box-shadow:0 16px 36px rgba(15,23,42,.08);text-align:center}.spin{width:34px;height:34px;border-radius:999px;border:4px solid #dbeafe;border-top-color:#2563eb;margin:0 auto 12px;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}h1{font-size:20px;margin:0 0 6px}p{margin:0;color:#475569}</style></head><body><div class="box"><div class="spin"></div><h1>Gerando relatório...</h1><p>Aguarde um instante.</p></div></body></html>';
  }
