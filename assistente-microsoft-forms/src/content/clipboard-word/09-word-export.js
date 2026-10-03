

  function escapeWordHtmlText(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Normalize only the detached export, never the live Forms question.
  // A bare numeric answer must not look like another question to Word macros.
  function normalizeWordQuestionMarkers(bodyHtml) {
    if (!/data-gssf-copy-question-(?:number|index)\s*=/.test(bodyHtml)) return bodyHtml;
    const template = document.createElement('template');
    template.innerHTML = bodyHtml;
    const scopes = Array.from(template.content.querySelectorAll('[data-gssf-copy-question-number], [data-gssf-copy-question-index]'))
      .filter(scope => !scope.parentElement?.closest('[data-gssf-copy-question-number], [data-gssf-copy-question-index]'));
    for (const scope of scopes) {
      const rawNumber = scope.getAttribute('data-gssf-copy-question-number') || scope.getAttribute('data-gssf-copy-question-index');
      if (!/^\d{1,4}$/.test(rawNumber || '') || Number(rawNumber) < 1) throw new Error('Número de questão inválido na exportação Word.');
      const number = Number(rawNumber);
      const title = scope.querySelector('[data-automation-id="questionTitle"]');
      const marker = Array.from(scope.querySelectorAll('div, p, span')).find(el => {
        if (el.children.length || el.closest('[data-automation-id="questionChoiceOptionContainer"], [role="radio"]')) return false;
        if (title && !(el.compareDocumentPosition(title) & 4)) return false;
        return new RegExp(`^(?:Quest[ãa]o\\s+)?0*${number}[.)]?\\s*$`, 'i').test(el.textContent.trim());
      });
      if (!marker) throw new Error(`Não foi possível identificar o número da questão ${number}. O Word não foi gerado.`);
      marker.textContent = `Questão ${String(number).padStart(2, '0')}`;
      marker.style.display = 'block';
      const options = Array.from(scope.querySelectorAll('[data-automation-id="questionChoiceOptionContainer"]'));
      options.forEach((option, index) => {
        if (index >= 26) throw new Error('Quantidade de alternativas não suportada na exportação Word.');
        if (option.querySelector('.gssf-word-option-letter')) return;
        const host = option.querySelector('.text-format-content') || option.querySelector('.gssf-word-math-formula-row');
        if (!host) throw new Error(`Não foi possível identificar uma alternativa da questão ${number}.`);
        // Preserve existing labels and operators; add only a missing label.
        if (/^[A-Za-z][).](?:\s|$)/.test(host.textContent.trim())) return;
        const label = document.createElement('span');
        label.className = 'gssf-word-option-letter';
        label.textContent = `${String.fromCharCode(65 + index)}) `;
        host.prepend(label);
      });
    }
    return template.innerHTML;
  }

  function buildWordHtmlDocument(payload, title) {
    const bodyHtml = normalizeWordQuestionMarkers(payload?.innerHtml || String(payload?.html || '').replace(/^.*?<body[^>]*>/is, '').replace(/<\/body>.*$/is, ''));
    const safeTitle = escapeWordHtmlText(title || 'Questões do Forms');
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Assistente de Forms">
  <title>${safeTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page WordSection1 { size: 21cm 29.7cm; margin: 1.7cm 1.7cm 1.7cm 1.7cm; }
    div.WordSection1 { page: WordSection1; }
    body { font-family: Arial, Segoe UI, sans-serif; font-size: 12pt; color: #111; background: #fff; line-height: normal; }
    body, article, div, p, li, .gssf-copy-question { margin-top: 0 !important; margin-bottom: 0 !important; mso-margin-top-alt: 0cm !important; mso-margin-bottom-alt: 0cm !important; line-height: normal !important; mso-line-height-rule: auto; }
    b, strong { font-weight: 700; }
    article, .gssf-copy-question { page-break-inside: avoid; break-inside: avoid; margin: 0 !important; padding: 0 !important; line-height: normal !important; }
    img { max-width: 100%; height: auto; display: block; margin: 8pt 0; }
    p { margin: 0 !important; padding: 0 !important; line-height: normal !important; }
    .gssf-word-math-formula-row { text-align:left !important; margin:0 !important; line-height:normal !important; page-break-inside:avoid; }
    .gssf-word-option-letter { font-family:Arial, Segoe UI, sans-serif !important; font-style:normal !important; font-weight:normal !important; }
    .gssf-word-math-formula-body, .gssf-word-mathml, .gssf-word-math-body { display:inline-block !important; text-align:left !important; vertical-align:middle !important; margin:0 !important; }
    .gssf-word-math-formula-row math { text-align:left !important; margin:0 !important; }
    [data-gssf-copy-block-layout="1"] { display:block !important; margin-top:0 !important; margin-bottom:0 !important; line-height:normal !important; }
    [data-gssf-copy-title-blocks] > * { display:block !important; line-height:normal !important; margin-top:0 !important; margin-bottom:0 !important; }
    [data-gssf-copy-real-block="1"] { display:block !important; line-height:normal !important; margin-top:0 !important; margin-bottom:0 !important; }
    .gssf-word-title-line { display:block !important; margin:0 !important; padding:0 !important; line-height:normal !important; mso-margin-top-alt:0cm !important; mso-margin-bottom-alt:0cm !important; mso-line-height-rule:auto; }
  </style>
</head>
<body>
  <div class="WordSection1">
    ${bodyHtml}
  </div>
</body>
</html>`;
  }

  function downloadWordHtmlFile(payload) {
    const title = getFormTitle() || document.title || 'Questões do Forms';
    const safeTitle = safeFileNamePart(title, 'questoes-forms');
    const html = buildWordHtmlDocument(payload, title);
    downloadFile(`${safeTitle}-questoes.doc`, '\ufeff' + html, 'application/msword;charset=utf-8');
    return { fileName: `${safeTitle}-questoes.doc`, html };
  }

  async function runDownloadWordQuestions() {
    await withBusy(async () => {
      if (!isRealFormsDocument()) { log('Abra um formulário real do Microsoft Forms antes de baixar o Word.'); return; }
      showTaskOverlay('Baixando Word', 'Preparando o Forms...');
      try {
        if (pageMode() === 'visualização') {
          log('Você está na visualização. Vou voltar para a edição antes de continuar.');
          await stepProgress('copy', 6, 'Voltando para edição...', 150);
          await returnToEditIfPreview();
        }
        await stepProgress('copy', 8, 'Mapeando formulário...', 100);
        await scrollAll();
        log('Gerando arquivo Word...');
        let snapshots = [];
        showTaskOverlay('Baixando Word', 'Capturando questões e imagens na edição.');
        await stepProgress('copy', 18, 'Capturando questões na edição...', 100);
        snapshots = await collectAllQuestionSnapshotsForCopy('copy');
        if (!snapshots.length) {
          showTaskOverlay('Baixando Word', 'Abrindo a visualização como alternativa.');
          await stepProgress('copy', 28, 'Preparando visualização...', 100);
          await tryPreview();
          await stepProgress('copy', 34, 'Carregando todas as questões...', 100);
          snapshots = await collectAllQuestionSnapshotsForCopy('copy');
        }
        await stepProgress('copy', 58, 'Conferindo blocos...', 100);
        let blocks = collectQuestionBlocks();
        const liveImageCount = countContentImages(blocks, []).count;
        const snapshotImageCount = snapshots.reduce((sum, item) => sum + Math.max(Number(item.imageCount || 0), Number(item.imageKeys?.length || 0)), 0);
        const useSnapshots = snapshots.length && !(liveImageCount && blocks.length >= snapshots.length && snapshotImageCount < liveImageCount);
        const wordBlocks = useSnapshots ? blocksFromQuestionSnapshots(snapshots) : blocks;
        if (!wordBlocks.length) { log('Não encontrei blocos de questões. Abra a edição do Forms e tente novamente.'); toast('Questões não encontradas.'); setProgress('copy', 0, ''); hideTaskOverlay(100); return; }
        const nums = (snapshots.length ? snapshots.map((item) => item.number) : blocks.map(questionNumberFromBlock)).filter((n) => n > 0);
        if (nums.length && !nums.includes(1)) { log('Não encontrei a questão 1. Cancelei para evitar arquivo incompleto.'); toast('Questão 1 não encontrada.'); setProgress('copy', 0, ''); hideTaskOverlay(100); return; }

        await stepProgress('copy', 72, 'Preparando imagens para o Word...', 120);
        APP.copyImageCache = new Map();
        const imageKeys = new Set(snapshots.flatMap((item) => item.imageKeys || []));
        const images = Math.max(imageKeys.size, snapshotImageCount, liveImageCount);
        const payload = await prepareCopyPayloadFromBlocks(wordBlocks, 'copy', { wordDownload: true });
        const imageCheckOk = copyImageCheckOk(payload, images);
        requireExtensionContext();
        if (!imageCheckOk) throw new Error('Não foi possível embutir todas as imagens. O download foi cancelado; tente novamente.');
        await stepProgress('copy', 88, 'Baixando arquivo Word...', 120);
        requireExtensionContext();
        const file = downloadWordHtmlFile(payload);
        await stepProgress('copy', 94, 'Voltando para edição...', 120);
        await returnToEditIfPreview();
        const empty = wordBlocks.filter(isEmptyModel).length;
        const inline = payload?.inlineResult || {};
        log(`Arquivo Word baixado. Arquivo: ${file.fileName}; questões: ${wordBlocks.length}; imagens detectadas: ${images}; img no HTML: ${payload?.htmlImageCount || 0}; img embutidas: ${payload?.dataImageCount || inline.converted || 0}; alternativas matemáticas em fórmula: ${payload?.wordMathResult?.changed || 0}; falhas matemática/fórmula: ${payload?.wordMathResult?.failed || 0}; cache imagens: ${inline.cached || 0}; falhas de imagem: ${inline.failed || 0}; conferência: ${imageCheckOk ? 'OK' : 'revisar'}; questões em branco: ${empty}.`);
        toast(imageCheckOk ? 'Word baixado com imagens conferidas.' : 'Word baixado. Revise imagens.');
        setProgress('copy', 100, 'Concluído.');
        resetProgressSoon('copy', 700);
      } finally {
        APP.copyImageCache = null;
        hideTaskOverlay(700);
        if (!APP.lifecycle.destroyed) scheduleAutoAnalysis(900);
      }
    });
  }

  async function runCopyQuestions() {
    await withBusy(async () => {
      if (!isRealFormsDocument()) { log('Abra um formulário real do Microsoft Forms antes de copiar.'); return; }
      showTaskOverlay('Copiando questões', 'Preparando o Forms...');
      try {
        if (pageMode() === 'visualização') {
          log('Você está na visualização. Vou voltar para a edição antes de continuar.');
          await stepProgress('copy', 6, 'Voltando para edição...', 180);
          await returnToEditIfPreview();
        }
        await stepProgress('copy', 8, 'Mapeando formulário...', 120);
        await scrollAll();
        log('Copiando questões...');
        let snapshots = [];
        showTaskOverlay('Copiando questões', 'Capturando questões e imagens na edição.');
        await stepProgress('copy', 18, 'Capturando questões na edição...', 120);
        snapshots = await collectAllQuestionSnapshotsForCopy('copy');
        if (!snapshots.length) {
          showTaskOverlay('Copiando questões', 'Abrindo a visualização como alternativa.');
          await stepProgress('copy', 28, 'Preparando visualização...', 120);
          await tryPreview();
          await stepProgress('copy', 34, 'Carregando todas as questões...', 120);
          snapshots = await collectAllQuestionSnapshotsForCopy('copy');
        }
        await stepProgress('copy', 58, 'Conferindo blocos...', 120);
        let blocks = collectQuestionBlocks();
        const liveImageCount = countContentImages(blocks, []).count;
        const snapshotImageCount = snapshots.reduce((sum, item) => sum + Math.max(Number(item.imageCount || 0), Number(item.imageKeys?.length || 0)), 0);
        const useSnapshots = snapshots.length && !(liveImageCount && blocks.length >= snapshots.length && snapshotImageCount < liveImageCount);
        const copyBlocks = useSnapshots ? blocksFromQuestionSnapshots(snapshots) : blocks;
        if (!copyBlocks.length) { log('Não encontrei blocos de questões. Abra a edição do Forms e tente novamente.'); toast('Questões não encontradas.'); setProgress('copy', 0, ''); hideTaskOverlay(100); return; }
        const nums = (snapshots.length ? snapshots.map((item) => item.number) : blocks.map(questionNumberFromBlock)).filter((n) => n > 0);
        if (nums.length && !nums.includes(1)) { log('Não encontrei a questão 1. Cancelei para evitar cópia incompleta.'); toast('Questão 1 não encontrada.'); setProgress('copy', 0, ''); hideTaskOverlay(100); return; }

        const sel = window.getSelection();
        try { sel.removeAllRanges(); } catch (_) {}
        await stepProgress('copy', 76, 'Copiando para área de transferência...', 160);
        APP.copyImageCache = new Map();

        const imageKeys = new Set(snapshots.flatMap((item) => item.imageKeys || []));
        const images = Math.max(imageKeys.size, snapshotImageCount, liveImageCount);
        const copyResult = await copyBlocksToClipboardWithImageSafety(copyBlocks, images, 'copy');
        const copied = Boolean(copyResult?.copied);
        await stepProgress('copy', 92, 'Voltando para edição...', 160);
        await returnToEditIfPreview();
        const empty = copyBlocks.filter(isEmptyModel).length;
        const inline = copyResult?.inlineResult || {};
        if (copied) {
          sel.removeAllRanges();
          const imageCheckOk = copyImageCheckOk(copyResult, images);
          log(`Questões copiadas. Questões: ${copyBlocks.length}; imagens detectadas: ${images}; img no HTML: ${copyResult?.htmlImageCount || 0}; img embutidas: ${copyResult?.dataImageCount || inline.converted || 0}; cache imagens: ${inline.cached || 0}; falhas de imagem: ${inline.failed || 0}; conferência: ${imageCheckOk ? 'OK' : 'revisar'}; método: ${copyResult?.usedMethod || 'padrão'}; questões em branco: ${empty}.`);
          toast(imageCheckOk ? 'Questões copiadas com imagens conferidas.' : 'Copiado, mas revise imagens.');
        } else {
          log('Cópia automática bloqueada pelo navegador. Tente novamente com a aba do Forms ativa.');
          toast('Cópia bloqueada.');
        }
        setProgress('copy', 100, 'Concluído.');
        resetProgressSoon('copy', 700);
      } finally {
        APP.copyImageCache = null;
        hideTaskOverlay(700);
        if (!APP.lifecycle.destroyed) scheduleAutoAnalysis(900);
      }
    });
  }
