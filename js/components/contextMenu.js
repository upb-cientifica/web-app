// Menú contextual genérico: posiciona un <div class="context-menu"> existente
// en el DOM y despacha la acción elegida al callback del llamador.

import { $, $$ } from '../utils/dom.js';

export function createContextMenu(menuId, onAction) {
  const menu = () => document.getElementById(menuId);

  const hide = () => {
    const el = menu();
    if (el) el.classList.add('hidden');
  };

  const show = (x, y) => {
    const el = menu();
    if (!el) return;
    el.classList.remove('hidden');
    el.style.left = '0px';
    el.style.top = '0px';
    const rect = el.getBoundingClientRect();
    const w = window.innerWidth, h = window.innerHeight;
    el.style.left = Math.min(x, w - rect.width - 8) + 'px';
    el.style.top = Math.min(y, h - rect.height - 8) + 'px';
  };

  const el = menu();
  if (!el) return { show, hide, destroy() {} };

  const onItemClick = (e) => {
    const btn = e.target.closest('.ctx-item');
    if (!btn) return;
    hide();
    onAction(btn.dataset.act);
  };
  const onDocClick = (e) => { if (!el.contains(e.target)) hide(); };
  const onResize = () => hide();

  el.addEventListener('click', onItemClick);
  document.addEventListener('click', onDocClick);
  window.addEventListener('resize', onResize);

  return {
    show,
    hide,
    destroy() {
      el.removeEventListener('click', onItemClick);
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('resize', onResize);
    },
  };
}
