

  function flushDeferredLog() {
    const out = document.getElementById('gssf-log');
    const lines = APP.deferredLogLines.splice(0);
    APP.logFlushTimer = null;
    if (!lines.length) return;
    if (out) {
      const current = out.textContent || '';
      const next = current ? `${current}\n${lines.join('\n')}` : lines.join('\n');
      out.textContent = next.split('\n').slice(-80).join('\n');
      out.scrollTop = out.scrollHeight;
    }
    try {
      const saved = readSavedActivity();
      lines.forEach((line) => saved.push(line));
      writeSavedActivity(saved);
    } catch (_) {}
  }

  function log(message, append = true) {
    const out = document.getElementById('gssf-log');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const line = `[${time}] ${message}`;
    if (append && APP.lastLogLine === line) return;
    APP.lastLogLine = line;
    if (!append) {
      APP.deferredLogLines = [];
      clearTimeout(APP.logFlushTimer);
      APP.logFlushTimer = null;
      if (out) out.textContent = line;
      writeSavedActivity([line]);
      return;
    }
    APP.deferredLogLines.push(line);
    if (APP.deferredLogLines.length > 12 || !APP.logFlushTimer) {
      clearTimeout(APP.logFlushTimer);
      APP.logFlushTimer = setTimeout(flushDeferredLog, APP.busy ? 900 : 180);
    }
  }

  function setBusy(flag) {
    APP.busy = Boolean(flag);
    document.querySelectorAll('#gssf-root button').forEach((btn) => {
      if (btn.dataset.allowBusy !== '1') btn.disabled = APP.busy;
    });
    document.getElementById('gssf-root')?.classList.toggle('busy', APP.busy);
    if (!APP.busy) {
      try {
        updateActionAvailability(APP.lastAudit ? dataFromAudit(APP.lastAudit) : collectPrecheck());
      } catch (_) {}
    }
  }

  async function withBusy(fn) {
    if (APP.busy || APP.lifecycle.destroyed) return;
    setBusy(true);
    try { requireExtensionContext(); await fn(); }
    catch (error) {
      if (!handleInvalidExtensionContext(error)) { console.error(error); log(`Erro: ${error.message || error}`); toast('Erro na ação.'); }
    }
    finally {
      APP.busy = false;
      if (!APP.lifecycle.destroyed) { setBusy(false); scheduleAutoAnalysis(600); }
    }
  }
