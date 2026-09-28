

  function meaningfulImage(img) {
    if (!visible(img)) return false;
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    const src = String(img.currentSrc || img.src || '');
    const hint = normalizeText(`${img.alt || ''} ${img.title || ''} ${img.className || ''} ${img.getAttribute('aria-label') || ''}`);
    if (r.width < 32 || r.height < 32) return false;
    if ((nw && nw < 32) || (nh && nh < 32)) return false;
    if (/icon|icone|logo|avatar|perfil|profile|office|microsoft|fluent/.test(hint) && r.width <= 80 && r.height <= 80) return false;
    if (/^data:image\/svg\+xml/i.test(src)) return false;
    return true;
  }

  function countContentImages(blocks, sectionBlocks = []) {
    const candidates = [];
    const containers = [...blocks, ...sectionBlocks].filter(Boolean);
    if (containers.length) {
      containers.forEach((block, blockIndex) => {
        Array.from(block.querySelectorAll('img')).forEach((img) => candidates.push({ img, blockIndex }));
      });
    } else {
      Array.from(document.querySelectorAll('#question-list img, main img, [role="main"] img')).forEach((img) => candidates.push({ img, blockIndex: 0 }));
    }
    const nodeSeen = new Set();
    const keySeen = new Set();
    let count = 0;
    const samples = [];
    for (const item of candidates) {
      const img = item.img;
      if (nodeSeen.has(img) || !meaningfulImage(img)) continue;
      nodeSeen.add(img);
      const src = img.currentSrc || img.src || img.getAttribute('src') || img.alt || '';
      const r = img.getBoundingClientRect();
      const key = `${item.blockIndex}|${src}|${Math.round(r.width)}x${Math.round(r.height)}`;
      if (keySeen.has(key)) continue;
      keySeen.add(key);
      count += 1;
      if (samples.length < 60) samples.push({ blockIndex: item.blockIndex, src: String(src).slice(0, 180), alt: String(img.alt || '').slice(0, 120), width: Math.round(r.width), height: Math.round(r.height), naturalWidth: img.naturalWidth || 0, naturalHeight: img.naturalHeight || 0 });
    }
    return { count, samples };
  }

  function countOptions(blocks) {
    const seen = new Set();
    let count = 0;
    for (const block of blocks) {
      const preferred = Array.from(block.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]')).filter(visible);
      const fallback = Array.from(block.querySelectorAll('[role="radio"], input[type="radio"]')).filter(visible);
      const editItems = findOptionContainers(block).filter((item) => item !== block);
      const list = preferred.length ? preferred : (fallback.length ? fallback : editItems);
      for (const item of list) {
        if (!seen.has(item)) { seen.add(item); count += 1; }
      }
    }
    return count;
  }

  function parseQuestionRange(value, maxQuestion = 999) {
    const nums = new Set();
    String(value || '').split(/[;,]/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
      const range = part.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
      if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        for (let n = start; n <= end; n += 1) if (n >= 1 && n <= maxQuestion) nums.add(n);
        return;
      }
      const single = Number(part);
      if (Number.isInteger(single) && single >= 1 && single <= maxQuestion) nums.add(single);
    });
    return Array.from(nums).sort((a, b) => a - b);
  }