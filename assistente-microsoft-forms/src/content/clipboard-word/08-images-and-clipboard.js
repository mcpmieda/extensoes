

  function copyWordClipboardStyleBlock() {
    return '<style>' +
      'body,article,div,p,li,.gssf-copy-question{margin-top:0!important;margin-bottom:0!important;mso-margin-top-alt:0cm!important;mso-margin-bottom-alt:0cm!important;line-height:normal!important;mso-line-height-rule:auto;}' +
      '.gssf-word-math-formula-row{text-align:left!important;margin:0!important;line-height:normal!important;page-break-inside:avoid;}' +
      '.gssf-word-option-letter{font-family:Arial,Segoe UI,sans-serif!important;font-style:normal!important;font-weight:normal!important;}' +
      '.gssf-word-math-formula-body,.gssf-word-mathml,.gssf-word-math-body{display:inline-block!important;text-align:left!important;vertical-align:middle!important;margin:0!important;}' +
      '.gssf-word-math-formula-row math{text-align:left!important;margin:0!important;}' +
      '[data-gssf-copy-block-layout="1"]{display:block!important;margin-top:0!important;margin-bottom:0!important;line-height:normal!important;}' +
      '[data-gssf-copy-title-blocks]>*{display:block!important;line-height:normal!important;margin-top:0!important;margin-bottom:0!important;}' +
      '[data-gssf-copy-real-block="1"]{display:block!important;line-height:normal!important;margin-top:0!important;margin-bottom:0!important;}' +
      '.gssf-word-title-line{display:block!important;margin:0!important;padding:0!important;line-height:normal!important;mso-margin-top-alt:0cm!important;mso-margin-bottom-alt:0cm!important;mso-line-height-rule:auto;}' +
      '</style>';
  }

  function htmlPlainFromContainer(container) {
    preserveQuestionTitleVisualBlocks(container);
    preserveCopyLineBreaks(container);
    const html = '<!doctype html><html><head><meta charset="utf-8">' + copyWordClipboardStyleBlock() + '</head><body>' + container.innerHTML + '</body></html>';
    const plain = cleanClipboardPlainText(container.innerText || container.textContent || '');
    return { html, plain };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao converter imagem.'));
      reader.readAsDataURL(blob);
    });
  }

  function fetchImageThroughBackground(src) {
    return new Promise((resolve, reject) => {
      let timer;
      const fail = (error) => { clearTimeout(timer); reject(error); };
      try {
        requireExtensionContext();
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
          fail(new Error('Background indisponível para buscar imagem.'));
          return;
        }
        timer = setTimeout(() => fail(new Error('A busca da imagem excedeu o prazo. Tente novamente.')), 30000);
        chrome.runtime.sendMessage({ type: 'GSSF_FETCH_IMAGE', url: src }, (response) => {
          clearTimeout(timer);
          try {
            const runtimeError = chrome.runtime.lastError;
            requireExtensionContext();
            if (runtimeError) {
              fail(new Error(runtimeError.message || 'Falha no background.'));
              return;
            }
            if (response?.ok && response.dataUrl) resolve(response.dataUrl);
            else fail(new Error(response?.error || 'Background não retornou imagem.'));
          } catch (error) { fail(error); }
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  async function imageUrlToDataUrl(src) {
    if (!src || /^data:/i.test(src)) return src || '';
    if (/^blob:/i.test(src)) {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Blob de imagem não carregado: ${response.status}`);
      return await blobToDataUrl(await response.blob());
    }
    try {
      let response;
      try {
        response = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      } catch (_) {
        response = await fetch(src, { mode: 'cors', credentials: 'include', cache: 'force-cache' });
      }
      if (!response.ok) throw new Error(`Imagem não carregada: ${response.status}`);
      const blob = await response.blob();
      return await blobToDataUrl(blob);
    } catch (error) {
      return await fetchImageThroughBackground(src);
    }
  }

  function copyImageCache() {
    if (!APP.copyImageCache || APP.copyImageCache.size > 180) APP.copyImageCache = new Map();
    return APP.copyImageCache;
  }

  function copyImageSourceFromClone(img) {
    const src = img?.getAttribute?.('data-gssf-src') || img?.currentSrc || img?.src || img?.getAttribute?.('src') || img?.getAttribute?.('data-src') || '';
    if (!src) return '';
    try { return new URL(src, location.href).href; } catch (_) { return src; }
  }

  async function getCopyImageDataUrl(src) {
    if (!src || /^data:/i.test(src)) return src || '';
    const cache = copyImageCache();
    const cached = cache.get(src);
    if (cached) return await cached;
    const promise = imageUrlToDataUrl(src).catch((error) => {
      try { cache.delete(src); } catch (_) {}
      throw error;
    });
    cache.set(src, promise);
    return await promise;
  }

  async function inlineImagesAsDataUris(container, progressId = 'copy') {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (!imgs.length) return { total: 0, converted: 0, failed: 0, cached: 0 };
    let converted = 0;
    let failed = 0;
    let cached = 0;
    let done = 0;
    let cursor = 0;
    const concurrency = Math.min(4, Math.max(1, imgs.length));

    async function worker() {
      while (cursor < imgs.length) {
        requireExtensionContext();
        const index = cursor;
        cursor += 1;
        const img = imgs[index];
        const src = copyImageSourceFromClone(img);
        if (!src) {
          done += 1;
          continue;
        }
        setProgress(progressId, 60 + Math.round((done / Math.max(1, imgs.length)) * 12), `Preparando imagens para o Word... ${done + 1}/${imgs.length}`);
        try {
          const hadCache = Boolean(copyImageCache().get(src));
          const dataUrl = await getCopyImageDataUrl(src);
          if (dataUrl) {
            img.setAttribute('src', dataUrl);
            img.removeAttribute('data-gssf-src');
            img.removeAttribute('crossorigin');
            converted += /^data:/i.test(dataUrl) ? 1 : 0;
            if (hadCache) cached += 1;
          }
        } catch (error) {
          if (isInvalidExtensionContext(error)) { APP.extensionContextLost = true; throw error; }
          console.warn('Não consegui embutir imagem; mantendo link original:', src, error);
          img.setAttribute('src', src);
          failed += 1;
        }
        done += 1;
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    setProgress(progressId, 72, `Imagens preparadas... ${converted}/${imgs.length}`);
    return { total: imgs.length, converted, failed, cached };
  }

  async function waitForTempImagesDecoded(container, progressId = 'copy') {
    const imgs = Array.from(container.querySelectorAll('img'));
    let ready = 0;
    for (let i = 0; i < imgs.length; i += 1) {
      const img = imgs[i];
      try { img.loading = 'eager'; img.decoding = 'sync'; } catch (_) {}
      const src = img.getAttribute('src') || '';
      if (!src) continue;
      setProgress(progressId, 73 + Math.round((i / Math.max(1, imgs.length)) * 8), `Finalizando imagens... ${i + 1}/${imgs.length}`);
      try {
        if (img.decode) await Promise.race([img.decode(), sleep(520)]);
        else await Promise.race([new Promise((resolve) => { if (img.complete) resolve(); else { img.onload = resolve; img.onerror = resolve; } }), sleep(520)]);
      } catch (_) {}
      if (img.complete || /^data:/i.test(src)) ready += 1;
    }
    return ready;
  }

  function safeFileNamePart(value, fallback = 'arquivo') {
    const cleaned = normalizeText(value || fallback)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);
    return cleaned || fallback;
  }

  async function prepareCopyPayloadFromBlocks(blocks, progressId = 'copy', options = {}) {
    requireExtensionContext();
    const temp = buildClipboardContainerFromBlocks(blocks);
    document.body.appendChild(temp);
    try {
      await sleep(45);
      let wordMathResult = { changed: 0, failed: 0 };
      if (options?.wordDownload || options?.wordClipboard) {
        wordMathResult = await normalizeMathAlternativesForWordFormulas(temp, progressId);
        await sleep(25);
      }
      const inlineResult = await inlineImagesAsDataUris(temp, progressId);
      requireExtensionContext();
      const decodedImages = await waitForTempImagesDecoded(temp, progressId);
      await sleep(35);
      const { html, plain } = htmlPlainFromContainer(temp);
      const innerHtml = temp.innerHTML;
      const htmlImageCount = (html.match(/<img\b/gi) || []).length;
      const dataImageCount = (html.match(/src=["']data:image/gi) || []).length;
      return { html, innerHtml, plain, decodedImages, inlineResult, wordMathResult, htmlImageCount, dataImageCount };
    } finally { temp.remove(); }
  }

  async function copyBlocksToClipboard(blocks, range, expectedImages = 0) {
    const payload = await prepareCopyPayloadFromBlocks(blocks, 'copy', { wordClipboard: true });
    const selection = window.getSelection();
    let copied = false;
    let usedMethod = '';
    const { html, plain } = payload;
    requireExtensionContext();
    if (!copyImageCheckOk(payload, Math.max(Number(expectedImages || 0), Number(payload.inlineResult?.total || 0)))) {
      throw new Error('Não foi possível embutir todas as imagens. A cópia foi cancelada; tente novamente.');
    }

    // Preferimos gravar HTML diretamente no clipboard. Isso evita o problema do navegador
    // copiar só as imagens renderizadas/visíveis na seleção da página.
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })]);
        copied = true;
        usedMethod = 'clipboard-html';
      }
    } catch (error) {
      console.warn('Falha no clipboard HTML direto; tentando seleção temporária:', error);
    }

    if (!copied) {
      let temp = null;
      try {
        temp = document.createElement('div');
        temp.id = 'gssf-copy-source-selection';
        temp.setAttribute('contenteditable', 'true');
        temp.style.cssText = 'position:fixed;left:0;top:0;width:980px;max-width:980px;background:#fff;color:#000;opacity:.02;z-index:2147483645;pointer-events:none;padding:20px;font-family:Arial,Segoe UI,sans-serif;';
        temp.innerHTML = payload.innerHtml || '';
        document.body.appendChild(temp);
        const tempRange = document.createRange();
        tempRange.selectNodeContents(temp);
        selection.removeAllRanges();
        selection.addRange(tempRange);
        await sleep(70);
        copied = document.execCommand('copy');
        if (copied) usedMethod = 'selection-html';
      } catch (_) { copied = false; }
      finally { try { temp?.remove(); } catch (_) {} }
    }

    if (!copied) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(plain);
          copied = true;
          usedMethod = 'clipboard-text';
        }
      } catch (error) {
        console.warn('Falha no fallback de texto:', error);
      }
    }

    if (!copied && range) {
      try {
        selection.removeAllRanges();
        selection.addRange(range);
        await sleep(80);
        copied = document.execCommand('copy');
        if (copied) usedMethod = 'page-selection';
      } catch (_) { copied = false; }
    }

    return { copied, usedMethod, ...payload };
  }

  function copyImageCheckOk(copyResult, expectedImages) {
    if (!expectedImages) return true;
    const inline = copyResult?.inlineResult || {};
    const embedded = Number(copyResult?.dataImageCount || inline.converted || 0);
    const failed = Number(inline.failed || 0);
    return embedded >= expectedImages && failed === 0;
  }

  async function copyBlocksToClipboardWithImageSafety(blocks, expectedImages, progressId = 'copy') {
    let first = await copyBlocksToClipboard(blocks, null, expectedImages);
    if (!first?.copied || copyImageCheckOk(first, expectedImages)) return first;

    try {
      log('Conferência de imagens pediu reforço. Vou reconstruir a cópia uma vez antes de concluir.');
      await stepProgress(progressId, 84, 'Reforçando imagens para o Word...', 140);
      await sleep(180);
      const second = await copyBlocksToClipboard(blocks, null, expectedImages);
      if (second?.copied && (copyImageCheckOk(second, expectedImages) || !copyImageCheckOk(first, expectedImages))) {
        return { ...second, usedMethod: `${second.usedMethod || 'clipboard'}-retry` };
      }
    } catch (error) {
      if (isInvalidExtensionContext(error)) throw error;
      console.warn('Reforço de cópia com imagens falhou:', error);
    }
    return first;
  }
