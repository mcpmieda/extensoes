  // O histórico guarda conteúdo autoral, não controles ou respostas de alunos.
  const GSSF_HISTORY_STATE = { active: false, busy: false, queued: false, initialCaptured: false, fullScan: false, structural: false, questionCount: 0, dirtyNumbers: new Set(), targetNumbers: new WeakMap(), buttons: new Map(), globalButton: null, panel: null, refresh: null, scroll: null, resize: null, positionFrame: null };

  function questionHistoryIdentity(block, number) {
    for (let node = block, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      for (const name of ['data-question-id', 'data-item-id', 'data-id', 'id']) {
        const value = node.getAttribute?.(name);
        if (value && value.length <= 200 && !/^(questionWrapper|questionDesignerCard|question-list)$/i.test(value)) return `${name}:${value}`;
      }
    }
    return `number:${number}`;
  }

  function questionHistorySnapshot(block, number) {
    const group = block.querySelector('[role="radiogroup"]') || block;
    const containers = findOptionContainers(group);
    const options = containers.map((option) => ({
      text: optionTextForAudit(option), correct: isCorrectOption(option),
      images: Array.from(option.querySelectorAll('img')).filter(meaningfulImage).map((img) => ({ src: imageSourceForCopy(img), alt: img.alt || '' }))
    }));
    if (!options.length) optionTextFieldsInBlock(block).forEach((field) => options.push({ text: optionCurrentText(field), correct: false, images: [] }));
    const clone = block.cloneNode(true);
    sanitizeCopyClone(clone);
    const content = {
      number,
      prompt: cleanText(extractQuestionPrompt(block, group).replace(/Insira o título da pergunta aqui/gi, '')),
      text: cleanText((clone.textContent || '').replace(/Insira o título da pergunta aqui/gi, '')).slice(0, 200000),
      options,
      images: Array.from(block.querySelectorAll('img')).filter(meaningfulImage).map((img) => ({ src: imageSourceForCopy(img), alt: img.alt || '' })),
      math: Array.from(block.querySelectorAll('math,[data-mathml],[data-latex],[data-math]')).map((node) => node.outerHTML.slice(0, 20000)).slice(0, 40)
    };
    if (!content.prompt && !content.text && !content.options.length && !content.images.length) return null;
    return content;
  }

  function questionHistoryRequest(action, question, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GSSF_QUESTION_HISTORY', action, form: currentFormsDocumentKey(), question, ...extra }, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.ok) reject(new Error(error?.message || response?.error || 'Histórico indisponível.'));
        else resolve(response.result);
      });
    });
  }

  function positionQuestionHistoryButtons() {
    for (const [button, block] of GSSF_HISTORY_STATE.buttons) {
      if (!block.isConnected) { button.remove(); GSSF_HISTORY_STATE.buttons.delete(button); continue; }
      const rect = block.getBoundingClientRect();
      const shown = rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.left >= 0;
      button.hidden = !shown;
      if (shown) { button.style.top = `${Math.max(8, rect.top + 12)}px`; button.style.left = `${Math.max(2, rect.left - 34)}px`; }
    }
  }

  function scheduleQuestionHistoryButtonPosition() {
    if (GSSF_HISTORY_STATE.positionFrame != null) return;
    GSSF_HISTORY_STATE.positionFrame = requestAnimationFrame(() => {
      GSSF_HISTORY_STATE.positionFrame = null;
      if (GSSF_HISTORY_STATE.active) positionQuestionHistoryButtons();
    });
  }

  function refreshQuestionHistoryButtons(blocks = collectQuestionBlocks()) {
    if (!GSSF_HISTORY_STATE.active) return;
    const seen = new Set(blocks);
    const existing = new Map(Array.from(GSSF_HISTORY_STATE.buttons, ([button, block]) => [block, button]));
    for (const [button, block] of GSSF_HISTORY_STATE.buttons) {
      if (!seen.has(block)) { button.remove(); GSSF_HISTORY_STATE.buttons.delete(button); }
    }
    blocks.forEach((block, index) => {
      const number = questionNumberFromBlock(block) || index + 1;
      let button = existing.get(block);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button'; button.className = 'gssf-history-button';
        document.body.appendChild(button);
        GSSF_HISTORY_STATE.buttons.set(button, block);
      }
      if (button.dataset.gssfQuestionNumber !== String(number)) {
        button.dataset.gssfQuestionNumber = String(number);
        button.textContent = '◷'; button.title = `Histórico da questão ${number}`;
        button.setAttribute('aria-label', `Abrir histórico da questão ${number}`);
        button.onclick = (event) => { event.preventDefault(); event.stopPropagation(); openQuestionHistory(block, number); };
      }
    });
    positionQuestionHistoryButtons();
  }

  function questionHistoryLooksTransient(content, singleChoice, editing) {
    return ((singleChoice || editing) && !content.options.length)
      || ((singleChoice || editing) && content.options.length >= 3 && content.options.every((option) => option.correct));
  }

  function questionHistoryEditedNumber(block) {
    const title = block?.querySelector?.('[aria-label*="Título da pergunta" i], [aria-label*="Titulo da pergunta" i], [aria-label*="Question title" i]');
    const label = title?.getAttribute?.('aria-label') || '';
    const match = label.match(/(?:t[ií]tulo da pergunta|question title)\s*(\d{1,3})\b/i);
    return match ? Number(match[1]) : questionNumberFromBlock(block);
  }

  async function captureQuestionHistory() {
    if (!GSSF_HISTORY_STATE.active || GSSF_HISTORY_STATE.busy || pageMode() === 'visualização') return;
    if (Date.now() < APP.editingUntil) {
      clearTimeout(GSSF_HISTORY_STATE.refresh);
      GSSF_HISTORY_STATE.refresh = setTimeout(captureQuestionHistory, Math.max(500, APP.editingUntil - Date.now() + 300));
      return;
    }
    GSSF_HISTORY_STATE.busy = true;
    try {
      const sequentialBlocks = collectQuestionBlocks();
      const listedBlocks = getQuestionBlocksFromList();
      const blocks = listedBlocks.length > sequentialBlocks.length ? listedBlocks : sequentialBlocks;
      if (!blocks.length) return;
      const incomplete = GSSF_HISTORY_STATE.initialCaptured && blocks.length < GSSF_HISTORY_STATE.questionCount;
      const fullScan = !GSSF_HISTORY_STATE.initialCaptured || GSSF_HISTORY_STATE.fullScan || incomplete || (GSSF_HISTORY_STATE.structural && blocks.length !== GSSF_HISTORY_STATE.questionCount);
      const dirtyNumbers = new Set(GSSF_HISTORY_STATE.dirtyNumbers);
      const editing = isActuallyEditingQuestion();
      GSSF_HISTORY_STATE.fullScan = false;
      GSSF_HISTORY_STATE.structural = false;
      GSSF_HISTORY_STATE.dirtyNumbers.clear();
      refreshQuestionHistoryButtons(blocks);
      for (let index = 0; index < blocks.length; index += 1) {
        if (!GSSF_HISTORY_STATE.active) break;
        const block = blocks[index];
        const number = questionNumberFromBlock(block) || index + 1;
        if (!fullScan && !dirtyNumbers.has(number)) continue;
        const content = questionHistorySnapshot(block, number);
        if (content) {
          const blockEditing = editing || Boolean(block.querySelector('[contenteditable="true"], [role="textbox"]'));
          if (questionHistoryLooksTransient(content, Boolean(block.querySelector('[role="radiogroup"]')), blockEditing)) {
            GSSF_HISTORY_STATE.dirtyNumbers.add(number);
            continue;
          }
          try { await questionHistoryRequest('capture', questionHistoryIdentity(block, number), { content }); }
          catch (error) { reportNonFatalError('historico:capturar-questao', error, { number }); }
        }
      }
      if (GSSF_HISTORY_STATE.active && fullScan && !incomplete) {
        GSSF_HISTORY_STATE.initialCaptured = true;
        GSSF_HISTORY_STATE.questionCount = blocks.length;
      }
    } catch (error) { reportNonFatalError('historico:capturar', error); }
    finally {
      GSSF_HISTORY_STATE.busy = false;
      if (GSSF_HISTORY_STATE.queued) { GSSF_HISTORY_STATE.queued = false; queueQuestionHistoryCapture(); }
    }
  }

  function queueQuestionHistoryCapture(target = null, structural = false) {
    if (!GSSF_HISTORY_STATE.active) return;
    if (structural) { GSSF_HISTORY_STATE.structural = true; GSSF_HISTORY_STATE.targetNumbers = new WeakMap(); }
    if (target) {
      const element = target.nodeType === 1 ? target : target.parentElement;
      let number = element && GSSF_HISTORY_STATE.targetNumbers.get(element);
      if (!number) {
        const wrapper = element?.closest?.('[data-automation-id="questionWrapper"], [data-automation-id="questionDesignerCard"]');
        const block = wrapper || (element && collectQuestionBlocks().find((candidate) => candidate.contains(element)));
        number = questionHistoryEditedNumber(block);
        if (GSSF_HISTORY_STATE.initialCaptured && number > GSSF_HISTORY_STATE.questionCount) number = 0;
        if (number > 0) GSSF_HISTORY_STATE.targetNumbers.set(element, number);
      }
      if (number > 0) GSSF_HISTORY_STATE.dirtyNumbers.add(number);
      else GSSF_HISTORY_STATE.fullScan = true;
    }
    if (GSSF_HISTORY_STATE.initialCaptured && !GSSF_HISTORY_STATE.fullScan && !GSSF_HISTORY_STATE.structural && !GSSF_HISTORY_STATE.dirtyNumbers.size) return;
    if (GSSF_HISTORY_STATE.busy) { GSSF_HISTORY_STATE.queued = true; return; }
    clearTimeout(GSSF_HISTORY_STATE.refresh);
    const delay = GSSF_HISTORY_STATE.initialCaptured ? Math.max(1800, APP.editingUntil - Date.now() + 300) : 750;
    GSSF_HISTORY_STATE.refresh = setTimeout(captureQuestionHistory, delay);
  }

  function closeQuestionHistory() {
    GSSF_HISTORY_STATE.panel?.remove(); GSSF_HISTORY_STATE.panel = null;
  }

  async function openQuestionHistory(block, number, savedQuestion = '') {
    closeQuestionHistory();
    const question = savedQuestion || questionHistoryIdentity(block, number);
    const overlay = document.createElement('div'); overlay.className = 'gssf-history-overlay';
    const dialog = document.createElement('section'); dialog.className = 'gssf-history-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', `Histórico da questão ${number}`);
    const heading = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = `Histórico · questão ${number}`;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Fechar'; close.addEventListener('click', closeQuestionHistory);
    heading.append(title, close);
    const summary = document.createElement('p'); summary.className = 'gssf-history-summary'; summary.textContent = 'Carregando versões locais…';
    const list = document.createElement('div'); list.className = 'gssf-history-list';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'gssf-history-clear'; clear.textContent = 'Apagar todo o histórico desta questão';
    dialog.append(heading, summary, list, clear); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeQuestionHistory(); });
    GSSF_HISTORY_STATE.panel = overlay;
    const render = async () => {
      try {
        const versions = await questionHistoryRequest('list', question);
        if (GSSF_HISTORY_STATE.panel !== overlay) return;
        summary.textContent = versions.length ? `${versions.length} versão(ões) salvas neste navegador` : 'Nenhuma versão salva para esta questão.';
        clear.hidden = versions.length === 0;
        list.replaceChildren();
        versions.forEach((version) => {
          const card = document.createElement('article'); card.className = 'gssf-history-version';
          const bar = document.createElement('div'); bar.className = 'gssf-history-version-bar';
          const label = document.createElement('strong'); label.textContent = `Versão ${version.sequence} · ${new Date(version.capturedAt).toLocaleString('pt-BR')}`;
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Apagar';
          remove.addEventListener('click', async () => {
            if (!confirm(`Apagar a versão ${version.sequence} desta questão?`)) return;
            try { await questionHistoryRequest('deleteVersion', question, { sequence: version.sequence }); await render(); }
            catch (error) { summary.textContent = error.message; }
          });
          bar.append(label, remove);
          const prompt = document.createElement('p'); prompt.textContent = version.content?.prompt || version.content?.text || '(Sem enunciado textual)';
          card.append(bar, prompt);
          if (version.content?.options?.length) {
            const options = document.createElement('ol'); options.type = 'A';
            version.content.options.forEach((option) => { const item = document.createElement('li'); item.textContent = `${option.text || '(sem texto)'}${option.correct ? ' ✓ correta' : ''}`; options.appendChild(item); });
            card.appendChild(options);
          }
          if (version.content?.images?.length) {
            const media = document.createElement('div'); media.className = 'gssf-history-media';
            version.content.images.forEach((item) => {
              const saved = version.media?.[item.src];
              if (saved) { const image = document.createElement('img'); image.src = saved; image.alt = item.alt || 'Imagem da questão'; media.appendChild(image); }
              else { const note = document.createElement('p'); note.textContent = `Imagem não copiada: ${item.alt || item.src}`; media.appendChild(note); }
            });
            card.appendChild(media);
          }
          const details = document.createElement('details');
          const caption = document.createElement('summary'); caption.textContent = 'Ver todo o texto e fórmulas';
          const body = document.createElement('pre'); body.textContent = [version.content?.text || '', ...(version.content?.math || [])].join('\n\n');
          details.append(caption, body); card.appendChild(details); list.appendChild(card);
        });
      } catch (error) { summary.textContent = error.message; }
    };
    clear.addEventListener('click', async () => {
      if (!confirm(`Apagar todas as versões da questão ${number}?`)) return;
      try { await questionHistoryRequest('clear', question); await render(); }
      catch (error) { summary.textContent = error.message; }
    });
    await render(); close.focus();
  }

  async function openFormQuestionHistory() {
    closeQuestionHistory();
    const overlay = document.createElement('div'); overlay.className = 'gssf-history-overlay';
    const dialog = document.createElement('section'); dialog.className = 'gssf-history-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', 'Histórico do formulário');
    const heading = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = 'Histórico do formulário';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Fechar'; close.addEventListener('click', closeQuestionHistory);
    heading.append(title, close);
    const summary = document.createElement('p'); summary.className = 'gssf-history-summary'; summary.textContent = 'Carregando questões…';
    const list = document.createElement('div'); list.className = 'gssf-history-list';
    dialog.append(heading, summary, list); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeQuestionHistory(); });
    GSSF_HISTORY_STATE.panel = overlay;
    try {
      const questions = await questionHistoryRequest('listForm', 'form-index');
      if (GSSF_HISTORY_STATE.panel !== overlay) return;
      summary.textContent = questions.length ? `${questions.length} questão(ões) com versões salvas neste navegador, inclusive questões já apagadas do Forms.` : 'Nenhuma versão salva neste formulário.';
      const naturalOrder = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
      questions.sort((a, b) => naturalOrder.compare(a.lastPrompt || a.question, b.lastPrompt || b.question));
      questions.forEach((item) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'gssf-history-form-item';
        button.textContent = `${item.lastPrompt || item.question} · ${item.count} versão(ões)`;
        button.addEventListener('click', () => openQuestionHistory(null, item.question.replace(/^number:/, ''), item.question));
        list.appendChild(button);
      });
    } catch (error) { summary.textContent = error.message; }
    close.focus();
  }

  function startQuestionHistory() {
    GSSF_HISTORY_STATE.active = true;
    GSSF_HISTORY_STATE.initialCaptured = false;
    GSSF_HISTORY_STATE.fullScan = true;
    GSSF_HISTORY_STATE.structural = false;
    GSSF_HISTORY_STATE.questionCount = 0;
    GSSF_HISTORY_STATE.dirtyNumbers.clear();
    GSSF_HISTORY_STATE.targetNumbers = new WeakMap();
    const globalButton = document.createElement('button'); globalButton.type = 'button';
    globalButton.className = 'gssf-history-all-button'; globalButton.textContent = 'Histórico de questões';
    globalButton.addEventListener('click', openFormQuestionHistory);
    document.body.appendChild(globalButton); GSSF_HISTORY_STATE.globalButton = globalButton;
    GSSF_HISTORY_STATE.scroll = scheduleQuestionHistoryButtonPosition;
    GSSF_HISTORY_STATE.resize = scheduleQuestionHistoryButtonPosition;
    document.addEventListener('scroll', GSSF_HISTORY_STATE.scroll, true);
    window.addEventListener('resize', GSSF_HISTORY_STATE.resize);
  }

  function stopQuestionHistory() {
    GSSF_HISTORY_STATE.active = false; GSSF_HISTORY_STATE.queued = false;
    clearTimeout(GSSF_HISTORY_STATE.refresh);
    if (GSSF_HISTORY_STATE.positionFrame != null) cancelAnimationFrame(GSSF_HISTORY_STATE.positionFrame);
    GSSF_HISTORY_STATE.positionFrame = null;
    document.removeEventListener('scroll', GSSF_HISTORY_STATE.scroll, true);
    window.removeEventListener('resize', GSSF_HISTORY_STATE.resize);
    for (const button of GSSF_HISTORY_STATE.buttons.keys()) button.remove();
    GSSF_HISTORY_STATE.buttons.clear(); GSSF_HISTORY_STATE.globalButton?.remove(); GSSF_HISTORY_STATE.globalButton = null; closeQuestionHistory();
  }
