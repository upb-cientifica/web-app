// Reemplazo propio de confirm()/prompt() nativos, con el mismo trato de
// accesibilidad (role="dialog", trampa de foco) que el resto de los modales.

import { esc } from '../utils/dom.js';
import { trapFocus } from '../utils/focusTrap.js';

function buildOverlay(bodyHtml, titleId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      ${bodyHtml}
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function closeOverlay(overlay, release) {
  release();
  overlay.remove();
  document.removeEventListener('keydown', overlay._onKeydown);
}

// Devuelve una Promise<boolean>.
export function showConfirm(message, { confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = buildOverlay(`
      <div class="modal-head"><h3 id="dialog-confirm-title">Confirmar</h3></div>
      <div class="dialog-body"><p>${esc(message)}</p></div>
      <div class="modal-foot">
        <button class="btn-text" id="dialog-cancel">${esc(cancelLabel)}</button>
        <button class="${danger ? 'btn-primary dialog-danger' : 'btn-primary'}" id="dialog-confirm">${esc(confirmLabel)}</button>
      </div>
    `, 'dialog-confirm-title');

    const release = trapFocus(overlay.querySelector('.modal-card'));
    const finish = (result) => { closeOverlay(overlay, release); resolve(result); };

    overlay.querySelector('#dialog-confirm').addEventListener('click', () => finish(true));
    overlay.querySelector('#dialog-cancel').addEventListener('click', () => finish(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    overlay._onKeydown = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', overlay._onKeydown);
  });
}

// Devuelve una Promise<string|null> (null si se cancela).
export function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = buildOverlay(`
      <div class="modal-head"><h3 id="dialog-prompt-title">${esc(message)}</h3></div>
      <div class="dialog-body">
        <input type="text" class="share-select" id="dialog-input" value="${esc(defaultValue)}">
      </div>
      <div class="modal-foot">
        <button class="btn-text" id="dialog-cancel">Cancelar</button>
        <button class="btn-primary" id="dialog-confirm">Aceptar</button>
      </div>
    `, 'dialog-prompt-title');

    const input = overlay.querySelector('#dialog-input');
    const release = trapFocus(overlay.querySelector('.modal-card'));
    input.select();

    const finish = (result) => { closeOverlay(overlay, release); resolve(result); };

    overlay.querySelector('#dialog-confirm').addEventListener('click', () => finish(input.value));
    overlay.querySelector('#dialog-cancel').addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
    overlay._onKeydown = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', overlay._onKeydown);
  });
}
