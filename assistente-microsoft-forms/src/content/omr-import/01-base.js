  // ===== 70-omr-import.js =====
// Fonte modular: omr import.
  const GSSF_SECTION_PALETTE = [
    { fill: 'rgba(213,231,255,.72)', card: '#c8e0ff', soft: '#e8f1ff', border: '#73a7df', ink: '#294b73' },
    { fill: 'rgba(236,225,255,.74)', card: '#dbcdfd', soft: '#f0e9ff', border: '#a991df', ink: '#5d4691' },
    { fill: 'rgba(255,234,205,.76)', card: '#f8ddbd', soft: '#fff1df', border: '#d0a977', ink: '#855b28' },
    { fill: 'rgba(223,243,255,.76)', card: '#caeafb', soft: '#ebf8ff', border: '#7fb7d8', ink: '#255f79' },
    { fill: 'rgba(246,232,255,.74)', card: '#e8d8fb', soft: '#f7efff', border: '#bc91da', ink: '#714690' },
    { fill: 'rgba(255,245,219,.78)', card: '#f7ebc7', soft: '#fff8e6', border: '#ceb16b', ink: '#846412' },
    { fill: 'rgba(232,239,255,.76)', card: '#dbe6ff', soft: '#eef3ff', border: '#90a5dc', ink: '#35518d' },
    { fill: 'rgba(255,232,224,.76)', card: '#f7d8cb', soft: '#fff0ea', border: '#d49d86', ink: '#8c4f35' },
    { fill: 'rgba(233,246,239,.76)', card: '#d8ece1', soft: '#eef7f2', border: '#91b8a4', ink: '#3f6b56' },
    { fill: 'rgba(243,236,225,.78)', card: '#eadfce', soft: '#f8f3ea', border: '#bda98b', ink: '#6f5d43' },
    { fill: 'rgba(226,238,246,.78)', card: '#d2e3ed', soft: '#edf5f9', border: '#86a7bb', ink: '#34596b' },
    { fill: 'rgba(250,231,240,.76)', card: '#f4d7e4', soft: '#fdeef4', border: '#c296ad', ink: '#7e4a63' }
  ];

  function sectionVisual(sectionIndex) {
    const index = Number.isInteger(sectionIndex) && sectionIndex >= 0 ? sectionIndex : 0;
    return GSSF_SECTION_PALETTE[index % GSSF_SECTION_PALETTE.length];
  }

  function rowSort(a, b) {
    return Number(a.number || 0) - Number(b.number || 0);
  }

  function collectSectionRanges(items, mode = 'audit') {
    const rows = (Array.isArray(items) ? items : [])
      .map((item) => ({
        number: Number(mode === 'record' ? item?.questionNumber : item?.number),
        sectionTitle: cleanText(item?.sectionTitle || ''),
        sectionIndex: Number.isInteger(item?.sectionIndex) ? item.sectionIndex : -1
      }))
      .filter((row) => row.number >= 1 && row.sectionTitle)
      .sort(rowSort);
    const ranges = [];
    let active = null;
    rows.forEach((row) => {
      const normalizedTitle = normalizeText(row.sectionTitle);
      if (!active || active.normalizedTitle !== normalizedTitle || row.number !== active.end + 1) {
        if (active) ranges.push(active);
        active = {
          key: `${normalizedTitle}::${row.number}`,
          title: row.sectionTitle,
          normalizedTitle,
          start: row.number,
          end: row.number,
          numbers: [row.number],
          sectionIndex: row.sectionIndex
        };
        return;
      }
      active.end = row.number;
      active.numbers.push(row.number);
    });
    if (active) ranges.push(active);
    return ranges;
  }

  function analyzeSourceSectionsForImport(audit, source) {
    const currentRanges = collectSectionRanges(audit?.questions || [], 'audit');
    const sourceQuestions = Object.values(source?.questions || {}).filter(Boolean);
    const sourceRanges = collectSectionRanges(sourceQuestions, 'record');
    const sourceQuestionCount = sourceQuestions.length;
    const sourceWithSectionCount = sourceQuestions.filter((question) => cleanText(question?.sectionTitle || '') && Number.isInteger(question?.sectionIndex)).length;
    const metadataComplete = sourceQuestionCount > 0 && sourceWithSectionCount === sourceQuestionCount;

    if (!sourceQuestionCount) {
      return { status: 'empty-source', matches: [], message: 'Este Forms de origem ainda não possui questões salvas no banco local.' };
    }
    if (!metadataComplete || !sourceRanges.length) {
      return {
        status: 'source-needs-refresh',
        matches: [],
        message: 'A leitura salva deste Forms é de uma versão antiga e não contém o mapa completo de seções. Abra esse Forms de origem novamente com esta versão do assistente e depois volte ao formulário atual.'
      };
    }
    if (!currentRanges.length) {
      return { status: 'current-without-sections', matches: [], message: 'O Forms atual não possui seções reconhecidas para comparação.' };
    }

    const matches = [];
    const rejected = [];
    sourceRanges.forEach((sourceRange) => {
      const sameName = currentRanges.filter((range) => range.normalizedTitle === sourceRange.normalizedTitle);
      if (!sameName.length) {
        rejected.push({ title: sourceRange.title, reason: 'nome inexistente no Forms atual' });
        return;
      }
      const currentRange = sameName.find((range) => range.start === sourceRange.start && range.end === sourceRange.end);
      if (!currentRange) {
        rejected.push({ title: sourceRange.title, reason: 'faixa de questões diferente' });
        return;
      }
      const currentNumbers = currentRange.numbers.join(',');
      const sourceNumbers = sourceRange.numbers.join(',');
      if (currentNumbers !== sourceNumbers) {
        rejected.push({ title: sourceRange.title, reason: 'numeração interna diferente' });
        return;
      }
      const questions = sourceRange.numbers.map((number) => source?.questions?.[String(number)] || null);
      if (questions.some((question) => !question)) {
        rejected.push({ title: sourceRange.title, reason: 'questões ausentes na leitura da origem' });
        return;
      }
      const optionMismatch = questions.some((sourceQuestion) => {
        const destination = (audit?.questions || []).find((question) => Number(question.number) === Number(sourceQuestion.questionNumber));
        return !destination || Number(destination.totalOptions || 0) !== Number(sourceQuestion.optionCount || 0);
      });
      if (optionMismatch) {
        rejected.push({ title: sourceRange.title, reason: 'quantidade de alternativas diferente' });
        return;
      }
      const questionNumbers = sourceRange.numbers.filter((number) => Boolean(sourceAnswerForBankQuestion(source?.questions?.[String(number)] || null)));
      if (!questionNumbers.length) {
        rejected.push({ title: sourceRange.title, reason: 'sem respostas corretas marcadas na origem' });
        return;
      }
      matches.push({
        key: `${sourceRange.normalizedTitle}::${sourceRange.start}::${sourceRange.end}`,
        title: currentRange.title || sourceRange.title,
        start: sourceRange.start,
        end: sourceRange.end,
        questionNumbers,
        totalQuestions: sourceRange.numbers.length,
        answeredQuestions: questionNumbers.length,
        sectionIndex: currentRange.sectionIndex
      });
    });

    return {
      status: matches.length ? 'ready' : 'no-match',
      matches: matches.sort((a, b) => a.start - b.start),
      rejected,
      message: matches.length
        ? 'Somente seções com mesmo nome, mesma faixa de questões e mesma quantidade de alternativas aparecem abaixo.'
        : 'Nenhuma seção passou pela validação completa de nome, faixa de questões e quantidade de alternativas.'
    };
  }

  function matchingSourceSectionsForImport(audit, source) {
    return analyzeSourceSectionsForImport(audit, source).matches;
  }

  function launchedSectionSetForSource(sourceFormId) {
    const key = String(sourceFormId || '');
    if (!key) return new Set();
    const bag = APP.omrImportState.launchedSectionKeys || (APP.omrImportState.launchedSectionKeys = {});
    if (!Array.isArray(bag[key])) bag[key] = [];
    return new Set(bag[key]);
  }

  function isSectionLaunchHidden(sourceFormId, sectionKey) {
    return launchedSectionSetForSource(sourceFormId).has(String(sectionKey || ''));
  }

  function markSectionLaunchHidden(sourceFormId, sectionKey) {
    const key = String(sourceFormId || '');
    const section = String(sectionKey || '');
    if (!key || !section) return;
    const bag = APP.omrImportState.launchedSectionKeys || (APP.omrImportState.launchedSectionKeys = {});
    const current = new Set(Array.isArray(bag[key]) ? bag[key] : []);
    current.add(section);
    bag[key] = Array.from(current);
  }

  function buildSectionImportButtonsHtml(audit, source) {
    if (!source) return '';
    const analysis = analyzeSourceSectionsForImport(audit, source);
    const visibleMatches = analysis.matches.filter((section) => !isSectionLaunchHidden(source.formId, section.key));
    const hiddenCount = analysis.matches.length - visibleMatches.length;
    const collapsed = typeof APP.omrImportState.sectionLaunchCollapsed === 'boolean' ? APP.omrImportState.sectionLaunchCollapsed : readSectionLaunchCollapsedPref();
    const buttons = visibleMatches.map((section) => {
      const tone = sectionVisual(section.sectionIndex);
      return `<button type="button" class="gssf-btn gssf-section-launch-btn" data-section-key="${escapeHtml(section.key)}" data-section-index="${escapeHtml(section.sectionIndex)}" style="--gssf-launch-fill:${tone.card};--gssf-launch-soft:${tone.soft || tone.fill};--gssf-launch-border:${tone.border};--gssf-launch-ink:${tone.ink}" title="Lançar ${escapeHtml(section.answeredQuestions)} resposta(s) da seção ${escapeHtml(section.title)}"><span>${escapeHtml(section.title)}</span><small>${escapeHtml(section.start)}–${escapeHtml(section.end)} · ${escapeHtml(section.answeredQuestions)}/${escapeHtml(section.totalQuestions)}</small></button>`;
    }).join('');
    let bodyHtml = '';
    if (!collapsed) {
      const bodyMessage = visibleMatches.length
        ? 'Somente seções com mesmo nome, mesma faixa de questões e mesma quantidade de alternativas aparecem abaixo.'
        : hiddenCount && analysis.matches.length
          ? 'Todas as seções validadas já foram lançadas para o gabarito atual.'
          : analysis.message;
      bodyHtml = `<div class="gssf-import-section-launch-body" id="gssf-import-section-launch-body"><p>${escapeHtml(bodyMessage)}</p>${buttons ? `<div class="gssf-import-section-launch-buttons">${buttons}</div>` : ''}</div>`;
    }
    const statusClass = visibleMatches.length ? ' ready' : ' unavailable';
    const badgeLabel = visibleMatches.length ? `${visibleMatches.length} validada(s)` : hiddenCount && analysis.matches.length ? 'todas lançadas' : 'indisponível';
    return `<section class="gssf-import-section-launch${statusClass}${collapsed ? ' collapsed' : ''}" aria-label="Lançar respostas conforme seção">
      <button type="button" class="gssf-import-section-launch-head" id="gssf-import-section-launch-toggle" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="gssf-import-section-launch-body">
        <span class="gssf-import-section-launch-head-main"><strong>Lançar conforme seção</strong><span>${escapeHtml(badgeLabel)}</span></span>
        <span class="gssf-import-section-toggle-icon" aria-hidden="true" title="${collapsed ? 'Expandir' : 'Recolher'}">${collapsed ? '▼' : '▲'}</span>
      </button>
      ${bodyHtml}
    </section>`;
  }

  function buildResetRiskState(audit) {
    const currentRecord = getCurrentFormRecord(audit);
    if (!currentRecord?.questions) return { active: false, questions: [] };
    const risky = Object.values(currentRecord.questions || {}).filter((question) => question?.shiftRisk && (question.manualAnswer || question.importedAnswer));
    return {
      active: risky.length > 0,
      questions: risky.map((question) => Number(question.questionNumber || 0)).filter((n) => n > 0).sort((a, b) => a - b)
    };
  }

  function buildResetRiskAlertHtml(audit) {
    const risk = buildResetRiskState(audit);
    if (!risk.active) return '';
    const preview = risk.questions.slice(0, 10).join(', ');
    return `<div class="gssf-omr-risk-alert" role="alert"><strong>Atenção: redefina o gabarito.</strong><p>O Forms atual teve mudança de ordem ou conteúdo em questões que já tinham marcações do app. As letras antigas podem ter permanecido em questões trocadas. Revise e clique em <b>Redefinir</b> antes de continuar.${preview ? ` Questões afetadas: ${escapeHtml(preview)}${risk.questions.length > 10 ? '…' : ''}.` : ''}</p><button type="button" class="gssf-btn danger" id="gssf-omr-risk-reset">Redefinir agora</button></div>`;
  }

  function buildOmrSectionBands(audit, cols, y0, step) {
    const questions = (audit?.questions || [])
      .filter((q) => Number(q?.number) >= 1 && Number(q?.number) <= 40 && Number.isInteger(q?.sectionIndex) && q.sectionIndex >= 0)
      .sort((a, b) => Number(a.number) - Number(b.number));
    if (!questions.length) return '';
    const bands = [];
    cols.forEach((col, colIndex) => {
      const columnQuestions = questions.filter((q) => Number(q.number) >= col.start && Number(q.number) <= col.end);
      let active = null;
      columnQuestions.forEach((q) => {
        const number = Number(q.number);
        const title = cleanText(q.sectionTitle || `Seção ${Number(q.sectionIndex) + 1}`);
        if (active && active.sectionIndex === q.sectionIndex && number === active.end + 1) {
          active.end = number;
          if (!active.title && title) active.title = title;
          return;
        }
        if (active) bands.push(active);
        active = { sectionIndex: q.sectionIndex, title, start: number, end: number, colIndex };
      });
      if (active) bands.push(active);
    });

    const labelBandBySection = new Map();
    bands.forEach((band, index) => {
      const size = (band.end - band.start) + 1;
      const currentIndex = labelBandBySection.get(band.sectionIndex);
      const current = Number.isInteger(currentIndex) ? bands[currentIndex] : null;
      const currentSize = current ? (current.end - current.start) + 1 : -1;
      if (!current || size > currentSize) labelBandBySection.set(band.sectionIndex, index);
    });

    const rawRects = bands.map((band, bandIndex) => {
      const col = cols[band.colIndex];
      const tone = sectionVisual(band.sectionIndex);
      const firstCenter = y0 + ((band.start - col.start) * step);
      const lastCenter = y0 + ((band.end - col.start) * step);
      const top = Math.max(0, firstCenter - 16.2);
      const bottom = Math.min(485, lastCenter + 16.2);
      const left = col.xs[0] - 62;
      const width = (col.xs[3] - col.xs[0]) + 110;
      return {
        band,
        bandIndex,
        showLabel: labelBandBySection.get(band.sectionIndex) === bandIndex,
        tone,
        top,
        bottom,
        left,
        width
      };
    });

    const gapPx = 0;
    cols.forEach((col, colIndex) => {
      const rects = rawRects.filter((item) => item.band.colIndex === colIndex).sort((a, b) => a.top - b.top);
      rects.forEach((item, idx) => {
        const next = rects[idx + 1];
        if (!next) return;
        const limit = next.top - gapPx;
        if (item.bottom > limit) item.bottom = Math.max(item.top + 18, limit);
      });
    });

    return rawRects.map((item) => {
      const height = Math.max(18, item.bottom - item.top);
      return `<div class="gssf-omr-section-band" data-section-index="${escapeHtml(item.band.sectionIndex)}" data-section-title="${escapeHtml(item.band.title)}" style="left:${((item.left / 1000) * 100).toFixed(3)}%;top:${((item.top / 485) * 100).toFixed(3)}%;width:${((item.width / 1000) * 100).toFixed(3)}%;height:${((height / 485) * 100).toFixed(3)}%;--gssf-section-fill:${item.tone.fill};--gssf-section-border:${item.tone.border};--gssf-section-ink:${item.tone.ink}" title="${escapeHtml(item.band.title)}">${item.showLabel ? `<span>${escapeHtml(item.band.title)}</span>` : ''}</div>`;
    }).join('');
  }