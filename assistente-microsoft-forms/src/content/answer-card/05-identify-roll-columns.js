

  function identifyRollColumns(components, width, height) {
    const candidates = components.filter((item) => item.x > .7 && item.y > .25);
    const tolerance = Math.max(4, width * .007);
    const clusters = [];
    candidates.forEach((item) => {
      let cluster = clusters.find((candidate) => Math.abs(candidate.meanX - item.cxPx) <= tolerance);
      if (!cluster) { cluster = { meanX: item.cxPx, items: [] }; clusters.push(cluster); }
      cluster.items.push(item);
      cluster.meanX = cluster.items.reduce((sum, entry) => sum + entry.cxPx, 0) / cluster.items.length;
    });
    const valid = clusters.filter((cluster) => cluster.items.length >= 9 && cluster.items.length <= 12).map((cluster) => ({ ...cluster, items: cluster.items.sort((a, b) => a.cyPx - b.cyPx) })).sort((a, b) => a.meanX - b.meanX);
    let best = null;
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i], b = valid[j];
        const delta = b.meanX - a.meanX;
        if (delta < width * .015 || delta > width * .08) continue;
        const aa = a.items.slice(0, 10), bb = b.items.slice(0, 10);
        if (aa.length < 10 || bb.length < 10) continue;
        const yDifference = aa.reduce((sum, item, index) => sum + Math.abs(item.cyPx - bb[index].cyPx), 0) / 10;
        if (yDifference > height * .025) continue;
        const score = (a.meanX + b.meanX) - yDifference * 4;
        if (!best || score > best.score) best = { score, a: aa, b: bb };
      }
    }
    if (!best) return null;
    const avgFirstY = (best.a[0].y + best.b[0].y) / 2;
    const rowStep = ((best.a[9].y - best.a[0].y) + (best.b[9].y - best.b[0].y)) / 18;
    const boxY = Math.max(.02, avgFirstY - rowStep * 1.02);
    return { columns: [best.a.map((item) => ({ x: item.x, y: item.y })), best.b.map((item) => ({ x: item.x, y: item.y }))], boxes: [{ x: best.a[0].x, y: boxY }, { x: best.b[0].x, y: boxY }], all: [...best.a, ...best.b] };
  }

  function currentRollCoordinates() {
    if (state.bubbleDetection?.roll) return state.bubbleDetection.roll;
    const columns = [[], []];
    for (let digit = 0; digit <= 9; digit++) {
      columns[0].push({ x: .8155, y: (198.5 + digit * 30) / 485 });
      columns[1].push({ x: .8454, y: (198.5 + digit * 30) / 485 });
    }
    return { columns, boxes: [{ x: .8155, y: .346 }, { x: .8454, y: .346 }] };
  }

  function mapOmrPoint(point) {
    const sourceRatio = state.omrNatural.width / Math.max(1, state.omrNatural.height);
    const viewportWidthMm = FRONT_GUIDE_LAYOUT.pageWidth - FRONT_GUIDE_LAYOUT.pageLeft - FRONT_GUIDE_LAYOUT.pageRight;
    const viewportHeightMm = FRONT_GUIDE_LAYOUT.omrHeight;
    const containerRatio = viewportWidthMm / Math.max(.001, viewportHeightMm);
    let x = point.x, y = point.y;
    if (state.omrFit === 'contain') {
      if (sourceRatio > containerRatio) y = (1 - containerRatio / sourceRatio) / 2 + y * (containerRatio / sourceRatio);
      else x = (1 - sourceRatio / containerRatio) / 2 + x * (sourceRatio / containerRatio);
    } else if (state.omrFit === 'width') {
      const heightFraction = containerRatio / sourceRatio;
      y = (1 - heightFraction) / 2 + y * heightFraction;
    }
    x = .5 + (x - .5) * state.omrScale + state.omrOffsetX;
    y = .5 + (y - .5) * state.omrScale + state.omrOffsetY;
    return { x: x * 100, y: y * 100 };
  }

  const EDITOR_STATE_KEYS = ['cardTitle', 'cardSubtitle', 'instructionLeft', 'instructionRight'];

  function editorForKey(key) { return root?.querySelector?.(`[data-editor-key="${key}"]`) || null; }

  function enhanceEditorToolbars() {
    root.querySelectorAll('.cr-editor-toolbar').forEach((toolbar) => {
      if (toolbar.dataset.enhanced === 'true') return;
      toolbar.dataset.enhanced = 'true';
      const target = $(toolbar.dataset.editorTarget);
      const reset = toolbar.querySelector('[data-reset-editor]');
      const insert = (label, title, action, wide = false) => {
        const button = document.createElement('button');
        button.className = `cr-editor-tool${wide ? ' wide' : ''}`;
        button.type = 'button';
        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.dataset.formatAction = action;
        toolbar.insertBefore(button, reset || null);
      };
      insert('≡','Alinhar à esquerda','align-left');
      insert('☰','Centralizar','align-center');
      insert('≣','Justificar','align-justify');
      if (target && !target.classList.contains('single-line')) {
        insert('• Lista','Lista com marcadores','list-unordered',true);
        insert('1. Lista','Lista numerada','list-ordered',true);
      }
      insert('Tx','Limpar formatação','clear-format',true);
    });
    root.querySelectorAll('[data-editor-key]').forEach((editor) => {
      const label = editor.closest('.cr-editor-group')?.querySelector('.cr-editor-label')?.textContent?.trim() || 'Editor de texto';
      editor.setAttribute('role','textbox');
      editor.setAttribute('aria-multiline', String(!editor.classList.contains('single-line')));
      editor.setAttribute('aria-label', label);
    });
  }

  function restoreAllEditors() {
    EDITOR_STATE_KEYS.forEach((key) => { const editor = editorForKey(key); if (editor) editor.innerHTML = state[key]; });
  }

  function bindRichTextEditors() {
    root.querySelectorAll('[data-editor-key]').forEach((editor) => {
      editor.addEventListener('focus', () => { state.activeEditor = editor; saveEditorRange(); });
      editor.addEventListener('mouseup', saveEditorRange);
      editor.addEventListener('keyup', saveEditorRange);
      editor.addEventListener('input', syncTextFromEditor);
      editor.addEventListener('paste', (event) => {
        if (!editor.classList.contains('single-line')) return setTimeout(() => syncTextFromEditor({ currentTarget: editor }), 0);
        event.preventDefault();
        const text = (event.clipboardData?.getData('text/plain') || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        insertPlainText(editor, text);
        syncTextFromEditor({ currentTarget: editor });
      });
      if (editor.classList.contains('single-line')) editor.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
    });

    root.querySelectorAll('.cr-editor-toolbar').forEach((toolbar) => {
      const target = $(toolbar.dataset.editorTarget);
      toolbar.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('mousedown', (event) => {
        event.preventDefault(); activateEditor(target); applyEditorCommand(button.dataset.command);
      }));
      toolbar.querySelectorAll('[data-format-action]').forEach((button) => button.addEventListener('mousedown', (event) => {
        event.preventDefault(); activateEditor(target); applyEditorAction(button.dataset.formatAction);
      }));
      const sizeSelect = toolbar.querySelector('[data-font-size]');
      if (sizeSelect) sizeSelect.addEventListener('change', () => { activateEditor(target); applyEditorFontSize(Number(sizeSelect.value)); });
      toolbar.querySelectorAll('[data-reset-editor]').forEach((button) => button.addEventListener('click', () => resetEditor(button.dataset.resetEditor)));
    });
  }

  function activateEditor(editor) {
    if (!editor) return;
    if (state.activeEditor !== editor) { state.activeEditor = editor; state.savedRange = null; }
    editor.focus();
  }

  function syncTextFromEditor(event) {
    const editor = event?.currentTarget || state.activeEditor;
    const key = editor?.dataset.editorKey;
    if (!key || !EDITOR_STATE_KEYS.includes(key)) return;
    if (editor.classList.contains('single-line')) {
      const text = editor.textContent.replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();
      if (editor.textContent !== text && !editor.querySelector('strong,b,em,i,u,span')) editor.textContent = text;
    }
    state[key] = sanitizeInstructionHtml(editor.innerHTML);
    renderPreview(); saveSettings();
  }

  function resetEditor(key) {
    if (!EDITOR_STATE_KEYS.includes(key)) return;
    state[key] = DEFAULTS[key];
    const editor = editorForKey(key); if (editor) editor.innerHTML = state[key];
    renderPreview(); saveSettings(); showToast('Texto restaurado.');
  }

  function saveEditorRange() {
    const selection = window.getSelection();
    if (!state.activeEditor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (state.activeEditor.contains(range.commonAncestorContainer)) state.savedRange = range.cloneRange();
  }

  function prepareEditorSelection(editor) {
    if (!editor) return null;
    editor.focus();
    const selection = window.getSelection();
    if (state.savedRange && editor.contains(state.savedRange.commonAncestorContainer)) {
      selection.removeAllRanges(); selection.addRange(state.savedRange.cloneRange());
    }
    const current = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (current && !current.collapsed && editor.contains(current.commonAncestorContainer)) return current;
    const range = document.createRange(); range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range); state.savedRange = range.cloneRange(); return range;
  }

  function selectNodeContents(node) {
    const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range); state.savedRange = range.cloneRange();
  }

  function wrapEditorSelection(editor, tagName, style = {}) {
    const range = prepareEditorSelection(editor); if (!range) return;
    const wrapper = document.createElement(tagName); Object.assign(wrapper.style, style);
    wrapper.append(range.extractContents()); range.insertNode(wrapper); selectNodeContents(wrapper);
  }

  function applyInlineFormatting(editor, tagName, style = {}) {
    const range = prepareEditorSelection(editor); if (!range) return;
    const fragment = range.extractContents();
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue) textNodes.push(walker.currentNode);
    if (!textNodes.length) {
      const wrapper = document.createElement(tagName); Object.assign(wrapper.style, style); wrapper.append(document.createTextNode('')); fragment.append(wrapper);
    } else {
      textNodes.forEach((node) => { const wrapper=document.createElement(tagName); Object.assign(wrapper.style,style); node.replaceWith(wrapper); wrapper.append(node); });
    }
    const first=fragment.firstChild,last=fragment.lastChild; range.insertNode(fragment);
    if (first && last) { const selection=window.getSelection(); const selected=document.createRange(); selected.setStartBefore(first); selected.setEndAfter(last); selection.removeAllRanges(); selection.addRange(selected); state.savedRange=selected.cloneRange(); }
  }

  function insertPlainText(editor, text) {
    const range = prepareEditorSelection(editor); if (!range) return;
    range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); selectNodeContents(node);
  }


  function applyEditorCommand(command) {
    const editor = state.activeEditor || els.instructionLeft;
    const tags = { bold:'strong', italic:'em', underline:'u' };
    if (tags[command]) applyInlineFormatting(editor, tags[command]);
    saveEditorRange(); syncTextFromEditor({ currentTarget: editor });
  }

  function applyEditorFontSize(size) {
    const editor = state.activeEditor || els.instructionLeft;
    applyInlineFormatting(editor, 'span', { fontSize: `${Math.max(8,Math.min(72,size))}px` });
    saveEditorRange(); syncTextFromEditor({ currentTarget: editor });
  }

  function applyEditorAction(action) {
    const editor = state.activeEditor || els.instructionLeft;
    if (action === 'clear-format') {
      const plain = (editor.innerText || editor.textContent || '').replace(/\n{3,}/g,'\n\n').trim();
      if (editor.classList.contains('single-line')) editor.textContent = plain.replace(/\s+/g,' ');
      else editor.innerHTML = plain ? plain.split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join('') : '<p><br></p>';
      state.savedRange = null; editor.focus(); syncTextFromEditor({ currentTarget: editor }); return;
    }
    const range = prepareEditorSelection(editor); if (!range) return;
    if (action.startsWith('align-')) {
      wrapEditorSelection(editor, 'div', { textAlign: action.replace('align-','') });
    } else if (action === 'list-unordered' || action === 'list-ordered') {
      const fragment = range.extractContents(); const list = document.createElement(action === 'list-ordered' ? 'ol' : 'ul');
      const blocks = [...fragment.childNodes];
      if (!blocks.length) blocks.push(document.createTextNode(''));
      blocks.forEach((node) => { const li = document.createElement('li'); if (node.nodeType === 1 && ['P','DIV','LI'].includes(node.nodeName)) li.append(...node.childNodes); else li.append(node); if (li.textContent.trim() || li.querySelector('br')) list.append(li); });
      if (!list.children.length) list.append(document.createElement('li'));
      range.insertNode(list); selectNodeContents(list);
    }
    saveEditorRange(); syncTextFromEditor({ currentTarget: editor });
  }

  function sanitizeInstructionHtml(html) {
    const template = document.createElement('template'); template.innerHTML = String(html || '');
    const allowed = new Set(['P','DIV','BR','B','STRONG','U','I','EM','SPAN','UL','OL','LI']);
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT); const elements=[];
    while (walker.nextNode()) elements.push(walker.currentNode);
    elements.reverse().forEach((element) => {
      if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); return; }
      [...element.attributes].forEach((attribute) => {
        let keep = false;
        if (attribute.name === 'style') {
          const declarations = attribute.value.split(';').map(item=>item.trim()).filter(Boolean);
          const safe = declarations.filter(item => /^(font-size\s*:\s*\d+(?:\.\d+)?(?:px|pt|em|rem|%)|text-align\s*:\s*(?:left|center|right|justify))$/i.test(item));
          if (safe.length) { element.setAttribute('style', safe.join(';')); keep = true; }
        }
        if (!keep) element.removeAttribute(attribute.name);
      });
    });
    return template.innerHTML;
  }