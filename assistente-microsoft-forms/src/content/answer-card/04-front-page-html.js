

  function frontPageHtml(student) {
    if (state.customFront) return customPageHtml(state.customFront, 'front');
    const digits = rollDigits(student.number);
    const roll = currentRollCoordinates();
    const mappedMark1 = mapOmrPoint(roll.columns[0][Number(digits[0])]);
    const mappedMark2 = mapOmrPoint(roll.columns[1][Number(digits[1])]);
    const mappedBox1 = mapOmrPoint(roll.boxes[0]);
    const mappedBox2 = mapOmrPoint(roll.boxes[1]);
    const fitClass = state.omrFit === 'width' ? 'fit-width' : state.omrFit === 'stretch' ? 'fit-stretch' : 'fit-contain';
    const labelWithClass = `${cleanCell(student.label)} • ${cleanCell(student.className)}`;
    const omrScale = state.omrScale;
    const omrOffsetX = state.omrOffsetX * 100;
    const omrOffsetY = state.omrOffsetY * 100;
    const instructionArea = state.frontContentMode === 'performance'
      ? '<section class="cr-front-center-area performance"><div class="cr-performance-blank-area" aria-label="Área reservada para imprimir o desempenho após a avaliação"></div></section>'
      : `<section class="cr-front-center-area instructions"><div class="cr-instructions-title">INSTRUÇÕES</div><div class="cr-instructions"><div class="cr-instruction-column">${sanitizeInstructionHtml(state.instructionLeft)}</div><div class="cr-instruction-column">${sanitizeInstructionHtml(state.instructionRight)}</div></div><div class="cr-stars-line">* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *</div></section>`;
    return `<article class="cr-sheet cr-front-page">
      <header class="cr-front-header"><img class="cr-front-logo" src="${escapeAttr(state.logo)}" alt="Logo da instituição"><div class="cr-front-title-wrap"><div class="cr-front-title">${sanitizeInstructionHtml(state.cardTitle)}</div><div class="cr-front-subtitle">${sanitizeInstructionHtml(state.cardSubtitle)}</div></div><div class="cr-front-number">Nº ${escapeHtml(student.number)}</div></header>
      <section class="cr-info-box"><div class="cr-info-left"><div class="cr-student-name ${studentNameClass(student.name)}" title="${escapeAttr(student.name)}">${escapeHtml(student.name)}</div><div class="cr-student-class">${escapeHtml(student.className)}</div><div class="cr-signature">Assinatura do Participante</div></div><div class="cr-info-right"><div class="cr-result-title">RESULTADO FINAL</div><div class="cr-result-pad"></div><div class="cr-result-head"><span>ACERTOS</span><span>ERROS</span><span>BRANCO</span><span>REDAÇÃO</span></div><div class="cr-result-cells"><span></span><span></span><span></span><span></span></div></div></section>
      ${instructionArea}
      <div class="cr-class-bar" style="--cr-class-bar-offset-y:${state.classBarOffsetY}mm">${escapeHtml(labelWithClass)}</div>
      <div class="cr-omr-wrap ${fitClass}" style="--cr-omr-scale:${omrScale};--cr-omr-offset-x:${omrOffsetX}%;--cr-omr-offset-y:${omrOffsetY}%"><img class="cr-omr-image" src="${escapeAttr(state.omr)}" alt="Folha OMR"><span class="cr-roll-digit" style="left:${mappedBox1.x}%;top:${mappedBox1.y}%">${digits[0]}</span><span class="cr-roll-digit" style="left:${mappedBox2.x}%;top:${mappedBox2.y}%">${digits[1]}</span><span class="cr-roll-mark" style="left:${mappedMark1.x}%;top:${mappedMark1.y}%"></span><span class="cr-roll-mark" style="left:${mappedMark2.x}%;top:${mappedMark2.y}%"></span></div>
    </article>`;
  }

  function backPageHtml() {
    if (state.customBack) return customPageHtml(state.customBack, 'back');
    const lines = Array.from({ length: 30 }, (_, index) => `<div class="cr-redaction-row"><strong>${String(index + 1).padStart(2, '0')}</strong><span></span></div>`).join('');
    return `<article class="cr-sheet cr-back-page"><div class="cr-back-title">FOLHA DE REDAÇÃO</div><div class="cr-redaction-lines">${lines}</div><div class="cr-legend-title"><span class="cr-legend-stars">* * * * * * * * * * * * * * *</span><span>LEGENDA DE CORREÇÃO</span><span class="cr-legend-stars">* * * * * * * * * * * * * * *</span></div><div class="cr-legend-table"><div class="cr-legend-row"><strong>C1: REGRAS GRAMATICAIS</strong><span></span></div><div class="cr-legend-row"><strong>C2: OBEDIÊNCIA AO TEMA</strong><span></span></div><div class="cr-legend-row"><strong>C3: COERÊNCIA TEXTUAL</strong><span></span></div><div class="cr-legend-row"><strong>C4: ESTRUTURA TEXTUAL</strong><span></span></div><div class="cr-legend-row"><strong>C5: ARGUMENTAÇÃO</strong><span></span></div></div><div class="cr-back-footer-blank" aria-hidden="true"></div></article>`;
  }

  async function loadUserImage(event, kind) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await fileToDataUri(file);
      const uri = await optimizeImageDataUri(raw, kind);
      if (kind === 'logo') {
        state.logo = uri;
        markMediaDirty('logo');
        renderPreview();
        saveSettings();
        showToast('Logomarca atualizada e salva permanentemente neste navegador.');
      } else {
        loadOmrImage(uri, false, true);
      }
    } catch (error) {
      console.error(error);
      showToast('Não foi possível abrir a imagem.');
    }
  }

  async function handleCustomPageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const side = els.customPageSide.value === 'back' ? 'back' : 'front';
    try {
      setLibraryStatus('Preparando página personalizada…', '');
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) throw new Error('Use uma imagem PNG, JPG ou WebP.');
      const uri = await optimizeImageDataUri(await fileToDataUri(file), 'customPage');
      await loadImage(uri);
      setCustomPage(side, uri, file.name);
      setLibraryStatus(state.workbook ? 'Planilha carregada' : 'Leitor de planilhas pronto', 'ready');
      showToast(`${side === 'front' ? 'Frente' : 'Verso'} substituído com sucesso.`);
    } catch (error) {
      console.error(error);
      setLibraryStatus('Falha ao abrir a página personalizada', 'warn');
      showToast(error?.message || 'Não foi possível abrir a imagem.');
    } finally {
      els.customPageInput.value = '';
    }
  }

  function setCustomPage(side, uri, name) {
    if (side === 'back') {
      state.customBack = uri;
      state.customBackName = name;
    } else {
      state.customFront = uri;
      state.customFrontName = name;
    }
    markMediaDirty(side === 'back' ? 'customBack' : 'customFront');
    updateCustomPageStatus();
    renderPreview();
    saveSettings();
  }

  function removeSelectedCustomPage() {
    const side = els.customPageSide.value === 'back' ? 'back' : 'front';
    if (side === 'back') {
      state.customBack = '';
      state.customBackName = '';
    } else {
      state.customFront = '';
      state.customFrontName = '';
    }
    markMediaDirty(side === 'back' ? 'customBack' : 'customFront');
    updateCustomPageStatus();
    renderPreview();
    saveSettings();
    showToast(`${side === 'front' ? 'Frente' : 'Verso'} restaurado para o modelo original.`);
  }

  function updateCustomPageStatus() {
    const front = state.customFront ? (state.customFrontName || 'arquivo personalizado') : 'modelo original';
    const back = state.customBack ? (state.customBackName || 'arquivo personalizado') : 'modelo original';
    els.customPageStatus.innerHTML = `<b>Frente:</b> ${escapeHtml(front)}<br><b>Verso:</b> ${escapeHtml(back)}<br>A página enviada substitui integralmente o lado selecionado.`;
    const selectedHasCustom = els.customPageSide.value === 'back' ? Boolean(state.customBack) : Boolean(state.customFront);
    els.removeCustomPage.disabled = !selectedHasCustom;
  }
  async function resetCardToDefaults() {
    state.mapping = { name: 3, label: 0, number: 2, className: 4 };
    state.headerRow = 1;
    state.startRow = 2;
    state.endRow = 47;
    state.logo = DEFAULTS.logo;
    state.omr = DEFAULTS.omr;
    state.omrNatural = { width: 1000, height: 485 };
    state.omrFit = 'contain';
    state.omrScale = DEFAULT_OMR_ADJUSTMENT.scale;
    state.omrOffsetX = DEFAULT_OMR_ADJUSTMENT.offsetX;
    state.omrOffsetY = DEFAULT_OMR_ADJUSTMENT.offsetY;
    state.classBarOffsetY = DEFAULT_CLASS_BAR_OFFSET_Y;
    state.bubbleDetection = null;
    state.zoom = 1;
    state.previewSide = 'front';
    state.instructionLeft = DEFAULTS.instructionLeft;
    state.instructionRight = DEFAULTS.instructionRight;
    state.cardTitle = DEFAULTS.cardTitle;
    state.cardSubtitle = DEFAULTS.cardSubtitle;
    state.customFront = '';
    state.customBack = '';
    state.customFrontName = '';
    state.customBackName = '';
    state.instructionSectionOpen = false;
    state.frontContentMode = 'instructions';
    state.activeEditor = null;
    state.savedRange = null;

    els.logoInput.value = '';
    els.omrInput.value = '';
    els.customPageInput.value = '';
    $('crMoreSettings').open = false;
    if (els.instructionSection) els.instructionSection.open = false;

    await clearStoredMedia();
    try { globalThis.GSSF_STORAGE?.removeItem?.(STORAGE_KEY); } catch (error) { console.warn('Não foi possível limpar as configurações:', error); }

    syncSettingsControls();
    restoreAllEditors();
    populateColumnSelectors();
    updateCustomPageStatus();
    if (state.workbook && state.selectedClass) buildStudents();
    else renderPreview();
    loadOmrImage(DEFAULTS.omr, true, false);
    saveSettings();
    showToast('Cartão-resposta redefinido para as configurações de origem.');
  }

  function loadOmrImage(uri, isDefault, notify) {
    const image = new Image();
    image.onload = () => {
      state.omr = uri;
      markMediaDirty('omr');
      state.omrNatural = { width: image.naturalWidth || 1000, height: image.naturalHeight || 485 };
      state.bubbleDetection = null;
      els.detectionText.innerHTML = '<b>Analisando:</b> procurando bolinhas e o campo Roll No…';
      renderPreview();
      detectOmrBubbles(false);
      saveSettings();
      if (notify) showToast(isDefault ? 'Folha OMR original restaurada.' : 'Imagem OMR atualizada e salva.');
    };
    image.onerror = () => { els.detectionText.innerHTML = '<b>Falha:</b> imagem OMR inválida.'; };
    image.src = uri;
  }

  async function detectOmrBubbles(manual) {
    try {
      const image = await loadImage(state.omr);
      const factor = Math.min(1, 1200 / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * factor));
      const height = Math.max(1, Math.round(image.naturalHeight * factor));
      const canvas = els.detectionCanvas;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const components = findCircleComponents(context.getImageData(0, 0, width, height).data, width, height);
      const roll = identifyRollColumns(components, width, height);
      if (!roll) {
        state.bubbleDetection = null;
        els.detectionText.innerHTML = `<b>${components.length} formas circulares:</b> Roll No não identificado; usando coordenadas seguras do modelo padrão.`;
        if (manual) showToast('Detecção parcial: Roll No não foi localizado.');
      } else {
        const answerCount = countAnswerBubbles(components, roll, width, height);
        state.bubbleDetection = { components, roll, width, height, alignment: 'detected-centers' };
        els.detectionText.innerHTML = `<b>${Math.max(0, answerCount)} bolinhas de alternativas</b> e 20 bolinhas do Roll No identificadas. Alinhamento automático aplicado sobre os centros detectados.`;
        if (manual) showToast('Bolinhas e Roll No identificados e alinhados automaticamente.');
      }
      renderPreview();
    } catch (error) {
      console.error(error);
      state.bubbleDetection = null;
      els.detectionText.innerHTML = '<b>Falha na análise:</b> usando o posicionamento padrão.';
      if (manual) showToast('Não foi possível analisar a folha OMR.');
    }
  }

  function findCircleComponents(rgba, width, height) {
    const total = width * height;
    const dark = new Uint8Array(total);
    const visited = new Uint8Array(total);
    for (let index = 0, pixel = 0; index < total; index++, pixel += 4) {
      const gray = rgba[pixel] * .299 + rgba[pixel + 1] * .587 + rgba[pixel + 2] * .114;
      dark[index] = gray < 150 ? 1 : 0;
    }
    const output = [];
    const stack = new Int32Array(Math.max(4096, Math.min(total, 120000)));
    for (let start = 0; start < total; start++) {
      if (!dark[start] || visited[start]) continue;
      let top = 0;
      stack[top++] = start;
      visited[start] = 1;
      let minX = width, maxX = 0, minY = height, maxY = 0, count = 0, sumX = 0, sumY = 0;
      while (top) {
        const current = stack[--top];
        const x = current % width;
        const y = (current / width) | 0;
        count++; sumX += x; sumY += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (let n = 0; n < 4; n++) {
          const next = neighbors[n];
          if (next < 0 || next >= total || visited[next] || !dark[next]) continue;
          if (n === 0 && x === 0) continue;
          if (n === 1 && x === width - 1) continue;
          visited[next] = 1;
          if (top < stack.length) stack[top++] = next;
        }
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const ratio = boxWidth / Math.max(1, boxHeight);
      const density = count / Math.max(1, boxWidth * boxHeight);
      const scale = width / 1000;
      if (boxWidth >= 10 * scale && boxWidth <= 28 * scale && boxHeight >= 10 * scale && boxHeight <= 28 * scale && ratio >= .7 && ratio <= 1.4 && count >= 20 * scale * scale && density < .58) {
        const cxPx = sumX / count, cyPx = sumY / count;
        if (cyPx > 35 * scale) output.push({ x: cxPx / width, y: cyPx / height, cxPx, cyPx, boxWidth, boxHeight, count, density });
      }
    }
    return output;
  }

  function countAnswerBubbles(components, roll, width, height) {
    const rollItems = new Set(roll?.all || []);
    const tolerance = Math.max(4, width * .006);
    const left = components.filter((item) => !rollItems.has(item) && item.x < .75).sort((a, b) => a.cxPx - b.cxPx || a.cyPx - b.cyPx);
    const clusters = [];
    left.forEach((item) => {
      let cluster = clusters.find((candidate) => Math.abs(candidate.meanX - item.cxPx) <= tolerance);
      if (!cluster) { cluster = { meanX: item.cxPx, items: [] }; clusters.push(cluster); }
      cluster.items.push(item);
      cluster.meanX = cluster.items.reduce((sum, entry) => sum + entry.cxPx, 0) / cluster.items.length;
    });
    const regularColumns = clusters.map((cluster) => {
      const items = cluster.items.sort((a, b) => a.cyPx - b.cyPx);
      if (items.length < 8 || items.length > 18) return null;
      const gaps = items.slice(1).map((item, index) => item.cyPx - items[index].cyPx).filter((gap) => gap > 0).sort((a, b) => a - b);
      const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      const verticalSpan = items.at(-1).cyPx - items[0].cyPx;
      return medianGap >= height * .035 && medianGap <= height * .09 && verticalSpan >= height * .45 ? { meanX: cluster.meanX, items } : null;
    }).filter(Boolean).sort((a, b) => a.meanX - b.meanX);
    const acceptedColumns = new Set();
    for (let index = 0; index <= regularColumns.length - 4; index++) {
      const group = regularColumns.slice(index, index + 4);
      const gaps = [group[1].meanX - group[0].meanX, group[2].meanX - group[1].meanX, group[3].meanX - group[2].meanX];
      const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      const spread = Math.max(...gaps) - Math.min(...gaps);
      if (averageGap >= width * .02 && averageGap <= width * .05 && spread <= width * .008) group.forEach((cluster) => acceptedColumns.add(cluster));
    }
    return [...acceptedColumns].reduce((total, cluster) => total + cluster.items.length, 0);
  }