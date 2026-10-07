import { $, $$, esc } from '../utils/dom.js';
import { formatDate } from '../utils/format.js';
import { photoDataUri } from '../utils/placeholderImage.js';
import { listCollections, listTags, listPhotos, removePhoto, downloadPhoto } from '../api/photos.js';
import { deleteItem } from '../api/files.js';
import { createContextMenu } from '../components/contextMenu.js';
import { showConfirm } from '../components/dialogs.js';
import { openPhotoViewer } from '../components/photoViewer.js';
import { openPhotoEditModal } from '../components/photoEditModal.js';
import { openAlbumShareModal } from '../components/albumShareModal.js';
import { openSlideshow, closeSlideshow } from '../components/slideshow.js';
import { closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let root = null;
let observer = null;
let currentPhotos = [];
let albums = [];
let busquedaTimer = null;
let carga = 0;
let menu = null;
let fotoDelMenu = null;
let filters = { collectionId: 'all', tag: 'all', dateFrom: '', dateTo: '', q: '' };

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Fotos</h1></div>
  </div>

  <div class="photos-filters">
    <label class="share-field photos-search"><span>Buscar fotos</span><input type="search" class="share-select" id="photo-search" placeholder="Título, descripción o etiquetas"></label>
    <div class="quick-filters" id="collection-filters"></div>
    <label class="share-field">
      <span>Etiqueta</span>
      <select class="share-select" id="tag-filter"><option value="all">Todas</option></select>
    </label>
    <label class="share-field"><span>Desde</span><input type="date" class="share-select" id="date-from"></label>
    <label class="share-field"><span>Hasta</span><input type="date" class="share-select" id="date-to"></label>
  </div>

  <div class="album-toolbar" id="album-toolbar"></div>
  <div class="photos-grid" id="photos-grid"></div>
`;

function cardHTML(photo, i) {
  return `
    <figure class="photo-card" data-photo-id="${esc(photo.id)}" data-idx="${i}">
      <button class="photo-open-btn" aria-label="Ver ${esc(photo.name)}">
      <div class="photo-thumb-skeleton"></div>
      <img class="photo-thumb" alt="" loading="lazy">
      </button>
      <figcaption>
        <span class="photo-name">${esc(photo.name)}</span>
        <span class="photo-date">${esc(formatDate(photo.dateTaken))}</span>
        <span class="photo-tags">${photo.tags.slice(0, 3).map((t) => `<span class="photo-tag">${esc(t)}</span>`).join('')}${photo.tags.length > 3 ? `<span class="photo-tag">+${photo.tags.length - 3}</span>` : ''}</span>
      </figcaption>
      <button class="icon-btn photo-edit-btn" data-photo-id="${esc(photo.id)}" title="Más acciones" aria-label="Más acciones para ${esc(photo.name)}" aria-haspopup="menu">
        <span class="material-icons">more_vert</span>
      </button>
    </figure>
  `;
}

function initLazyLoading(grid) {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      const id = card.dataset.photoId;
      const photo = currentPhotos.find((p) => p.id === id);
      if (!photo) return;
      const img = card.querySelector('.photo-thumb');
      // Con backend real llega la miniatura del servicio; el marcador de
      // posición generado queda como respaldo si la imagen no carga.
      const respaldo = photoDataUri(photo.id, photo.name);
      // Las dos escuchas van antes de asignar src: una imagen ya cacheada
      // dispara 'load' de inmediato y se perdería el aviso.
      img.addEventListener('load', () => card.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => { img.src = respaldo; }, { once: true });
      img.src = photo.thumbnailUrl || photo.url || respaldo;
      observer.unobserve(card);
    });
  }, { root: null, rootMargin: '150px', threshold: 0.01 });

  $$('.photo-card', grid).forEach((card) => observer.observe(card));
}

function openViewerFrom(id) {
  const idx = currentPhotos.findIndex((p) => p.id === id);
  if (idx < 0) return;
  openPhotoViewer(currentPhotos, idx);
}

function renderToolbar(cargando = false) {
  const album = albums.find((a) => a.id === filters.collectionId);
  const toolbar = $('#album-toolbar', root);
  toolbar.innerHTML = `<div><strong>${esc(album?.name || 'Todas las fotos')}</strong><span class="photo-help">${cargando ? 'Cargando…' : `${currentPhotos.length} fotos mostradas`}${album ? ` · ${esc(album.count ?? 0)} en el álbum` : ''}</span></div>
    <div class="album-toolbar-actions">${album && ['propietario', 'admin'].includes(album.role) ? '<button class="btn-text" id="album-share">Compartir álbum</button>' : ''}
    <button class="btn-primary" id="photos-present" ${cargando || !currentPhotos.length ? 'disabled' : ''}>Presentación</button></div>`;
  $('#photos-present', toolbar).addEventListener('click', () => openSlideshow(currentPhotos));
  $('#album-share', toolbar)?.addEventListener('click', () => openAlbumShareModal(album, (actualizado) => {
    albums = albums.map((a) => a.id === actualizado.id ? actualizado : a);
    if (root) renderToolbar();
  }));
}

// Lo que se puede hacer con una foto desde sus tres puntos.
async function accionDeFoto(act) {
  const photo = fotoDelMenu;
  if (!photo || !root) return;
  if (act === 'ver') openViewerFrom(photo.id);
  else if (act === 'presentar') openSlideshow(currentPhotos, currentPhotos.findIndex((p) => p.id === photo.id));
  else if (act === 'editar') {
    openPhotoEditModal(photo, async () => {
      await refreshTags();
      await refreshGrid();
    });
  } else if (act === 'descargar') {
    try {
      const blob = await downloadPhoto(photo.id);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: photo.name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(err.message || 'No se pudo descargar la foto', 'error');
    }
  } else if (act === 'compartir') {
    const album = albums.find((a) => a.id === photo.collectionId);
    if (album) openAlbumShareModal(album, (actualizado) => {
      albums = albums.map((a) => a.id === actualizado.id ? actualizado : a);
      if (root) renderToolbar();
    });
  } else if (act === 'papelera') {
    const ok = await showConfirm(`¿Mover "${photo.name}" a la papelera? Deja de estar en Fotos y el archivo se puede recuperar desde la Papelera.`,
      { confirmLabel: 'Mover a la papelera', danger: true });
    if (!ok) return;
    try {
      await removePhoto(photo.id);
      // El archivo del Home del que salió la foto va a la papelera, para poder recuperarlo.
      if (photo.origenHome) await deleteItem({ id: photo.origenHome });
      showToast('Foto movida a la papelera', 'success');
      await refreshTags();
      await refreshGrid();
    } catch (err) {
      showToast(err.message || 'No se pudo mover a la papelera', 'error');
    }
  }
}

async function refreshTags() {
  const vista = root;
  try {
    const tags = await listTags();
    if (!vista || root !== vista) return;
    const select = $('#tag-filter', vista);
    if (!tags.includes(filters.tag)) filters.tag = 'all';
    select.innerHTML = '<option value="all">Todas</option>' + tags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    select.value = filters.tag;
  } catch {
    showToast('No se pudieron actualizar las etiquetas', 'error');
  }
}

async function refreshGrid() {
  if (!root) return;
  clearTimeout(busquedaTimer);
  const turno = ++carga;
  if (observer) observer.disconnect();
  renderToolbar(true);
  const grid = $('#photos-grid', root);
  grid.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Cargando fotos…</p></div>';
  try {
    const fotos = await listPhotos({ ...filters });
    if (!root || turno !== carga) return;
    currentPhotos = fotos;
    renderToolbar();
    if (!currentPhotos.length) {
      grid.innerHTML = `<div class="empty-state"><span class="material-icons">photo_library</span><p>No hay fotos con estos filtros</p></div>`;
      return;
    }
    grid.innerHTML = currentPhotos.map(cardHTML).join('');

    $$('.photo-card', grid).forEach((card) => {
      $('.photo-open-btn', card).addEventListener('click', () => openViewerFrom(card.dataset.photoId));
    });
    $$('.photo-edit-btn', grid).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photo = currentPhotos.find((p) => p.id === btn.dataset.photoId);
        if (!photo) return;
        fotoDelMenu = photo;
        // Compartir es del álbum: sólo se ofrece si quien mira puede editarlo.
        const album = albums.find((a) => a.id === photo.collectionId);
        $('#photo-menu [data-act="compartir"]').classList.toggle('hidden',
          !album || !['propietario', 'admin'].includes(album.role));
        const r = btn.getBoundingClientRect();
        menu.show(r.right - 220, r.bottom + 4);
      });
    });

    initLazyLoading(grid);
  } catch (err) {
    if (!root || turno !== carga) return;
    currentPhotos = [];
    renderToolbar();
    grid.innerHTML = `<p class="share-error">No se pudieron cargar las fotos.</p>`;
  }
}

async function initFilters() {
  const vista = root;
  const collectionsWrap = $('#collection-filters', root);
  const tagSelect = $('#tag-filter', root);

  try {
    const [collections, tags] = await Promise.all([listCollections(), listTags()]);

    if (root !== vista) return;
    albums = collections;
    collectionsWrap.innerHTML = ['<button class="filter-chip active" data-collection="all">Todas</button>']
      .concat(collections.map((c) => `<button class="filter-chip" data-collection="${esc(c.id)}">${esc(c.name)}</button>`))
      .join('');

    tags.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      tagSelect.appendChild(opt);
    });

    $$('.filter-chip', collectionsWrap).forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('.filter-chip', collectionsWrap).forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        filters.collectionId = chip.dataset.collection;
        refreshGrid();
      });
    });
  } catch (err) {
    collectionsWrap.innerHTML = `<p class="share-error">No se pudieron cargar las colecciones.</p>`;
  }

  if (root !== vista) return;
  $('#photo-search', root).addEventListener('input', (e) => {
    filters.q = e.target.value;
    clearTimeout(busquedaTimer);
    ++carga;
    renderToolbar(true);
    busquedaTimer = setTimeout(refreshGrid, 300);
  });
  tagSelect.addEventListener('change', () => {
    filters.tag = tagSelect.value;
    refreshGrid();
  });
  $('#date-from', root).addEventListener('change', (e) => { filters.dateFrom = e.target.value; refreshGrid(); });
  $('#date-to', root).addEventListener('change', (e) => { filters.dateTo = e.target.value; refreshGrid(); });
}

export async function mount(rootEl) {
  root = rootEl;
  albums = [];
  currentPhotos = [];
  filters = { collectionId: 'all', tag: 'all', dateFrom: '', dateTo: '', q: '' };
  root.innerHTML = TEMPLATE;
  menu = createContextMenu('photo-menu', accionDeFoto);

  await initFilters();
  await refreshGrid();

  return function unmount() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(busquedaTimer);
    ++carga;
    closeSlideshow();
    if (menu) { menu.hide(); menu.destroy(); menu = null; }
    closeModal('modal-photo-edit');
    closeModal('modal-album-share');
    root = null;
  };
}
