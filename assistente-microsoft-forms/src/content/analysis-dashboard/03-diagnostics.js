

  function summarizeQuestionBlocks(blocks) {
    return blocks.slice(0, 120).map((block, index) => {
      const r = block.getBoundingClientRect();
      const preferred = Array.from(block.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]')).filter(visible);
      const fallback = Array.from(block.querySelectorAll('[role="radio"], input[type="radio"]')).filter(visible);
      const options = preferred.length ? preferred : fallback;
      const correct = options.map((opt, i) => isCorrectOption(opt) ? letter(i) : null).filter(Boolean);
      return {
        index,
        number: questionNumberFromBlock(block),
        top: Math.round(r.top + scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
        emptyModel: isEmptyModel(block),
        images: Array.from(block.querySelectorAll('img')).filter(meaningfulImage).length,
        options: options.length,
        correct,
        text: textOf(block).slice(0, 360),
        hint: nodeHint(block).slice(0, 260)
      };
    });
  }

  function summarizeImageSamples(blocks, sections) {
    const containerInfo = [];
    blocks.forEach((block, index) => containerInfo.push({ block, kind: 'questao', number: questionNumberFromBlock(block), index }));
    sections.forEach((block, index) => containerInfo.push({ block, kind: 'secao', number: index + 1, index }));
    const seen = new Set();
    const samples = [];
    for (const item of containerInfo) {
      for (const img of Array.from(item.block.querySelectorAll('img'))) {
        if (!meaningfulImage(img) || seen.has(img)) continue;
        seen.add(img);
        const r = img.getBoundingClientRect();
        samples.push({
          kind: item.kind,
          number: item.number,
          index: item.index,
          src: String(img.currentSrc || img.src || img.getAttribute('src') || '').slice(0, 220),
          alt: String(img.alt || '').slice(0, 120),
          width: Math.round(r.width),
          height: Math.round(r.height),
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          nearText: textOf(img.closest('div,section,article') || img.parentElement).slice(0, 180)
        });
        if (samples.length >= 120) return samples;
      }
    }
    return samples;
  }

  function buildDiagnostic() {
    const precheck = collectPrecheck();
    const questions = collectQuestionBlocks();
    const sections = getSectionBlocks();
    const qChildren = getQuestionListChildren();
    const selectorCounts = {
      questionList: Boolean(document.querySelector('#question-list')),
      questionListChildren: qChildren.length,
      radiogroups: document.querySelectorAll('[role="radiogroup"]').length,
      radios: document.querySelectorAll('[role="radio"], input[type="radio"]').length,
      optionContainers: document.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]').length,
      allImages: document.querySelectorAll('img').length,
      visibleImages: Array.from(document.querySelectorAll('img')).filter(visible).length,
      contentImages: precheck.images,
      sectionBlocks: sections.length,
      questionBlocks: questions.length
    };
    const blockSample = qChildren.slice(0, 80).map((el, index) => {
      const r = el.getBoundingClientRect();
      return { index, top: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height), text: textOf(el).slice(0, 240), number: questionNumberFromBlock(el), hint: nodeHint(el).slice(0, 240), imgs: Array.from(el.querySelectorAll('img')).filter(meaningfulImage).length, radios: el.querySelectorAll('[role="radio"], input[type="radio"]').length, radiogroups: el.querySelectorAll('[role="radiogroup"]').length };
    });
    const buttons = all('button, [role="button"], [aria-label]').slice(0, 300).map((el) => ({ text: textOf(el).slice(0, 120), aria: String(el.getAttribute?.('aria-label') || '').slice(0, 120), role: String(el.getAttribute?.('role') || '').slice(0, 60), automation: String(el.getAttribute?.('data-automation-id') || '').slice(0, 80), hint: nodeHint(el).slice(0, 160) })).filter((x) => x.text || x.aria || x.role || x.automation);
    return { app: APP.name, version: APP.version, generatedAt: new Date().toLocaleString('pt-BR'), url: location.href, title: getFormTitle() || document.title, userAgent: navigator.userAgent, precheck, selectorCounts, sectionSamples: sections.slice(0, 80).map((el, index) => ({ index, text: textOf(el).slice(0, 260), hint: nodeHint(el).slice(0, 260), rect: rectInfo(el) })), questionSamples: summarizeQuestionBlocks(questions), imageSamples: summarizeImageSamples(questions, sections), recentErrors: APP.errorLog.slice(-40), blockSample, buttons };
  }

