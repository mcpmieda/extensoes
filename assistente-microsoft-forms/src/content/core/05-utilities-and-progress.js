

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pluralPt(count, singular, plural) {
    return `${count} ${Number(count) === 1 ? singular : plural}`;
  }

  function formatReadTimeParts(value) {
    const raw = String(value || '').trim();
    const date = raw ? new Date(raw) : new Date();
    if (Number.isFinite(date.getTime())) {
      return {
        date: date.toLocaleDateString('pt-BR'),
        time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        full: date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      };
    }
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return { date: parts[0], time: parts.slice(1).join(' '), full: `${parts[0]} ${parts.slice(1).join(' ')}` };
    return { date: raw || 'data não registrada', time: '', full: raw || 'data não registrada' };
  }

  function formatReadTime(value) {
    const parts = formatReadTimeParts(value);
    return parts.time ? `${parts.date} às ${parts.time}` : parts.date;
  }

  function letter(index) {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index] || `#${index + 1}`;
  }

  function downloadFile(fileName, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 300);
  }

  function toast(message) {
    let box = document.getElementById('gssf-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'gssf-toast';
      document.documentElement.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => box.classList.remove('show'), 2600);
  }

  function getActivityStorageKey() {
    const id = getFormUniqueId(APP.lastAudit || { url: location.href, questions: [] });
    return `gssf_activity:${id}`;
  }

  function readSavedActivity() {
    try {
      const raw = GSSF_STORAGE.getItem(getActivityStorageKey());
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr.slice(-80) : [];
    } catch (error) {
      reportNonFatalError('atividade:ler', error);
      return [];
    }
  }

  function writeSavedActivity(lines) {
    try { GSSF_STORAGE.setItem(getActivityStorageKey(), JSON.stringify((lines || []).slice(-80))); }
    catch (error) { reportNonFatalError('atividade:salvar', error); }
  }

  function restoreActivityLog() {
    const out = document.getElementById('gssf-log');
    if (!out) return;
    const saved = readSavedActivity();
    if (saved.length) out.textContent = saved.join('\n');
  }

  function saveActivityLine(line) {
    const saved = readSavedActivity();
    saved.push(line);
    writeSavedActivity(saved);
  }

  function setProgress(id, value, label) {
    const wrap = document.getElementById(`gssf-progress-${id}`);
    if (!wrap) return;
    clearTimeout(APP.progressTimers[id]);
    APP.progressTimers[id] = null;
    const requested = Math.max(0, Math.min(100, Math.round(value || 0)));
    const previous = Number(APP.progressValues[id] || 0);
    const newCycle = previous >= 100 && requested > 0 && requested < 100;
    const pct = requested <= 0 ? 0 : (newCycle ? requested : Math.max(previous, requested));
    APP.progressValues[id] = pct;
    const text = label || (pct ? `${pct}%` : '');
    const nextState = `${pct}|${text}|${pct > 0 && pct < 100 ? 1 : 0}|${pct >= 100 ? 1 : 0}`;
    if (APP.lastProgressState[id] === nextState) {
      if ((id === 'copy' || id === 'sections' || id === 'letters') && pct > 0) updateTaskOverlay(pct, text);
      return;
    }
    APP.lastProgressState[id] = nextState;
    const bar = wrap.querySelector('.gssf-progress-bar');
    const textEl = wrap.querySelector('.gssf-progress-label');
    wrap.classList.toggle('active', pct > 0 && pct < 100);
    wrap.classList.toggle('done', pct >= 100);
    if (bar && bar.style.width !== `${pct}%`) bar.style.width = `${pct}%`;
    if (textEl && textEl.textContent !== text) textEl.textContent = text;
    if ((id === 'copy' || id === 'sections' || id === 'letters') && pct > 0) updateTaskOverlay(pct, text);
    if (requested <= 0) {
      if (bar && bar.style.width !== '0%') bar.style.width = '0%';
      wrap.classList.remove('active', 'done');
      if (textEl && textEl.textContent) textEl.textContent = '';
      APP.lastProgressState[id] = '';
    }
  }

  async function stepProgress(id, value, label, wait = GSSF_TIMING.progressStepMs) {
    setProgress(id, value, label);
    await sleep(wait);
  }

  function resetProgressSoon(id, delay = GSSF_TIMING.progressResetMs) {
    clearTimeout(APP.progressTimers[id]);
    APP.progressTimers[id] = setTimeout(() => setProgress(id, 0, ''), delay);
  }

  function showTaskOverlay(title, message = '') {
    clearTimeout(APP.overlayHideTimer);
    APP.overlayHideTimer = null;
    let overlay = document.getElementById('gssf-work-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'gssf-work-overlay';
      overlay.innerHTML = '<div class="gssf-work-box"><div class="gssf-work-dots" aria-hidden="true"><i></i><i></i><i></i></div><strong></strong><p></p><div class="gssf-work-progress"><span></span></div></div>';
      document.documentElement.appendChild(overlay);
    }
    const titleText = title || 'Processando...';
    const messageText = message || 'Aguarde. Não clique no Forms até a tarefa terminar.';
    const titleEl = overlay.querySelector('strong');
    const msgEl = overlay.querySelector('p');
    const bar = overlay.querySelector('.gssf-work-progress span');
    if (titleEl && titleEl.textContent !== titleText) titleEl.textContent = titleText;
    if (msgEl && msgEl.textContent !== messageText) msgEl.textContent = messageText;
    if (bar && bar.style.width !== '4%') bar.style.width = '4%';
    APP.lastOverlayState = { pct: 4, message: messageText, title: titleText };
    overlay.classList.add('show');
  }

  function updateTaskOverlay(value, message = '') {
    const overlay = document.getElementById('gssf-work-overlay');
    if (!overlay) return;
    const requested = Math.max(4, Math.min(100, Math.round(value || 0)));
    const previous = Number(APP.lastOverlayState.pct || 4);
    const pct = Math.max(previous, requested);
    const text = message || '';
    if (APP.lastOverlayState.pct === pct && APP.lastOverlayState.message === text) return;
    APP.lastOverlayState = { ...APP.lastOverlayState, pct, message: text };
    const bar = overlay.querySelector('.gssf-work-progress span');
    if (bar && bar.style.width !== `${pct}%`) bar.style.width = `${pct}%`;
    if (text) {
      const msgEl = overlay.querySelector('p');
      if (msgEl && msgEl.textContent !== text) msgEl.textContent = text;
    }
  }

  function hideTaskOverlay(delay = GSSF_TIMING.overlayHideMs) {
    const overlay = document.getElementById('gssf-work-overlay');
    if (!overlay) return;
    clearTimeout(APP.overlayHideTimer);
    APP.overlayHideTimer = setTimeout(() => {
      APP.overlayHideTimer = null;
      overlay.classList.remove('show');
    }, delay);
  }