

  function cleanClipboardPlainText(text) {
    return stripCopyUiPhrases(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const GSSF_COPY_ALLOWED_HTML_TAGS = new Set([
    'ARTICLE','ASIDE','B','BLOCKQUOTE','BR','CAPTION','CODE','COL','COLGROUP','DD','DIV','DL','DT','EM','FIGCAPTION','FIGURE','FOOTER','H1','H2','H3','H4','H5','H6','HEADER','HR','I','IMG','LI','MAIN','OL','P','PICTURE','PRE','SECTION','SMALL','SOURCE','SPAN','STRONG','SUB','SUP','TABLE','TBODY','TD','TFOOT','TH','THEAD','TR','U','UL'
  ]);

  const GSSF_COPY_ALLOWED_SVG_TAGS = new Set(['SVG','G','PATH','CIRCLE','RECT','LINE','POLYLINE','POLYGON','ELLIPSE','TEXT','TSPAN','DEFS','CLIPPATH','MASK','USE']);

  const GSSF_COPY_DROP_TAGS = new Set(['SCRIPT','IFRAME','OBJECT','EMBED','STYLE','LINK','META','BASE','FORM','INPUT','TEXTAREA','SELECT','OPTION','BUTTON','AUDIO','VIDEO','CANVAS','NOSCRIPT']);

  const GSSF_COPY_ALLOWED_ATTRS = new Set([
    'class','style','alt','title','width','height','colspan','rowspan','dir','lang','role','aria-label','aria-hidden','xmlns','viewbox','preserveaspectratio','d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','points','transform','opacity','font-size','text-anchor','loading','decoding','src','href','xlink:href','data-gssf-src','data-gssf-copy-original-question','data-gssf-copy-question-index','data-gssf-copy-question-number','data-gssf-copy-block-layout','data-gssf-copy-title-blocks','data-gssf-copy-real-block','data-automation-id','data-mathml'
  ]);

  function safeCopyUrl(value, tagName, attributeName) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if ((attributeName === 'href' || attributeName === 'xlink:href') && raw.startsWith('#')) return raw;
    if (/^data:image\/(?:png|gif|jpe?g|webp|svg\+xml);/i.test(raw) && tagName === 'IMG') return raw;
    try {
      const parsed = new URL(raw, location.href);
      return parsed.protocol === 'https:' ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function sanitizeCopyStyle(value) {
    const raw = String(value || '');
    if (/url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding/i.test(raw)) return '';
    return raw;
  }

  function unwrapSanitizedElement(element) {
    const parent = element?.parentNode;
    if (!parent) return;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    element.remove();
  }

  function sanitizeClonedMarkup(container) {
    if (!container?.querySelectorAll) return;
    Array.from(container.querySelectorAll('*')).forEach((element) => {
      if (element !== container && !container.contains(element)) return;
      const tagName = String(element.tagName || '').toUpperCase();
      const namespace = String(element.namespaceURI || '');
      if (GSSF_COPY_DROP_TAGS.has(tagName)) {
        element.remove();
        return;
      }
      const isMathMl = namespace === 'http://www.w3.org/1998/Math/MathML' || tagName === 'MATH';
      const mathCarrier = tagName.startsWith('MJX-') || element.hasAttribute?.('data-mathml');
      const allowedTag = isMathMl || mathCarrier || GSSF_COPY_ALLOWED_HTML_TAGS.has(tagName) || GSSF_COPY_ALLOWED_SVG_TAGS.has(tagName);
      if (!allowedTag) {
        unwrapSanitizedElement(element);
        return;
      }
      Array.from(element.attributes || []).forEach((attribute) => {
        const name = String(attribute.name || '').toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'contenteditable') {
          element.removeAttribute(attribute.name);
          return;
        }
        const dataSafe = name.startsWith('data-gssf-') || name === 'data-automation-id' || name === 'data-mathml';
        const ariaSafe = name.startsWith('aria-');
        if (!GSSF_COPY_ALLOWED_ATTRS.has(name) && !dataSafe && !ariaSafe) {
          element.removeAttribute(attribute.name);
          return;
        }
        if (name === 'data-mathml' && /<\s*(?:script|iframe|object|embed|style|foreignobject)\b|\son[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(attribute.value)) {
          element.removeAttribute(attribute.name);
          return;
        }
        if (name === 'style') {
          const safeStyle = sanitizeCopyStyle(attribute.value);
          if (safeStyle) element.setAttribute(attribute.name, safeStyle); else element.removeAttribute(attribute.name);
          return;
        }
        if (['src','href','xlink:href','data-gssf-src'].includes(name)) {
          const safeUrl = safeCopyUrl(attribute.value, tagName, name);
          if (safeUrl) element.setAttribute(attribute.name, safeUrl); else element.removeAttribute(attribute.name);
        }
      });
    });
  }

  function sanitizeCopyClone(container) {
    if (!container) return;
    container.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], [role="status"]').forEach((el) => {
      if (el.querySelector?.('img')) unwrapCopyElement(el);
      else el.remove();
    });
    Array.from(container.querySelectorAll('*')).forEach((el) => {
      if (/^(IMG|PICTURE|SVG|VIDEO|CANVAS)$/i.test(el.tagName || '')) return;
      if (!el || el.querySelector('img')) return;
      const childElements = Array.from(el.children).filter((child) => child.tagName !== 'BR');
      const text = cleanText(el.textContent || '');
      if (!childElements.length && isCopyUiText(text) && !isCopyUserAuthoredTextElement(el)) {
        if (isCopyBlankLineElement(el)) preserveCopyBlankLineElement(el);
        else el.remove();
      }
    });
    Array.from(container.querySelectorAll('*')).forEach((el) => {
      if (/^(IMG|PICTURE|SVG|VIDEO|CANVAS)$/i.test(el.tagName || '')) return;
      const text = cleanText(el.textContent || '');
      if (!el.querySelector('img') && text && isCopyUiText(text) && !isCopyUserAuthoredTextElement(el)) el.remove();
    });
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      if (isCopyUserAuthoredTextElement(node.parentElement)) return;
      const cleaned = stripCopyUiPhrases(node.nodeValue);
      node.nodeValue = isCopyUiText(cleaned) ? '' : cleaned;
    });
    sanitizeClonedMarkup(container);
  }