

  function nativeSetValue(el, value) {
    try {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      return true;
    } catch (_) {
      try { el.value = value; return true; } catch (__) { return false; }
    }
  }

  function keyboardInfoForChar(ch) {
    if (ch === ' ') return { key: ' ', code: 'Space', numeric: 32 };
    if (/^[a-z]$/i.test(ch)) {
      const upper = ch.toUpperCase();
      return { key: ch, code: `Key${upper}`, numeric: upper.charCodeAt(0) };
    }
    if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, numeric: ch.charCodeAt(0) };
    const map = {
      '\\': ['\\', 'Backslash', 220], '{': ['{', 'BracketLeft', 219], '}': ['}', 'BracketRight', 221],
      '^': ['^', 'Digit6', 54], '_': ['_', 'Minus', 189], '+': ['+', 'Equal', 187], '-': ['-', 'Minus', 189],
      '/': ['/', 'Slash', 191], '.': ['.', 'Period', 190], ',': [',', 'Comma', 188], ':': [':', 'Semicolon', 186],
      '(': ['(', 'Digit9', 57], ')': [')', 'Digit0', 48]
    };
    const hit = map[ch] || [ch, '', ch.charCodeAt(0) || 0];
    return { key: hit[0], code: hit[1], numeric: hit[2] };
  }

  async function typeTextIntoMathTextarea(el, text, delay = 90) {
    if (!el) return false;
    let ok = false;
    for (const ch of String(text || '')) {
      ok = (await typeCharIntoMathTextarea(el, ch, delay)) || ok;
    }
    return ok;
  }

  async function sendTextToMathTextarea(el, text) {
    if (!el) return false;
    const value = String(text || '');
    try { el.focus(); } catch (_) {}
    try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value })); } catch (_) {}
    try { nativeSetValue(el, value); } catch (_) {}
    try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); } catch (_) { try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (__) {} }
    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Unidentified' })); } catch (_) {}
    await sleep(220);
    try { nativeSetValue(el, ''); } catch (_) {}
    return true;
  }

  async function typeCharIntoMathTextarea(el, ch, delay = null) {
    if (!el) return false;
    const { key, code, numeric } = keyboardInfoForChar(ch);
    try { el.focus(); } catch (_) {}
    try { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code, which: numeric, keyCode: numeric })); } catch (_) {}
    try { el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key, code, which: numeric, keyCode: numeric, charCode: String(ch).charCodeAt(0) || numeric })); } catch (_) {}
    try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch })); } catch (_) {}
    nativeSetValue(el, ch);
    try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch })); } catch (_) { try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (__) {} }
    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code, which: numeric, keyCode: numeric })); } catch (_) {}
    await sleep(delay ?? (ch === ' ' ? 170 : 140));
    try { nativeSetValue(el, ''); } catch (_) {}
    return true;
  }

  function pressMathKey(el, key, code, keyCode, extra = {}) {
    if (!el) return;
    try { el.focus(); } catch (_) {}
    ['keydown', 'keyup'].forEach((type) => {
      try { el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code, which: keyCode, keyCode, ...extra })); } catch (_) {}
    });
  }

  async function moveMathCursorToStart(el) {
    if (!el) return false;
    try { el.focus(); } catch (_) {}
    // MathQuill costuma responder a Home/Ctrl+Home quando o textarea oculto está ativo.
    for (let i = 0; i < 3; i += 1) {
      pressMathKey(el, 'Home', 'Home', 36);
      pressMathKey(el, 'Home', 'Home', 36, { ctrlKey: true });
      await sleep(70);
    }
    return true;
  }

  async function selectAllMathEditor(el) {
    if (!el) return false;
    try { el.focus(); } catch (_) {}
    try { if (typeof el.select === 'function') el.select(); } catch (_) {}
    try { if (typeof el.setSelectionRange === 'function') el.setSelectionRange(0, String(el.value || '').length); } catch (_) {}
    for (let i = 0; i < 2; i += 1) {
      pressMathKey(el, 'a', 'KeyA', 65, { ctrlKey: true });
      await sleep(90);
    }
    return true;
  }