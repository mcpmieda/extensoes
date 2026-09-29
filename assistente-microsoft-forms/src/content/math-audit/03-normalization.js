

  function asciiMathLetters(value) {
    const map = {
      '𝐀': 'A', '𝐴': 'A', '𝑨': 'A', '𝘈': 'A', '𝙰': 'A', '𝓐': 'A',
      '𝐁': 'B', '𝐵': 'B', '𝑩': 'B', '𝘉': 'B', '𝙱': 'B', '𝓑': 'B',
      '𝐂': 'C', '𝐶': 'C', '𝑪': 'C', '𝘊': 'C', '𝙲': 'C', '𝓒': 'C',
      '𝐃': 'D', '𝐷': 'D', '𝑫': 'D', '𝘋': 'D', '𝙳': 'D', '𝓓': 'D',
      '𝐄': 'E', '𝐸': 'E', '𝑬': 'E', '𝘌': 'E', '𝙴': 'E', '𝓔': 'E'
    };
    return String(value || '').replace(/[𝐀𝐴𝑨𝘈𝙰𝓐𝐁𝐵𝑩𝘉𝙱𝓑𝐂𝐶𝑪𝘊𝙲𝓒𝐃𝐷𝑫𝘋𝙳𝓓𝐄𝐸𝑬𝘌𝙴𝓔]/gu, (ch) => map[ch] || ch);
  }

  function normalizedMathOptionText(el) {
    return cleanText(asciiMathLetters([
      el?.getAttribute?.('aria-label') || '',
      el?.getAttribute?.('data-mathml') || '',
      textOf(el)
    ].join(' ')));
  }

  function mathOptionTextSamples(optionContainer, field) {
    const samples = [];
    const add = (value) => {
      const cleaned = cleanText(asciiMathLetters(value || ''));
      if (cleaned && !samples.includes(cleaned)) samples.push(cleaned);
    };
    add(optionContainer?.getAttribute?.('aria-label') || '');
    add(field?.getAttribute?.('aria-label') || '');
    optionContainer?.querySelectorAll?.('script[type="math/tex"], [data-mathml], math, .MathJax, [class*="MathJax"]').forEach((el) => {
      add(el.textContent || '');
      add(el.getAttribute?.('data-mathml') || '');
      add(el.getAttribute?.('aria-label') || '');
    });
    add(textOf(optionContainer || field));
    add(normalizedMathOptionText(optionContainer || field));
    return samples;
  }

  function collapseRepeatedMathText(text) {
    let value = cleanText(asciiMathLetters(text || '')).replace(/[​-‍﻿]/g, '').trim();
    // As amostras são texto ou atributos, não HTML a ser analisado aqui.
    // "x < 2 e x > -2" deve conservar todos os operadores e termos.
    return cleanText(value.replace(/&nbsp;/gi, ' '));
  }

  function cleanMathBodyForLetter(text, optIndex) {
    const wanted = escapeRegExp(letter(optIndex));
    let value = collapseRepeatedMathText(text);
    if (!value) return '';
    // Remove uma ou mais letras já inseridas no começo: "A 64" / "A A 64" -> "64".
    value = value.replace(new RegExp(`^(?:\\s*${wanted}\\s+)+`, 'i'), '').trim();
    // Nunca remover letras no fim da expressão: elas podem ser conteúdo matemático legítimo.
    // A limpeza só isola o prefixo no início quando o chamador realmente precisa dele.
    if (new RegExp('^' + wanted + '\\s*$', 'i').test(value)) return '';
    // Em leituras MathJax, às vezes a mesma expressão aparece duas vezes depois da limpeza.
    value = collapseRepeatedMathText(value);
    return value;
  }

  function mathBodyForLetter(optionContainer, field, optIndex) {
    const samples = mathOptionTextSamples(optionContainer, field);
    const cleaned = samples.map((sample) => cleanMathBodyForLetter(sample, optIndex)).filter(Boolean);
    if (!cleaned.length) return '';
    // Preferir a versão mais curta útil: geralmente é o LaTeX/aria-label limpo, não o texto renderizado duplicado.
    return cleaned.sort((a, b) => {
      const ad = /[0-9A-Za-zÀ-ÿ]/.test(a) ? 0 : 1;
      const bd = /[0-9A-Za-zÀ-ÿ]/.test(b) ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return a.length - b.length;
    })[0];
  }

  function mathOptionAlreadyHasLetter(optionContainer, field, optIndex) {
    const wanted = escapeRegExp(letter(optIndex));
    // Em fórmulas, qualquer caractere não-letra imediatamente após A/B/C/D/E pode
    // pertencer à própria expressão (A√25, B∑x, C%5, D², E(x+1), etc.).
    // O caso é considerado ambíguo e fica intocado.
    const prefix = new RegExp('^\\s*' + wanted + '(?:\\s+|$|(?=[^\\p{L}]))', 'iu');
    return mathOptionTextSamples(optionContainer, field).some((sample) => prefix.test(collapseRepeatedMathText(sample)));
  }

  function mathOptionHasRepeatedLeadingLetter(optionContainer, field, optIndex) {
    const wanted = escapeRegExp(letter(optIndex));
    const repeated = new RegExp(`^\\s*${wanted}\\s+${wanted}(?:\\s+|$)`, 'i');
    return mathOptionTextSamples(optionContainer, field).some((sample) => repeated.test(collapseRepeatedMathText(sample)));
  }

  function mathOptionHasWantedLoosePrefix(optionContainer, field, optIndex) {
    const wanted = escapeRegExp(letter(optIndex));
    const loose = new RegExp(`^\\s*(?:${wanted}\\s+)+\\S`, 'i');
    return mathOptionTextSamples(optionContainer, field).some((sample) => loose.test(collapseRepeatedMathText(sample)));
  }

  function mathEquationTextareaLike(el) {
    if (!el || String(el.tagName || '').toLowerCase() !== 'textarea') return false;
    const label = normalizeText(`${el.getAttribute?.('aria-label') || ''} ${el.className || ''} ${el.parentElement?.className || ''}`);
    return label.includes('inserir uma equacao') || label.includes('inserir uma equação') || label.includes('equation') || el.closest?.('.mq-editable-field,.mq-math-mode,.mq-textarea');
  }

  function findMathTextareaNear(field, optionContainer = null) {
    const active = document.activeElement;
    if (mathEquationTextareaLike(active)) {
      const activeRoot = active.closest?.('.mq-editable-field,.mq-math-mode,[role="dialog"],[data-automation-id]') || active;
      if (optionContainer?.contains?.(active) || nearElement(field, activeRoot, 760, 620) || (optionContainer && nearElement(optionContainer, activeRoot, 760, 620))) return active;
    }
    const candidates = Array.from(document.querySelectorAll('textarea[aria-label], .mq-textarea textarea, .mq-editable-field textarea'))
      .filter((el) => mathEquationTextareaLike(el))
      .filter((el) => {
        if (optionContainer && optionContainer.contains?.(el)) return true;
        const root = el.closest?.('.mq-editable-field,.mq-math-mode,[role="dialog"],[data-automation-id]') || el;
        return nearElement(field, root, 760, 620) || (optionContainer && nearElement(optionContainer, root, 760, 620));
      });
    return candidates.sort((a, b) => fieldRectDistanceScore(a.closest?.('.mq-editable-field') || a, field) - fieldRectDistanceScore(b.closest?.('.mq-editable-field') || b, field))[0] || null;
  }
