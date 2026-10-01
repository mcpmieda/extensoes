

  function buildClipboardContainerFromBlocks(blocks) {
    const temp = document.createElement('div');
    temp.id = 'gssf-copy-source';
    temp.setAttribute('contenteditable', 'true');
    temp.style.cssText = 'position:fixed;left:0;top:0;width:980px;max-width:980px;background:#fff;color:#000;opacity:.02;z-index:2147483645;pointer-events:none;padding:20px;font-family:Arial,Segoe UI,sans-serif;';
    blocks.forEach((block, index) => {
      const clone = block.cloneNode(true);
      applyInlineFormattingFromOriginal(block, clone);
      fixClonedImagesForClipboard(clone);
      applyAriaLineBreaksToQuestionClone(block, clone);
      preserveCopyTextBreaksFromOriginal(block, clone);
      sanitizeCopyClone(clone);
      preserveQuestionTitleVisualBlocks(clone);
      preserveCopyLineBreaks(clone);
      clone.style.breakInside = 'avoid';
      clone.style.pageBreakInside = 'avoid';
      clone.style.margin = '0';
      clone.setAttribute('data-gssf-copy-question-index', String(index + 1));
      temp.appendChild(clone);
    });
    return temp;
  }

  function imageSourceForCopy(img) {
    const raw = img?.currentSrc || img?.src || img?.getAttribute?.('src') || img?.getAttribute?.('data-src') || img?.getAttribute?.('data-original') || '';
    if (!raw) return '';
    try { return new URL(raw, location.href).href; } catch (_) { return raw; }
  }

  function prepareOriginalImagesForClone(block) {
    const seen = new Set();
    const keys = [];
    Array.from(block.querySelectorAll('img')).forEach((img) => {
      const src = imageSourceForCopy(img);
      if (!src) return;
      try {
        img.setAttribute('data-gssf-src', src);
        img.setAttribute('loading', 'eager');
        img.setAttribute('decoding', 'sync');
      } catch (_) {}
      if (!meaningfulImage(img)) return;
      const key = `${src}|${img.naturalWidth || 0}x${img.naturalHeight || 0}|${cleanText(img.alt || '').slice(0, 80)}`;
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
    return keys;
  }

  function removeDuplicateImagesFromClone(container) {
    const seen = new Set();
    Array.from(container.querySelectorAll('img')).forEach((img) => {
      const src = img.getAttribute('data-gssf-src') || img.getAttribute('src') || '';
      const key = `${src}|${cleanText(img.getAttribute('alt') || '').slice(0, 80)}`;
      if (!src || !seen.has(key)) {
        if (src) seen.add(key);
        return;
      }
      img.remove();
    });
  }

  function buildQuestionCopySnapshot(block, fallbackIndex = 0) {
    if (!block) return null;
    const number = questionNumberFromBlock(block) || fallbackIndex + 1;
    const top = block.getBoundingClientRect().top + scrollY;
    const imageKeys = prepareOriginalImagesForClone(block);
    let clone = block.cloneNode(true);
    applyInlineFormattingFromOriginal(block, clone);
    if (clone.matches?.('button,[role="button"]')) {
      const unwrapped = document.createElement('div');
      while (clone.firstChild) unwrapped.appendChild(clone.firstChild);
      clone = unwrapped;
    }
    fixClonedImagesForClipboard(clone);
    removeDuplicateImagesFromClone(clone);
    applyAriaLineBreaksToQuestionClone(block, clone);
    preserveCopyTextBreaksFromOriginal(block, clone);
    sanitizeCopyClone(clone);
    preserveQuestionTitleVisualBlocks(clone);
    preserveCopyLineBreaks(clone);
    const cloneImageCount = Array.from(clone.querySelectorAll('img')).filter((img) => imageSourceForCopy(img)).length;
    clone.setAttribute('data-gssf-copy-original-question', String(number));
    clone.style.cssText = [
      'margin:0',
      'padding:0',
      'background:#fff',
      'color:#111',
      'font-family:Arial,Segoe UI,sans-serif',
      'font-size:12pt',
      'line-height:normal',
      'white-space:normal'
    ].join(';');
    clone.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = img.style.display || 'block';
      img.style.margin = img.style.margin || '8px 0';
    });
    const wrapper = document.createElement('article');
    wrapper.className = 'gssf-copy-question';
    wrapper.setAttribute('data-gssf-copy-question-number', String(number));
    wrapper.style.cssText = [
      'break-inside:avoid',
      'page-break-inside:avoid',
      'margin:0',
      'padding:0',
      'border-bottom:1px solid #d9e2ef',
      'background:#fff',
      'color:#111',
      'font-family:Arial,Segoe UI,sans-serif'
    ].join(';');
    wrapper.appendChild(clone);
    const text = cleanText(wrapper.textContent || '');
    return {
      number,
      top: Math.round(top),
      html: wrapper.outerHTML,
      textLength: text.length,
      imageKeys,
      imageCount: Math.max(imageKeys.length, cloneImageCount),
      score: (Math.max(imageKeys.length, cloneImageCount) * 10000) + text.length
    };
  }

  function upsertQuestionSnapshot(map, snapshot) {
    if (!snapshot) return;
    const key = snapshot.number > 0 ? `q:${snapshot.number}` : `top:${snapshot.top}`;
    const current = map.get(key);
    if (!current || snapshot.score >= current.score) map.set(key, snapshot);
  }

  function sortedQuestionSnapshots(map) {
    const items = Array.from(map.values());
    const numbered = items.filter((item) => item.number > 0);
    const useNumbers = numbered.length >= Math.max(1, items.length * 0.7);
    return items.sort((a, b) => useNumbers ? (a.number - b.number || a.top - b.top) : (a.top - b.top));
  }

  async function collectAllQuestionSnapshotsForCopy(progressId = 'copy') {
    const snapshots = new Map();
    const scroller = formsScroller();
    const viewport = Math.max(520, window.innerHeight || 760);
    let lastHeight = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      const height = Math.max(scroller?.scrollHeight || 0, document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
      const maxY = Math.max(0, height - viewport);
      const step = Math.max(420, Math.round(viewport * 0.78));
      const positions = [];
      for (let y = 0; y <= maxY; y += step) positions.push(y);
      if (!positions.length || positions[positions.length - 1] !== maxY) positions.push(maxY);
      for (let i = 0; i < positions.length; i += 1) {
        requireExtensionContext();
        const y = positions[i];
        if (scroller && scroller !== document.documentElement && scroller !== document.body) scroller.scrollTop = y;
        window.scrollTo(0, y);
        await sleep(150);
        const blocks = collectQuestionBlocks();
        blocks.forEach((block, index) => upsertQuestionSnapshot(snapshots, buildQuestionCopySnapshot(block, index)));
        const pct = 34 + Math.round(((pass * positions.length + i + 1) / Math.max(1, positions.length * 2)) * 24);
        setProgress(progressId, pct, `Carregando questões... ${snapshots.size}`);
      }
      if (height === lastHeight) break;
      lastHeight = height;
    }
    if (scroller && scroller !== document.documentElement && scroller !== document.body) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
    await sleep(150);
    return sortedQuestionSnapshots(snapshots);
  }

  function blocksFromQuestionSnapshots(snapshots) {
    return (snapshots || []).map((snapshot) => {
      const holder = document.createElement('div');
      holder.innerHTML = snapshot.html || '';
      const block = holder.firstElementChild || document.createElement('article');
      block.setAttribute('data-gssf-copy-question-index', String(snapshot.number || ''));
      return block;
    }).filter(Boolean);
  }
