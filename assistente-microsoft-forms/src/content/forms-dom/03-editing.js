

  function setTextLikeUser(el, value) {
    if (!el) return false;
    try { el.focus(); } catch (_) {}
    try { el.dispatchEvent(new FocusEvent('focus', { bubbles: true })); } catch (_) {}
    try {
      if ('value' in el) {
        const proto = Object.getPrototypeOf(el);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' })); } catch (_) {}
        return true;
      }
      if (el.isContentEditable || el.getAttribute?.('role') === 'textbox') {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
        try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: value })); } catch (_) {}
        let inserted = false;
        try { inserted = Boolean(document.execCommand?.('insertText', false, value)); } catch (_) { inserted = false; }
        if (!inserted || !normalizeText(el.textContent).includes(normalizeText(value).slice(0, 24))) {
          try { el.innerText = value; } catch (_) { el.textContent = value; }
        }
        try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value })); } catch (_) { el.dispatchEvent(new Event('input', { bubbles: true })); }
        try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' })); } catch (_) {}
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (error) {
      reportNonFatalError('forms:escrever-texto', error, {
        tag: String(el?.tagName || '').toLowerCase(),
        role: String(el?.getAttribute?.('role') || ''),
        contentEditable: Boolean(el?.isContentEditable)
      });
    }
    return false;
  }

  function visibleCommitButtonLabel(el) {
    return normalizeText(`${textOf(el)} ${el?.getAttribute?.('aria-label') || ''} ${el?.getAttribute?.('title') || ''}`);
  }

  function looksLikeMathEditorOpen() {
    const bodyText = normalizeText(document.body?.innerText || '');
    return bodyText.includes('alternar para latex') || /\b(log|ln|sen|cos|tan)\b/.test(bodyText) || bodyText.includes('matematica') || bodyText.includes('matemática');
  }

  function mathCommitButtonNear(field) {
    if (!field) return null;
    const fr = field.getBoundingClientRect();
    const candidates = all('button, [role="button"], [aria-label], [title]').filter((el) => {
      if (!visible(el)) return false;
      if (el.closest?.('#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker')) return false;
      const label = visibleCommitButtonLabel(el);
      if (!/^(ok|feito|concluido|concluído)$/.test(label)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 18 || r.height < 16 || r.width > 140 || r.height > 80) return false;
      return Math.abs((r.top + r.height / 2) - (fr.top + fr.height / 2)) < 420 && Math.abs((r.left + r.width / 2) - (fr.left + fr.width / 2)) < 520;
    });
    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const ax = ar.left + ar.width / 2 - (fr.left + fr.width / 2);
      const ay = ar.top + ar.height / 2 - (fr.top + fr.height / 2);
      const bx = br.left + br.width / 2 - (fr.left + fr.width / 2);
      const by = br.top + br.height / 2 - (fr.top + fr.height / 2);
      return (ax * ax + ay * ay) - (bx * bx + by * by);
    })[0] || null;
  }

  function fireRealClickAt(x, y) {
    const target = document.elementFromPoint(Math.max(1, Math.min(window.innerWidth - 2, x)), Math.max(1, Math.min(window.innerHeight - 2, y)));
    if (!target || target.closest?.('#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker')) return false;
    try {
      ['pointerdown','mousedown','pointerup','mouseup','click'].forEach((type) => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      });
      return true;
    } catch (_) { return false; }
  }

  async function commitEditedOptionField(field, block = null) {
    if (!field) return;
    try { field.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    try { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body })); } catch (_) {}
    try { field.blur?.(); } catch (_) {}
    await sleep(90);
    const ok = mathCommitButtonNear(field);
    if (ok) {
      fireRealClick(ok);
      await sleep(220);
    }
    const r = field.getBoundingClientRect();
    const br = (block || field.closest?.('[data-automation-id="questionDesignerCard"], [data-automation-id="questionWrapper"], [role="group"]'))?.getBoundingClientRect?.();
    const points = [];
    if (br) {
      points.push([Math.min(window.innerWidth - 20, br.right - 24), Math.max(20, br.top + 28)]);
      points.push([Math.max(20, br.left + 24), Math.max(20, r.top - 26)]);
      points.push([Math.max(20, br.left + 24), Math.min(window.innerHeight - 20, br.bottom - 24)]);
    }
    points.push([Math.min(window.innerWidth - 20, r.right + 80), Math.max(20, r.top - 24)]);
    for (const [x, y] of points) {
      const el = document.elementFromPoint(Math.max(1, Math.min(window.innerWidth - 2, x)), Math.max(1, Math.min(window.innerHeight - 2, y)));
      if (el && el !== field && !field.contains?.(el) && !el.closest?.('#gssf-root,#gssf-fab,#gssf-toast,#gssf-modal,#gssf-confirm-modal,#gssf-work-overlay,#gssf-question-focus-marker')) {
        fireRealClickAt(x, y);
        await sleep(180);
        break;
      }
    }
    try { document.activeElement?.blur?.(); } catch (_) {}
  }

  async function waitForFormsAutosaveAfterEdits(timeout = GSSF_TIMING.formsAutosaveMs) {
    const started = Date.now();
    let sawSaving = false;
    while (Date.now() - started < timeout) {
      const topText = normalizeText(Array.from(document.querySelectorAll('header, [role="banner"], [data-automation-id]')).slice(0, 40).map(textOf).join(' '));
      if (topText.includes('salvando') || topText.includes('saving')) sawSaving = true;
      if ((topText.includes('salvo') || topText.includes('saved')) && !topText.includes('salvando') && !topText.includes('saving') && (sawSaving || Date.now() - started > 900)) return true;
      await sleep(260);
    }
    return false;
  }

  function findButtonByLabels(labels) {
    const wanted = labels.map(normalizeText);
    return all('button, [role="button"], [aria-label], [title]').find((el) => {
      if (el.closest('#gssf-root,#gssf-modal,#gssf-toast,#gssf-fab,#gssf-work-overlay')) return false;
      const label = normalizeText(`${textOf(el)} ${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`);
      return wanted.some((w) => label === w || label.includes(w));
    });
  }

  async function scrollBlockIntoView(block) {
    if (!block) return;
    const scroller = formsScroller();
    try {
      if (scroller && scroller !== document.documentElement && scroller !== document.body) {
        const sr = scroller.getBoundingClientRect();
        const br = block.getBoundingClientRect();
        const offset = Math.max(70, Math.round((scroller.clientHeight - Math.min(br.height, scroller.clientHeight * 0.65)) / 2));
        scroller.scrollTop = Math.max(0, scroller.scrollTop + br.top - sr.top - offset);
      }
      block.scrollIntoView({ block: 'center', inline: 'center' });
    } catch (_) {}
    await sleep(420);
  }

  async function clickQuestionForInsertion(number) {
    const blocks = collectQuestionBlocks();
    const target = blocks.find((block) => questionNumberFromBlock(block) === number);
    if (!target) return null;
    await scrollBlockIntoView(target);
    try { target.click(); } catch (_) {}
    return target;
  }