

  async function askConfirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, requireText = '', hideCancel = false }) {
    return new Promise((resolve) => {
      let modal = document.getElementById('gssf-confirm-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gssf-confirm-modal';
        document.documentElement.appendChild(modal);
      }
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const titleId = 'gssf-confirm-title';
      const descriptionId = 'gssf-confirm-description';
      modal.classList.remove('omr-mode');
      modal.innerHTML = `
        <div class="gssf-dialog" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${descriptionId}" tabindex="-1">
          <h3 id="${titleId}">${escapeHtml(title)}</h3>
          <p id="${descriptionId}">${escapeHtml(message)}</p>
          ${requireText ? `<label class="gssf-confirm-field"><span>Digite <b>${escapeHtml(requireText)}</b> para confirmar</span><input id="gssf-confirm-text" type="text" autocomplete="off" spellcheck="false"></label>` : ''}
          <div class="gssf-dialog-actions">
            ${hideCancel ? '' : `<button type="button" class="gssf-btn" id="gssf-cancel">${escapeHtml(cancelText)}</button>`}
            <button type="button" class="gssf-btn ${danger ? 'danger' : 'ok'}" id="gssf-ok" ${requireText ? 'disabled' : ''}>${escapeHtml(confirmText)}</button>
          </div>
        </div>`;
      const dialog = modal.querySelector('[role="dialog"]');
      const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
      let settled = false;
      const close = (value) => {
        if (settled) return;
        settled = true;
        modal.classList.remove('show');
        document.removeEventListener('keydown', handleKeydown, true);
        setTimeout(() => {
          if (previousFocus?.isConnected) previousFocus.focus();
        }, 0);
        resolve(value);
      };
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(dialog?.querySelectorAll(focusableSelector) || []).filter((element) => !element.hidden && element.getClientRects().length);
        if (!focusable.length) {
          event.preventDefault();
          dialog?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      modal.querySelector('#gssf-cancel')?.addEventListener('click', () => close(false));
      modal.querySelector('#gssf-ok')?.addEventListener('click', () => close(true));
      const confirmInput = modal.querySelector('#gssf-confirm-text');
      if (confirmInput) {
        const okBtn = modal.querySelector('#gssf-ok');
        const update = () => { okBtn.disabled = normalizeText(confirmInput.value) !== normalizeText(requireText); };
        confirmInput.addEventListener('input', update);
      }
      document.addEventListener('keydown', handleKeydown, true);
      modal.classList.add('show');
      setTimeout(() => {
        const initial = confirmInput || modal.querySelector('#gssf-cancel') || modal.querySelector('#gssf-ok') || dialog;
        initial?.focus();
      }, 0);
    });
  }

