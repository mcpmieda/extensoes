  // ===== 40-sections-dialogs.js =====
// Fonte modular: sections dialogs.
  // O recurso de remoção de seções permanece implementado neste módulo,
  // mesmo sem botão visível na interface atual. Preserve estas funções para
  // eventual reativação futura do comando sem necessidade de reconstrução.
  async function removeSections(totalKnown = 0, progressId = 'sections') {
    async function removeOne() {
      const section = getSectionBlocks().slice(-1)[0];
      if (!section) return false;
      await scrollBlockIntoView(section);
      dispatchHoverOn(section);
      try { section.focus?.({ preventScroll: true }); } catch (_) {}
      await sleep(180);
      let menus = sectionMenuCandidates(section);
      if (!menus.length) {
        dispatchHoverOn(section);
        await sleep(520);
        menus = sectionMenuCandidates(section);
      }
      if (!menus.length) return false;
      fireRealClick(menus[0]);
      const remove = await waitFor(() => [...exactLabel('remover secao'), ...exactLabel('remover seção')].filter((el) => !el.closest('#gssf-root')), 4200);
      if (!remove.length) return false;
      fireRealClick(remove[remove.length - 1]);
      const only = await waitFor(() => [...exactLabel('apenas secao'), ...exactLabel('apenas seção'), ...exactLabel('somente secao'), ...exactLabel('somente seção')].filter((el) => !el.closest('#gssf-root')), 4200);
      if (!only.length) return false;
      fireRealClick(only[only.length - 1]);
      await sleep(360);
      await clearFormsFocusArtifacts();
      return true;
    }
    let total = 0;
    document.documentElement.classList.add('gssf-silent-work');
    try {
      while (await removeOne()) {
        total += 1;
        const pct = totalKnown ? Math.min(94, 12 + Math.round((total / totalKnown) * 78)) : Math.min(92, 12 + total * 10);
        setProgress(progressId, pct, `Removendo seções... ${total}${totalKnown ? '/' + totalKnown : ''}`);
        await sleep(520);
        await clearFormsFocusArtifacts();
      }
    } finally {
      await clearFormsFocusArtifacts();
      document.documentElement.classList.remove('gssf-silent-work');
    }
    return total;
  }

  async function runRemoveSections(forceConfirm) {
    await withBusy(async () => {
      await stepProgress('sections', 4, 'Mapeando seções...', 120);
      await scrollAll();
      const sections = getSectionBlocks();
      if (!sections.length) { log('Nenhuma seção detectada.'); toast('Sem seções.'); setProgress('sections', 0, ''); return; }
      if (forceConfirm) {
        const ok = await askConfirm({ title: 'Remover seções?', message: `Vou remover ${pluralPt(sections.length, 'seção', 'seções')} mantendo as perguntas. Essa ação não pode ser desfeita pelo assistente.`, confirmText: 'Remover seções', danger: true });
        if (!ok) {
          log('Remoção cancelada.');
          setProgress('sections', 0, '');
          resetProgressSoon('sections', 80);
          return;
        }
      }
      await sleep(170);
      showTaskOverlay('Removendo seções', 'O Forms pode mudar a tela durante a remoção. Aguarde a finalização.');
      try {
        log('Removendo seções...');
        await stepProgress('sections', 8, 'Iniciando...', 120);
        const total = await removeSections(sections.length, 'sections');
        setProgress('sections', 96, 'Finalizando...', 160);
        await scrollAll();
        const remainingSections = getSectionBlocks().length;
        closeOpenMenus();
        await sleep(300);
        closeOpenMenus();
        log(remainingSections ? `Seções removidas: ${total}. Ainda aparecem ${remainingSections}.` : `Seções removidas: ${total}.`);
        toast(remainingSections ? 'Ainda há seções no formulário.' : `Seções removidas: ${total}`);
        setProgress('sections', 100, 'Concluído.');
        resetProgressSoon('sections', 700);
        setTimeout(() => setProgress('sections', 0, ''), 900);
        scheduleAutoAnalysis(500);
      } finally {
        hideTaskOverlay(700);
      }
    });
  }