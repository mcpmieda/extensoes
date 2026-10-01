  function extensionContextAvailable() {
    if (APP.extensionContextLost || APP.lifecycle.destroyed) return false;
    try { return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id); }
    catch (_) { return false; }
  }

  function isInvalidExtensionContext(error) {
    return error?.code === 'GSSF_CONTEXT_INVALIDATED' || /extension context invalidated/i.test(String(error?.message || error || ''));
  }

  function requireExtensionContext() {
    if (extensionContextAvailable()) return;
    const error = new Error('A extensão foi atualizada ou desconectada. Recarregue a aba do Forms antes de continuar.');
    error.code = 'GSSF_CONTEXT_INVALIDATED';
    throw error;
  }

  function handleInvalidExtensionContext(error) {
    if (!isInvalidExtensionContext(error)) return false;
    if (APP.lifecycle.destroyed) return true;
    APP.extensionContextLost = true;
    destroyExtension();
    document.querySelectorAll('#gssf-copy-source,#gssf-copy-source-selection').forEach((node) => node.remove());
    if (!isRealFormsDocument() || document.getElementById('gssf-reconnect-notice')) return true;
    const notice = document.createElement('aside');
    notice.id = 'gssf-reconnect-notice';
    notice.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = 'ASSISTENTE DE FORMS';
    const message = document.createElement('p');
    message.textContent = 'A extensão foi atualizada ou desconectada. Recarregue esta aba do Forms para continuar.';
    const hint = document.createElement('p');
    hint.textContent = 'Aguarde o Forms indicar “Salvo” antes de recarregar.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Recarregar aba do Forms';
    reload.addEventListener('click', () => location.reload());
    notice.append(title, message, hint, reload);
    document.documentElement.appendChild(notice);
    return true;
  }
