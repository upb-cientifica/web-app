import { esc } from '../utils/dom.js';
import { openModal } from './modal.js';

// item: { name, type, meta, date }. typeMeta: { icon, cls } para el ícono genérico.
export function openPreview(item, typeMeta) {
  if (!item) return;
  const modal = document.getElementById('modal-preview');
  const title = document.getElementById('preview-title');
  const body = document.getElementById('preview-body');
  if (!modal || !title || !body) return;

  title.textContent = item.name;

  let content;
  if (item.type === 'image') {
    content = `<div class="preview-placeholder">
      <span class="material-icons">image</span>
      <p>Vista previa de imagen (demo)</p>
    </div>`;
  } else if (item.type === 'video') {
    content = `<div class="preview-placeholder">
      <span class="material-icons">play_circle</span>
      <p>Vista previa de video (demo)</p>
    </div>`;
  } else {
    content = `<div class="preview-placeholder">
      <span class="material-icons ${typeMeta.cls}">${typeMeta.icon}</span>
      <p>${esc(item.meta || '—')} · ${esc(item.date)}</p>
    </div>`;
  }
  body.innerHTML = content;
  openModal('modal-preview');
}
