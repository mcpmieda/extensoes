

  function closeOpenMenus() {
    try { window.getSelection()?.removeAllRanges?.(); } catch (_) {}
    try { document.activeElement?.blur?.(); } catch (_) {}
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) {}
    try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) {}
  }

  async function clearFormsFocusArtifacts() {
    closeOpenMenus();
    await sleep(90);
    closeOpenMenus();
  }

  function dispatchHoverOn(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(1, Math.round(r.left + Math.min(r.width - 1, Math.max(1, r.width / 2))));
    const y = Math.max(1, Math.round(r.top + Math.min(r.height - 1, Math.max(1, r.height / 2))));
    ['pointerover', 'mouseover', 'mousemove'].forEach((type) => {
      try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y })); } catch (_) {}
    });
  }

  function sectionMenuCandidates(section) {
    if (!section) return [];
    const labelOk = (el) => {
      const label = normalizeText(`${textOf(el)} ${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`);
      return label.includes('mais opcoes') || label.includes('mais opções');
    };
    const inside = all('button, [role="button"], [aria-label], [title]', section).filter(labelOk);
    if (inside.length) return inside;
    const sr = section.getBoundingClientRect();
    const centerY = sr.top + sr.height / 2;
    return all('button, [role="button"], [aria-label], [title]').filter((el) => {
      if (el.closest('#gssf-root,#gssf-modal,#gssf-toast,#gssf-fab,#gssf-work-overlay')) return false;
      if (!labelOk(el)) return false;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      return y >= sr.top - 48 && y <= sr.bottom + 96;
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return Math.abs((ar.top + ar.height / 2) - centerY) - Math.abs((br.top + br.height / 2) - centerY);
    });
  }

  function fireRealClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    try {
      ['pointerdown','mousedown','pointerup','mouseup','click'].forEach((type) => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
      return true;
    } catch (_) {
      try { el.click(); return true; } catch (_) { return false; }
    }
  }

  function findBackToEditButtons() {
    return all('button, a, [role="button"]').filter((el) => {
      if (el.closest('#gssf-root,#gssf-modal,#gssf-toast,#gssf-fab,#gssf-work-overlay')) return false;
      const label = normalizeText(`${textOf(el)} ${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`);
      if (!/(^|\s)(voltar|back|editar|edit)(\s|$)/.test(label)) return false;
      const r = el.getBoundingClientRect();
      return r.top < Math.max(220, window.innerHeight * 0.35);
    }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  async function returnToEditIfPreview() {
    if (pageMode() !== 'visualização') return true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidates = findBackToEditButtons();
      if (candidates.length) fireRealClick(candidates[0]);
      else {
        try { history.back(); } catch (_) {}
      }
      await sleep(1200 + attempt * 450);
      if (pageMode() !== 'visualização') return true;
    }
    const status = document.getElementById('gssf-status');
    if (status) {
      status.className = 'gssf-status warn';
      status.innerHTML = '<span class="gssf-status-icon">!</span><span><b>Volte para a edição.</b><small>Use a tela de edição do Forms para continuar.</small></span>';
    }
    return false;
  }

  function isActuallyEditingQuestion() {
    if (pageMode() !== 'edição') return false;
    if (Date.now() < APP.editingUntil) return true;
    const active = document.activeElement;
    if (active && active !== document.body && !isIgnoredAppNode(active)) {
      const tag = (active.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || active.isContentEditable || active.getAttribute?.('role') === 'textbox') {
        return isQuestionActivityTarget(active, false);
      }
      if (isQuestionActivityTarget(active, false)) return true;
    }
    const editSignals = Array.from(document.querySelectorAll('button, [role="button"], [aria-label], [title]')).slice(0, 260).filter((el) => {
      if (isIgnoredAppNode(el)) return false;
      const label = normalizeText(`${textOf(el)} ${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`);
      return /duplicar pergunta|copiar pergunta|excluir pergunta|remover pergunta|mover pergunta|editar pergunta|adicionar opcao|adicionar opção|opcoes da pergunta|opções da pergunta/.test(label);
    });
    return editSignals.length >= 2;
  }

  function isQuestionActivityTarget(target, allowSlowFallback = false) {
    if (!target || !target.closest) return false;
    if (isIgnoredAppNode(target)) return false;
    if (target.closest('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"], [data-automation-id="questionContent"], [role="radiogroup"]')) return true;
    if (!allowSlowFallback) return false;
    try {
      return collectQuestionBlocks().some((block) => block && block.contains(target));
    } catch (_) {
      return false;
    }
  }

  function markQuestionEditing() {
    APP.editingUntil = Date.now() + 4200;
    const status = document.getElementById('gssf-status');
    if (status && pageMode() === 'edição') {
      status.className = 'gssf-status info';
      status.innerHTML = '<span class="gssf-status-icon">✎</span><span><b>Editando questão<span class="gssf-dots"><i>.</i><i>.</i><i>.</i></span></b><small>Leitura pausada durante a edição.</small></span>';
    }
  }

  function updateActionAvailability(data) {
    const dashboardSections = Number(document.querySelector('#gssf-kpis .gssf-kpi:nth-child(4) b')?.textContent || 0);
    const removeBtn = document.getElementById('gssf-remove-sections');
    if (removeBtn) removeBtn.disabled = APP.busy || !(Number(data?.sections || 0) || dashboardSections);
    if (!APP.busy && !Number(data?.sections || 0)) setProgress('sections', 0, '');
    const openOmr = document.getElementById('gssf-open-omr');
    if (openOmr) openOmr.disabled = APP.busy || !Number(data?.questions || 0);
    const lettersBtn = document.getElementById('gssf-insert-letters');
    if (lettersBtn) lettersBtn.disabled = APP.busy || !Number(data?.questions || 0);
    const removeLettersBtn = document.getElementById('gssf-remove-letters');
    if (removeLettersBtn) removeLettersBtn.disabled = APP.busy || !Number(data?.questions || 0);
    const capitalizeLettersBtn = document.getElementById('gssf-capitalize-alternatives');
    if (capitalizeLettersBtn) capitalizeLettersBtn.disabled = APP.busy || !Number(data?.questions || 0);
  }