  // O histórico guarda conteúdo autoral, não controles ou respostas de alunos.
  const GSSF_HISTORY_STATE = { active: false, busy: false, panel: null };

  function questionHistoryIdentity(block, number) {
    const stable = block?.matches?.('[id^="QuestionId_"]') ? block : block?.querySelector?.('[id^="QuestionId_"]');
    if (stable?.id) return `id:${stable.id}`;
    for (const name of ['data-question-id', 'data-item-id']) {
      const value = block?.getAttribute?.(name) || block?.querySelector?.(`[${name}]`)?.getAttribute(name);
      if (value && value.length <= 200) return `${name}:${value}`;
    }
    // Uma posição não identifica uma questão após inserção, exclusão ou reordenação.
    return null;
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
    if (!GSSF_HISTORY_STATE.active || GSSF_HISTORY_STATE.busy) return;
    if (pageMode() === 'visualização' || APP.busy || APP.analysisRunning) {
      toast('Aguarde o término da operação e use a tela de edição para gravar.'); return;
    }
    const button = document.getElementById('gssf-save-history');
    const status = document.getElementById('gssf-history-status');
    const form = currentFormsDocumentKey();
    const revision = APP.questionContentRevision || 0;
    const counts = { saved: 0, unchanged: 0, skipped: 0, failed: 0 };
    GSSF_HISTORY_STATE.busy = true;
    if (button) { button.disabled = true; button.textContent = 'Gravando histórico…'; }
    if (status) status.textContent = 'Gravando as questões carregadas. Aguarde sem editar o formulário.';
    try {
      const sequential = collectQuestionBlocks();
      const listed = getQuestionBlocksFromList();
      const blocks = listed.length > sequential.length ? listed : sequential;
      if (!blocks.length) throw new Error('Nenhuma questão carregada para gravar.');
      for (let index = 0; index < blocks.length; index++) {
        if (!GSSF_HISTORY_STATE.active || currentFormsDocumentKey() !== form || (APP.questionContentRevision || 0) !== revision) {
          counts.skipped += blocks.length - index; break;
        }
        const block = blocks[index];
        const number = questionHistoryEditedNumber(block) || index + 1;
        const identity = questionHistoryIdentity(block, number);
        const content = questionHistorySnapshot(block, number);
        if (!identity || !content || questionHistoryLooksTransient(content, Boolean(block.querySelector('[role="radiogroup"]')), Boolean(block.querySelector('[contenteditable="true"], [role="textbox"]')))) {
          counts.skipped++; continue;
        }
        try {
          const result = await questionHistoryRequest('capture', identity, { content, form });
          if (result.saved) counts.saved++; else counts.unchanged++;
        } catch (error) {
          counts.failed++;
          reportNonFatalError('historico:captura-manual', error, { number });
        }
      }
      const message = `${counts.saved} novas versões; ${counts.unchanged} sem alterações; ${counts.skipped} não gravadas; ${counts.failed} falhas.`;
      if (status) status.textContent = message + (counts.skipped || counts.failed ? ' Confira o formulário e clique em gravar novamente quando estiver pronto.' : ' Gravação concluída.');
      toast(message);
      return counts;
    } catch (error) {
      if (status) status.textContent = `Não foi possível gravar: ${error.message}`;
      toast(`Histórico: ${error.message}`);
    } finally {
      GSSF_HISTORY_STATE.busy = false;
      if (button) { button.disabled = false; button.textContent = 'Gravar histórico agora'; }
    }
  }

  function closeQuestionHistory() {
    GSSF_HISTORY_STATE.panel?.remove(); GSSF_HISTORY_STATE.panel = null;
  }

  async function exportQuestionHistory() {
    const rows = [];
    let after = null;
    let size = 0;
    for (;;) {
      const page = await questionHistoryRequest('exportPage', 'all', { after });
      if (!page) return rows;
      size += JSON.stringify(page.row).length;
      if (size > 32_000_000) throw new Error('Histórico maior que 32 MB. O backup não foi gerado; nenhum dado foi apagado.');
      rows.push(page.row); after = page.after;
    }
  }

  async function openQuestionHistory(block, number, savedQuestion = '') {
    closeQuestionHistory();
    const question = savedQuestion || questionHistoryIdentity(block, number);
    if (!question) { toast('O Forms ainda não expôs a identidade desta questão. Tente após sair da edição.'); return; }
    const overlay = document.createElement('div'); overlay.className = 'gssf-history-overlay';
    const dialog = document.createElement('section'); dialog.className = 'gssf-history-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', `Histórico da questão ${number}`);
    const heading = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = question.startsWith('number:') ? `Histórico antigo · posição ${number}` : `Histórico · questão ${number}`;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Fechar'; close.addEventListener('click', closeQuestionHistory);
    heading.append(title, close);
    const summary = document.createElement('p'); summary.className = 'gssf-history-summary'; summary.textContent = 'Carregando versões locais…';
    const list = document.createElement('div'); list.className = 'gssf-history-list';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'gssf-history-clear'; clear.textContent = 'Apagar todo o histórico desta questão';
    const navigation = document.createElement('div');
    const previous = document.createElement('button'); previous.textContent = 'Mais recentes'; previous.type = 'button';
    const next = document.createElement('button'); next.textContent = 'Mais antigas'; next.type = 'button';
    navigation.append(previous, next);
    let before = null;
    let nextBefore = null;
    const pages = [];
    dialog.append(heading, summary, list, navigation, clear); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeQuestionHistory(); });
    GSSF_HISTORY_STATE.panel = overlay;
    const render = async () => {
      try {
        const page = await questionHistoryRequest('listPage', question, { before });
        const versions = page.versions;
        nextBefore = page.before;
        previous.disabled = !pages.length; next.disabled = !page.more;
        if (GSSF_HISTORY_STATE.panel !== overlay) return;
        summary.textContent = versions.length ? `Página ${pages.length + 1} · até 5 versões por página · salvas neste navegador` : 'Nenhuma versão salva nesta página.';
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
    previous.addEventListener('click', async () => { if (!pages.length) return; before = pages.pop(); await render(); });
    next.addEventListener('click', async () => { if (next.disabled) return; pages.push(before); before = nextBefore; await render(); });
    clear.addEventListener('click', async () => {
      if (!confirm(`Apagar todas as versões da questão ${number}?`)) return;
      try { await questionHistoryRequest('clear', question); before = null; pages.length = 0; await render(); }
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
        button.textContent = `${item.question.startsWith('number:') ? 'Histórico antigo por posição · ' : ''}${item.lastPrompt || item.question} · ${item.count} versão(ões)`;
        button.addEventListener('click', () => openQuestionHistory(null, item.number || item.question.replace(/^number:/, ''), item.question));
        list.appendChild(button);
      });
    } catch (error) { summary.textContent = error.message; }
    close.focus();
  }

  function startQuestionHistory() {
    GSSF_HISTORY_STATE.active = true;
  }

  function stopQuestionHistory() {
    GSSF_HISTORY_STATE.active = false;
    closeQuestionHistory();
  }
