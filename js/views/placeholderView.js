// Fábrica de vistas para los módulos que aún no se han implementado
// (fotos, videos, sync, trabajos, monitoreo, admin). Cada uno se
// reemplaza por su vista real en una fase posterior.

import { esc } from '../utils/dom.js';

export function createPlaceholderView({ title, icon, description }) {
  return function mount(root) {
    root.innerHTML = `
      <div class="main-header">
        <div class="main-title-wrap">
          <h1 class="main-title">${esc(title)}</h1>
        </div>
      </div>
      <div class="empty-state">
        <span class="material-icons">${esc(icon)}</span>
        <p>${esc(description)}</p>
      </div>
    `;
    return null;
  };
}
