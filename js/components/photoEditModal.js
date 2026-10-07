import { $, esc } from '../utils/dom.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { updatePhoto } from '../api/photos.js';

export function openPhotoEditModal(photo, onSaved) {
  const modal = $('#modal-photo-edit');
  let etiquetas = [...new Set(photo.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  modal.innerHTML = `
    <form class="modal-card photo-edit-card" aria-labelledby="photo-edit-title">
      <div class="modal-head"><h3 id="photo-edit-title">Editar detalles</h3>
        <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar"><span class="material-icons">close</span></button>
      </div>
      <label class="share-field"><span>Título</span><input class="share-select" name="titulo" value="${esc(photo.name)}" required></label>
      <label class="share-field"><span>Descripción</span><textarea class="share-select" name="descripcion" rows="4">${esc(photo.description || '')}</textarea></label>
      <label class="share-field"><span>Etiquetas</span><input class="share-select" id="photo-tags-input" placeholder="Escribe y pulsa Enter o coma" aria-describedby="photo-tags-help"></label>
      <p id="photo-tags-help" class="photo-help">Enter o coma añade una etiqueta.</p>
      <div class="photo-tags" id="photo-edit-tags"></div>
      <p class="share-error" role="alert" id="photo-edit-error"></p>
      <div class="modal-foot"><button type="button" class="btn-text" data-cerrar>Cancelar</button><button class="btn-primary" type="submit">Guardar</button></div>
    </form>`;
  const form = $('form', modal);
  const input = $('#photo-tags-input', modal);
  const error = $('#photo-edit-error', modal);
  const cerrar = () => closeModal(modal.id);
  modal.querySelectorAll('[data-cerrar]').forEach((btn) => btn.addEventListener('click', cerrar));
  modal.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };

  function pintarEtiquetas() {
    const grupo = $('#photo-edit-tags', modal);
    grupo.innerHTML = etiquetas.map((t, i) => `<span class="photo-tag">${esc(t)}<button type="button" data-indice="${i}" aria-label="Quitar etiqueta ${esc(t)}">×</button></span>`).join('');
    grupo.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
      etiquetas.splice(Number(btn.dataset.indice), 1);
      pintarEtiquetas();
      input.focus();
    }));
  }
  function añadirEtiquetas() {
    etiquetas = [...new Set([...etiquetas, ...input.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)])];
    input.value = '';
    pintarEtiquetas();
  }
  input.addEventListener('keydown', (e) => {
    if (!e.isComposing && (e.key === 'Enter' || e.key === ',')) { e.preventDefault(); añadirEtiquetas(); }
  });
  input.addEventListener('input', () => { if (input.value.includes(',')) añadirEtiquetas(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    añadirEtiquetas();
    const titulo = form.elements.titulo.value.trim();
    if (!titulo) { error.textContent = 'Escribe un título.'; return; }
    const guardar = $('[type="submit"]', form);
    guardar.disabled = true;
    error.textContent = '';
    let foto;
    try {
      foto = await updatePhoto(photo.id, { titulo, descripcion: form.elements.descripcion.value.trim(), etiquetas });
    } catch (err) {
      error.textContent = err.message || 'No se pudieron guardar los detalles.';
      guardar.disabled = false;
      return;
    }
    if (form.isConnected) cerrar();
    showToast('Detalles guardados', 'success');
    onSaved?.(foto);
  });
  pintarEtiquetas();
  openModal(modal.id);
}
