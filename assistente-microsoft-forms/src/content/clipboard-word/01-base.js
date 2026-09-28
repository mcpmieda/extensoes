  // ===== 30-clipboard-word.js =====
// Fonte modular: clipboard word.
  async function tryPreview() {
    const alreadyPreview = pageMode() === 'visualização';
    if (alreadyPreview) return true;
    const buttons = [...exactLabel('visualizacao'), ...exactLabel('visualização'), ...exactLabel('preview')];
    if (buttons.length) {
      buttons[buttons.length - 1].click();
      await sleep(2600);
      return true;
    }
    return false;
  }

  function formsScroller() {
    return document.querySelector('#desktop-scroller') || document.querySelector('[data-automation-id="formRoot"]') || document.scrollingElement || document.documentElement;
  }

  async function scrollAll() {
    const scroller = formsScroller();
    let previous = -1;
    for (let i = 0; i < 70; i += 1) {
      const height = Math.max(scroller?.scrollHeight || 0, document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
      if (scroller && scroller !== document.documentElement && scroller !== document.body) scroller.scrollTop = height;
      window.scrollTo(0, height);
      await sleep(135);
      const current = Math.max(scroller?.scrollHeight || 0, document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
      if (current === previous) break;
      previous = current;
    }
    await sleep(250);
    if (scroller && scroller !== document.documentElement && scroller !== document.body) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
    await sleep(300);
  }

  async function waitForImagesReady(blocks, progressId = 'copy') {
    const images = [];
    blocks.forEach((block) => {
      Array.from(block.querySelectorAll('img')).forEach((img) => {
        if (meaningfulImage(img) && !images.includes(img)) images.push(img);
      });
    });
    if (!images.length) return 0;
    let ready = 0;
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      try { img.loading = 'eager'; } catch (_) {}
      try { img.decoding = 'sync'; } catch (_) {}
      try { img.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
      const src = img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src) {
        if (!img.getAttribute('src')) img.setAttribute('src', src);
        img.setAttribute('data-gssf-src', src);
      }
      const pct = 42 + Math.round((i / Math.max(1, images.length)) * 18);
      setProgress(progressId, pct, `Carregando imagens... ${i + 1}/${images.length}`);
      await Promise.race([
        new Promise((resolve) => {
          if (img.complete && (img.naturalWidth || img.naturalHeight)) return resolve(true);
          const done = () => resolve(true);
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }),
        sleep(550)
      ]);
      if (img.complete && (img.naturalWidth || img.naturalHeight)) ready += 1;
      await sleep(18);
    }
    return ready;
  }

  function fixClonedImagesForClipboard(container) {
    Array.from(container.querySelectorAll('img')).forEach((img) => {
      const src = img.getAttribute('data-gssf-src') || img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src) {
        img.setAttribute('src', src);
        img.setAttribute('data-gssf-src', src);
      }
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.setAttribute('loading', 'eager');
      img.setAttribute('decoding', 'sync');
      img.style.maxWidth = img.style.maxWidth || '100%';
      img.style.height = img.style.height || 'auto';
      img.style.objectFit = img.style.objectFit || 'contain';
    });
    container.querySelectorAll('script, style, noscript, #gssf-root, #gssf-modal, #gssf-toast, #gssf-fab, #gssf-work-overlay').forEach((el) => el.remove());
  }

  function isCopyUiText(text) {
    const t = normalizeText(text).replace(/[.:;]+$/g, '').trim();
    if (!t) return true;
    if (/^(opcao|opção)\s+(unica|única)$/.test(t)) return true;
    if (/^(varias|várias)\s+respostas?$/.test(t)) return true;
    if (/^insira\s+(o\s+)?(nome|titulo|título)\s+/.test(t)) return true;
    if (/^adicionar\s+(opcao|opção|alternativa|resposta)$/.test(t)) return true;
    if (/^pontos?:?$/.test(t)) return true;
    if (/^(obrigatoria|obrigatória|matematica|matemática)$/.test(t)) return true;
    if (/^(copiar|excluir|duplicar|mover|editar|remover)\s+(pergunta|questao|questão|opcao|opção)/.test(t)) return true;
    if (/^(resposta correta|mensagem para aqueles que escolherem|inserir, colar ou arrastar midia|inserir, colar ou arrastar mídia)/.test(t)) return true;
    return false;
  }

  function isCopyUserAuthoredTextElement(el) {
    if (!el) return false;
    try {
      return Boolean(el.closest?.('.text-format-content,[data-automation-id="questionTitle"] .text-format-content,[data-automation-id="questionChoiceOptionContainer"] .text-format-content,[role="textbox"],[contenteditable="true"]'));
    } catch (_) {
      return false;
    }
  }

  function stripCopyUiPhrases(text) {
    const value = String(text || '');
    if (!value) return '';

    // Limpeza segura: remove apenas rótulos reais da interface do Forms quando
    // aparecem isolados em uma linha/nó. Nunca remove esses termos de dentro
    // do conteúdo da prova, evitando perda de palavras como "ponto" em
    // alternativas ou enunciados. Exemplos preservados: "ponto de interseção",
    // "Opção única é...", "Resposta correta...", "Obrigatória", "Pontos:".
    const isStandaloneUiLine = (line) => {
      const t = normalizeText(line).replace(/[.:;]+$/g, '').trim();
      if (!t) return false;
      if (/^(opcao|opção)\s+(unica|única)$/.test(t)) return true;
      if (/^(varias|várias)\s+respostas?$/.test(t)) return true;
      if (/^adicionar\s+(opcao|opção|alternativa|resposta)$/.test(t)) return true;
      if (/^resposta\s+correta$/.test(t)) return true;
      if (/^(obrigatoria|obrigatória)$/.test(t)) return true;
      if (/^pontos?$/.test(t)) return true;
      return false;
    };

    if (!/[\r\n]/.test(value)) {
      return isStandaloneUiLine(value) ? '' : value;
    }

    return value
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((line) => !isStandaloneUiLine(line))
      .join('\n');
  }