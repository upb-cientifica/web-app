import { trapFocus } from '../utils/focusTrap.js';

const releaseFns = new Map(); // modalId -> releaseFocus()

export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');

  const dialog = modal.querySelector('.modal-card') || modal;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const release = trapFocus(dialog);
  releaseFns.set(id, release);
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');

  const release = releaseFns.get(id);
  if (release) { release(); releaseFns.delete(id); }
}

// Cierra cualquier modal al hacer clic en el fondo oscuro.
export function initModalBackdropDismiss() {
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

export function closeAllModals() {
  document.querySelectorAll('.modal:not(.hidden)').forEach((modal) => closeModal(modal.id));
}
