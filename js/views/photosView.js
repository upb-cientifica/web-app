import { $, $$, esc } from '../utils/dom.js';
import { formatDate } from '../utils/format.js';
import { photoDataUri } from '../utils/placeholderImage.js';
import { listCollections, listTags, listPhotos } from '../api/photos.js';
import { openPhotoViewer } from '../components/photoViewer.js';
import { openShareModal } from '../components/shareModal.js';

let root = null;
let observer = null;
let currentPhotos = [];
let filters = { collectionId: 'all', tag: 'all', dateFrom: '', dateTo: '' };

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Fotos</h1></div>
  </div>

  <div class="photos-filters">
    <div class="quick-filters" id="collection-filters"></div>
    <label class="share-field">
      <span>Etiqueta</span>
      <select class="share-select" id="tag-filter"><option value="all">Todas</option></select>
    </label>
    <label class="share-field"><span>Desde</span><input type="date" class="share-select" id="date-from"></label>
    <label class="share-field"><span>Hasta</span><input type="date" class="share-select" id="date-to"></label>
  </div>

  <div class="photos-grid" id="photos-grid"></div>
`;

function cardHTML(photo, i) {
  return `
    <figure class="photo-card" data-photo-id="${esc(photo.id)}" data-idx="${i}" tabindex="0" role="button" aria-label="${esc(photo.name)}">
      <div class="photo-thumb-skeleton"></div>
      <img class="photo-thumb" alt="${esc(photo.name)}" loading="lazy">
      <figcaption>
        <span class="photo-name">${esc(photo.name)}</span>
        <span class="photo-date">${esc(formatDate(photo.dateTaken))}</span>
      </figcaption>
      <button class="icon-btn photo-share-btn" data-photo-id="${esc(photo.id)}" title="Compartir" aria-label="Compartir foto">
        <span class="material-icons">person_add</span>
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
  openPhotoViewer(currentPhotos, idx, { onShare: (photo) => openShareModal(photo) });
}

async function refreshGrid() {
  const grid = $('#photos-grid', root);
  grid.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Cargando fotos…</p></div>';
  try {
    currentPhotos = await listPhotos(filters);
    if (!currentPhotos.length) {
      grid.innerHTML = `<div class="empty-state"><span class="material-icons">photo_library</span><p>No hay fotos con estos filtros</p></div>`;
      return;
    }
    grid.innerHTML = currentPhotos.map(cardHTML).join('');

    $$('.photo-card', grid).forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.photo-share-btn')) return;
        openViewerFrom(card.dataset.photoId);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewerFrom(card.dataset.photoId); }
      });
    });
    $$('.photo-share-btn', grid).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photo = currentPhotos.find((p) => p.id === btn.dataset.photoId);
        if (photo) openShareModal(photo);
      });
    });

    initLazyLoading(grid);
  } catch (err) {
    grid.innerHTML = `<p class="share-error">No se pudieron cargar las fotos.</p>`;
  }
}

async function initFilters() {
  const collectionsWrap = $('#collection-filters', root);
  const tagSelect = $('#tag-filter', root);

  try {
    const [collections, tags] = await Promise.all([listCollections(), listTags()]);

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

  tagSelect.addEventListener('change', () => {
    filters.tag = tagSelect.value;
    refreshGrid();
  });
  $('#date-from', root).addEventListener('change', (e) => { filters.dateFrom = e.target.value; refreshGrid(); });
  $('#date-to', root).addEventListener('change', (e) => { filters.dateTo = e.target.value; refreshGrid(); });
}

export async function mount(rootEl) {
  root = rootEl;
  filters = { collectionId: 'all', tag: 'all', dateFrom: '', dateTo: '' };
  root.innerHTML = TEMPLATE;

  await initFilters();
  await refreshGrid();

  return function unmount() {
    if (observer) { observer.disconnect(); observer = null; }
    root = null;
  };
}
