  // ===== 50-alternatives-math-audit.js =====
// Fonte modular: alternatives math audit.
  function getDeepAttributes(el) {
    const parts = [];
    const attrs = ['aria-label','aria-checked','aria-selected','title','alt','role','class','name','value','data-automation-id','data-testid','data-state','data-is-correct','data-correct','data-answer','data-selected','data-checked'];
    const read = (node) => {
      if (!node?.getAttribute) return;
      attrs.forEach((attr) => { const v = node.getAttribute(attr); if (v) parts.push(v); });
      Array.from(node.attributes || []).forEach((a) => { if (/correct|correta|answer|resposta|checked|selected|state/i.test(`${a.name} ${a.value}`)) parts.push(`${a.name}=${a.value}`); });
    };
    read(el);
    Array.from(el.querySelectorAll('*')).forEach(read);
    return normalizeText(parts.join(' '));
  }

  function extractQuestionNumber(block) {
    return questionNumberFromBlock(block) || null;
  }

  function findOptionContainers(group) {
    const options = Array.from(group.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]')).filter(visible);
    if (options.length) return options;
    const editItems = Array.from(group.querySelectorAll('[role="listitem"]')).filter((item) => {
      if (!visible(item)) return false;
      const optionField = Array.from(item.querySelectorAll('[role="textbox"], [contenteditable="true"], input, textarea')).find((field) => isOptionTextField(field, item));
      return Boolean(optionField);
    });
    if (editItems.length) return editItems;
    const radios = Array.from(group.querySelectorAll('[role="radio"], input[type="radio"]')).filter(visible);
    return radios.map((radio) => {
      let current = radio;
      let best = radio;
      for (let i = 0; i < 8 && current && current !== group; i += 1, current = current.parentElement) {
        const radioCount = current.querySelectorAll('[role="radio"], input[type="radio"]').length;
        const tx = textOf(current);
        if (radioCount === 1 && tx.length > 0) best = current;
      }
      return best;
    });
  }

  function isGreenColor(color) {
    const m = String(color || '').match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return false;
    const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    return g >= 90 && r <= 115 && b <= 125 && g > r && g > b;
  }

  function hasVisualCheck(container) {
    const candidates = Array.from(container.querySelectorAll('svg,path,span,i')).filter(visible);
    for (const el of candidates) {
      const st = getComputedStyle(el);
      if (isGreenColor(st.fill) || isGreenColor(st.color) || isGreenColor(st.stroke)) return true;
      if (isGreenColor(el.getAttribute?.('fill')) || isGreenColor(el.getAttribute?.('stroke')) || isGreenColor(el.getAttribute?.('style'))) return true;
    }
    return false;
  }

  function isCorrectOption(container) {
    if (!container) return false;
    if (container.querySelector('[aria-checked="true"],[checked],[data-state="checked"],[data-state="selected"],[aria-selected="true"],[data-is-correct="true"],[data-correct="true"],[data-answer="true"]')) return true;
    if (container.querySelector('span[class*="-w--309"]')) return true;
    const attrs = getDeepAttributes(container);
    const commandToMark = attrs.includes('marcar como correta') || attrs.includes('marcar como resposta correta') || attrs.includes('set as correct') || attrs.includes('mark as correct');
    if (!commandToMark) {
      if (attrs.includes('resposta correta') || attrs.includes('alternativa correta') || attrs.includes('opcao correta') || attrs.includes('opção correta') || attrs.includes('correct answer') || attrs.includes('correct option') || attrs.includes('selected correct') || attrs.includes('remove correct') || attrs.includes('remover correta') || attrs.includes('remover resposta correta')) return true;
    }
    return hasVisualCheck(container);
  }

  function extractQuestionPrompt(block, group) {
    const clone = block.cloneNode(true);
    clone.querySelectorAll('[role="radiogroup"], svg, path, button, [role="button"]').forEach((el) => el.remove());
    return cleanText(clone.textContent).slice(0, 500);
  }

  function optionTextForAudit(option) {
    const field = optionTextField(option);
    const raw = field ? optionCurrentText(field) : textOf(option);
    return cleanText(stripCopyUiPhrases(raw));
  }

  function optionMarkerPattern(index, loose = false) {
    const expected = letter(index);
    const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (loose) return new RegExp(`^\\s*${escaped}\\s+(?=\\(|\\S)`, 'i');
    return new RegExp(`^\\s*${escaped}\\s*[\\)\\].:\\-–—]\\s*(?=\\S)`, 'i');
  }