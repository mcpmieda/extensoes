  // ===== 80-analysis-dashboard.js =====
// Fonte modular: analysis dashboard.
  async function copyAnswerKey() {
    const audit = APP.lastAudit || auditPage();
    APP.lastAudit = audit;
    const text = audit.answerKey.join('\n');
    if (!text) { log('Nenhum gabarito identificado para copiar.'); toast('Sem gabarito.'); return; }
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.remove();
    }
    log(ok ? 'Gabarito copiado.' : 'Cópia automática bloqueada.');
    toast(ok ? 'Gabarito copiado.' : 'Cópia bloqueada.');
  }

  function collectPrecheck() {
    const questions = collectQuestionBlocks();
    const sections = getSectionBlocks();
    const imageInfo = countContentImages(questions, sections);
    const nums = questions.map(questionNumberFromBlock).filter((n) => n > 0);
    const missing = [];
    if (nums.length) for (let i = 1; i <= Math.max(...nums); i += 1) if (!nums.includes(i)) missing.push(i);
    const options = countOptions(questions);
    const radioGroups = uniqueElements(questions.flatMap((b) => Array.from(b.querySelectorAll('[role="radiogroup"]')).filter(visible))).length || Array.from(document.querySelectorAll('[role="radiogroup"]')).filter(visible).length;
    const emptyModels = questions.filter(isEmptyModel).length;
    const warnings = [];
    const infos = [];
    if (!isRealFormsDocument()) warnings.push('fora de um formulário real');
    if (missing.length) warnings.push(`falha na numeração: ${missing.slice(0, 6).join(', ')}`);
    if (emptyModels) infos.push(`${pluralPt(emptyModels, 'questão em branco', 'questões em branco')}`);
    if (sections.length) infos.push(`${pluralPt(sections.length, 'seção', 'seções')}`);
    if (imageInfo.count) infos.push(`${pluralPt(imageInfo.count, 'imagem', 'imagens')}`);
    const result = {
      generatedAt: new Date().toLocaleString('pt-BR'),
      url: location.href,
      title: getFormTitle() || document.title,
      mode: pageMode(),
      questions: questions.length,
      options,
      radioGroups,
      images: imageInfo.count,
      sections: sections.length,
      emptyModels,
      numbers: nums,
      missingNumbers: missing,
      warnings,
      infos,
      imageSamples: imageInfo.samples
    };
    APP.lastPrecheck = result;
    return result;
  }

  function updateDashboard(data) {
    const totalOptions = data.options || (data.radioGroups ? data.radioGroups * 4 : 0);
    const kpis = document.getElementById('gssf-kpis');
    if (kpis) kpis.innerHTML = `
      <div class="gssf-kpi kpi-questions"><i aria-hidden="true">${kpiIconSvg('questions')}</i><div><b>${escapeHtml(data.questions)}</b><span>questões</span></div><em></em></div>
      <div class="gssf-kpi kpi-options"><i aria-hidden="true">${kpiIconSvg('options')}</i><div><b>${escapeHtml(totalOptions)}</b><span>alternativas</span></div><em></em></div>
      <div class="gssf-kpi kpi-images"><i aria-hidden="true">${kpiIconSvg('images')}</i><div><b>${escapeHtml(data.images)}</b><span>imagens</span></div><em></em></div>
      <div class="gssf-kpi kpi-sections"><i aria-hidden="true">${kpiIconSvg('sections')}</i><div><b>${escapeHtml(data.sections)}</b><span>seções</span></div><em></em></div>`;
    const status = document.getElementById('gssf-status');
    if (status) {
      const hasContent = Number(data.questions || 0) > 0 || Number(data.radioGroups || 0) > 0;
      status.className = hasContent ? 'gssf-status ok' : 'gssf-status loading';
      if ((data.mode || pageMode()) === 'visualização') {
        status.innerHTML = '<span class="gssf-status-icon">!</span><span><b>Você está na visualização.</b><small>Volte para a tela de edição do Forms.</small></span>';
        status.className = 'gssf-status warn';
      } else if (hasContent && isActuallyEditingQuestion()) {
        status.className = 'gssf-status info';
        status.innerHTML = '<span class="gssf-status-icon">✎</span><span><b>Editando questão<span class="gssf-dots"><i>.</i><i>.</i><i>.</i></span></b><small>Leitura pausada durante a edição.</small></span>';
      } else if (hasContent) {
        status.innerHTML = `<span class="gssf-status-icon">✓</span><span><b>Formulário carregado.</b><small>Última leitura: ${formatReadTime(data.generatedAt)}</small></span>`;
      } else {
        status.className = 'gssf-status loading';
        status.innerHTML = '<span class="gssf-status-icon">⏳</span><span><b>Carregando formulário<span class="gssf-dots"><i>.</i><i>.</i><i>.</i></span></b><small>Aguardando o Forms montar as questões.</small></span>';
      }
    }
    updateAutoLog(data);
  }

  function updateAutoLog(data) {
    const out = document.getElementById('gssf-log');
    if (!out) return;
    const meaningful = data.questions || data.images || data.sections || data.radioGroups;
    const message = meaningful
      ? `Formulário carregado.\nÚltima leitura: ${formatReadTime(data.generatedAt)}`
      : 'Carregando formulário...';
    const current = out.textContent || '';
    if (!current || /Análise automática:|Aguardando o Forms carregar/.test(current)) log(message, false);
  }

  function auditLooksTransient(audit) {
    if (!audit || !APP.lastAudit || !APP.lastAudit.questions?.length) return false;
    const lastCount = APP.lastAudit.questions.length;
    const currentCount = audit.questions?.length || 0;
    const numberingProblems = (audit.problems || []).filter((p) => /Numeração fora da ordem/i.test(p)).length;
    const noOptionProblems = (audit.problems || []).filter((p) => /Sem alternativas/i.test(p)).length;
    if (numberingProblems >= 5) return true;
    if (lastCount >= 10 && currentCount > 0 && currentCount < lastCount - 1) return true;
    if (lastCount >= 10 && noOptionProblems >= Math.ceil(lastCount / 2)) return true;
    return false;
  }

  function dataFromAudit(audit) {
    const questions = audit?.questions || [];
    return {
      generatedAt: audit?.generatedAt || new Date().toLocaleString('pt-BR'),
      url: audit?.url || location.href,
      title: audit?.title || getFormTitle() || document.title,
      mode: audit?.mode || pageMode(),
      questions: questions.length,
      options: questions.reduce((sum, q) => sum + (q.totalOptions || 0), 0),
      radioGroups: audit?.radioGroups || questions.length,
      images: audit?.images || 0,
      sections: audit?.sections || 0,
      emptyModels: questions.filter((q) => q.emptyModel).length,
      numbers: questions.map((q) => q.number).filter(Boolean),
      missingNumbers: [],
      warnings: [],
      infos: []
    };
  }
