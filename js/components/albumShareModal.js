import { $, $$, esc } from '../utils/dom.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { shareAlbum, setAlbumPublic } from '../api/photos.js';
import { aCorreo } from '../api/users.js';

export function openAlbumShareModal(album, onChanged) {
  if (!['propietario', 'admin'].includes(album.role)) return;
  const modal = $('#modal-album-share');
  let actual = album;
  let ocupado = false;
  modal.innerHTML = `
    <div class="modal-card share-card album-share-card" aria-labelledby="album-share-title">
      <div class="modal-head"><h3 id="album-share-title">Compartir álbum: ${esc(album.name)}</h3>
        <button class="icon-btn" data-cerrar aria-label="Cerrar"><span class="material-icons">close</span></button></div>
      <div class="share-tabs" role="tablist" aria-label="Formas de compartir">
        <button class="share-tab active" id="album-tab-people" role="tab" aria-selected="true" aria-controls="album-panel-people" data-tab="people">Personas</button>
        <button class="share-tab" id="album-tab-link" role="tab" aria-selected="false" aria-controls="album-panel-link" data-tab="link" tabindex="-1">Enlace público</button>
      </div>
      <div id="album-panel-people" class="share-tab-panel" role="tabpanel" aria-labelledby="album-tab-people"></div>
      <div id="album-panel-link" class="share-tab-panel hidden" role="tabpanel" aria-labelledby="album-tab-link"></div>
      <p class="share-error" role="alert" id="album-share-error"></p>
      <div class="modal-foot"><button class="btn-text" data-cerrar>Listo</button></div>
    </div>`;
  const card = $('.modal-card', modal);
  const cerrar = () => closeModal(modal.id);
  $$('[data-cerrar]', modal).forEach((btn) => btn.addEventListener('click', cerrar));
  modal.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
  const tabs = $$('.share-tab', modal);
  function seleccionar(tab) {
    tabs.forEach((t) => {
      const activo = t === tab;
      t.classList.toggle('active', activo);
      t.setAttribute('aria-selected', String(activo));
      t.tabIndex = activo ? 0 : -1;
      $(`#album-panel-${t.dataset.tab}`, modal).classList.toggle('hidden', !activo);
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => seleccionar(tab));
    tab.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const siguiente = tabs[e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - i];
      seleccionar(siguiente);
      siguiente.focus();
    });
  });

  async function cambiar(operacion, mensaje) {
    if (ocupado) return;
    ocupado = true;
    const panelActivo = document.activeElement.closest('.share-tab-panel');
    const error = $('#album-share-error', card);
    error.textContent = '';
    $$('[data-mutacion]', card).forEach((el) => { el.disabled = true; });
    try {
      actual = await operacion();
      onChanged?.(actual);
      showToast(mensaje, 'success');
    } catch (err) {
      error.textContent = err.message || 'No se pudo actualizar el álbum.';
    } finally {
      ocupado = false;
      if (card.isConnected) {
        const restaurarFoco = panelActivo?.contains(document.activeElement);
        pintarPersonas();
        pintarEnlace();
        if (restaurarFoco && !modal.classList.contains('hidden')) $('input', panelActivo)?.focus();
      }
    }
  }

  function pintarPersonas() {
    const panel = $('#album-panel-people', card);
    panel.innerHTML = `
      <form class="share-add-row">
        <label class="share-field"><span>Correo institucional</span><input class="share-select" name="correo" placeholder="nombre@upb.edu.co" autocomplete="email" required data-mutacion></label>
        <button class="btn-primary" type="submit" data-mutacion>Añadir</button>
      </form>
      <ul class="share-people-list">${actual.sharedWith.length ? actual.sharedWith.map((correo) => `
        <li class="share-person"><span class="share-person-info">${esc(correo)}</span>
          <button class="icon-btn" data-correo="${esc(correo)}" data-mutacion aria-label="Quitar acceso a ${esc(correo)}"><span class="material-icons">close</span></button></li>`).join('') : '<li class="share-empty">Nadie más tiene acceso todavía.</li>'}</ul>`;
    $('form', panel).addEventListener('submit', (e) => {
      e.preventDefault();
      const correo = aCorreo(e.target.elements.correo.value).toLowerCase();
      if (!/^[^\s@]+@upb\.edu\.co$/.test(correo)) {
        $('#album-share-error', card).textContent = 'Usa un correo institucional @upb.edu.co.';
        return;
      }
      cambiar(() => shareAlbum(actual.id, correo, 'grant'), 'Acceso concedido');
    });
    $$('[data-correo]', panel).forEach((btn) => btn.addEventListener('click', () =>
      cambiar(() => shareAlbum(actual.id, btn.dataset.correo, 'revoke'), 'Acceso revocado')));
  }

  function pintarEnlace() {
    const panel = $('#album-panel-link', card);
    panel.innerHTML = `
      <label class="album-public-switch"><input type="checkbox" role="switch" data-mutacion ${actual.publico ? 'checked' : ''}> Enlace público activo</label>
      ${actual.publico ? `<div class="album-link-row"><label class="share-field"><span>Enlace público</span><input class="share-select" readonly value="${esc(actual.urlPublica)}"></label><button class="btn-primary" data-copiar ${actual.urlPublica ? '' : 'disabled'}>Copiar</button></div>` : ''}
      <p class="photo-help">Cualquiera con este enlace puede ver el álbum sin iniciar sesión. Desactívalo para revocarlo.</p>`;
    $('[role="switch"]', panel).addEventListener('change', (e) => {
      const activo = e.target.checked;
      cambiar(() => setAlbumPublic(actual.id, activo), activo ? 'Enlace público activado' : 'Enlace público desactivado');
    });
    $('[data-copiar]', panel)?.addEventListener('click', async () => {
      const input = $('input[readonly]', panel);
      try {
        await navigator.clipboard.writeText(input.value);
        showToast('Enlace copiado', 'success');
      } catch {
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
        showToast('Enlace seleccionado. Usa la opción Copiar de tu dispositivo.');
      }
    });
  }
  pintarPersonas();
  pintarEnlace();
  openModal(modal.id);
}
