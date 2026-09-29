

  async function mount(panel, options = {}) {
    if (mounted && printHostPanel === panel) return;
    if (mountPromise) return mountPromise;
    mountPromise = (async () => {
      await globalThis.GSSF_STORAGE?.init?.();
      printHostPanel = panel;
      const host = panel?.querySelector?.('#gssf-native-print-host');
      if (!host) throw new Error('Área nativa da Impressão não encontrada.');
      host.replaceChildren();
      printShadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
      printShadowRoot.innerHTML = `<style>${PRINT_ORIGINAL_CSS}</style><div class="print-app-root">${PRINT_ORIGINAL_BODY}</div>`;
      printRuntime = await startPrintingRuntime(printShadowRoot, options);
      printResizeObserver?.disconnect?.();
      if (typeof ResizeObserver === 'function') {
        printResizeObserver = new ResizeObserver(() => printRuntime?.resetPreviewPosition?.());
        printResizeObserver.observe(host);
      }
      mounted = true;
    })().finally(() => { mountPromise = null; });
    return mountPromise;
  }

  function activate() {
    printRuntime?.activate?.();
  }

  function unmount() {
    printResizeObserver?.disconnect?.();
    printResizeObserver = null;
    try { printRuntime?.destroy?.(); } catch (error) { console.warn('Falha ao encerrar Impressão:', error); }
    printRuntime = null;
    printShadowRoot = null;
    printHostPanel = null;
    mounted = false;
    try { if (activePrintWindow && !activePrintWindow.closed) activePrintWindow.close(); } catch (_) {}
    activePrintWindow = null;
    document.documentElement.classList.remove('gssf-native-printing');
    document.getElementById('gssf-native-print-portal')?.remove();
    document.getElementById('gssf-native-print-global-style')?.remove();
    delete globalThis.ImpressaoPreviewApp;
    delete globalThis.ImpressaoCorrespondenciaSegura;
    delete globalThis.ImpressaoAnalisePedagogica;
  }

  async function flushBackupState() {
    printRuntime?.flushBackupState?.();
    await globalThis.GSSF_STORAGE?.flush?.();
  }

  async function reloadBackupState() {
    printRuntime?.reloadBackupState?.();
  }

  async function clearStoredData({ resetRuntime = true } = {}) {
    const panel = printHostPanel;
    if (mounted) unmount();
    try {
      await deletePrintLotDatabase();
    } catch (error) {
      if (resetRuntime && panel?.isConnected) {
        try { await mount(panel); } catch (_) {}
      }
      throw error;
    }
    if (resetRuntime && panel?.isConnected) await mount(panel, { skipStoredState: true });
  }

  const publicApi = Object.freeze({
    workspaceHtml,
    mount,
    activate,
    unmount,
    clearStoredData,
    flushBackupState,
    reloadBackupState,
    isMounted: () => mounted,
    getSourceVersion: () => PRINT_SOURCE_VERSION,
    getSourceHashes: () => ({ ...PRINT_SOURCE_HASHES }),
    getSharedSnapshot: () => printRuntime?.getSnapshot?.() || null,
    handleSharedQuery: (action, params) => printRuntime?.handleQuery?.(action, params)
  });

  globalThis.GSSFPrinting = publicApi;
  globalThis.ImpressaoNativaApp = publicApi;
