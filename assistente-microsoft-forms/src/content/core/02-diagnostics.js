

  function errorText(error) {
    if (error instanceof Error) return error.message || error.name || 'Erro sem mensagem';
    return cleanText(error) || 'Erro sem detalhes';
  }

  function reportNonFatalError(operation, error, context = null) {
    const name = cleanText(operation) || 'operacao-nao-identificada';
    const message = errorText(error);
    const now = Date.now();
    const throttleKey = `${name}|${message}`;
    const lastReportedAt = Number(APP.errorThrottle.get(throttleKey) || 0);
    const entry = {
      at: new Date(now).toISOString(),
      operation: name,
      message,
      context: context && typeof context === 'object' ? context : undefined
    };
    APP.errorLog.push(entry);
    if (APP.errorLog.length > 80) APP.errorLog.splice(0, APP.errorLog.length - 80);
    if (now - lastReportedAt >= 30000) {
      APP.errorThrottle.set(throttleKey, now);
      console.warn(`[GSSF:${name}] ${message}`, error, context || '');
    }
    return entry;
  }