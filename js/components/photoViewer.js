// Visor de fotos a pantalla completa: navegación por teclado, zoom y modo
// presentación con avance automático. Crea su propio overlay en <body> y
// lo desmonta al cerrar, para no acoplarse al marcado de ninguna vista.

import { esc } from '../utils/dom.js';
import { photoDataUri } from '../utils/placeholderImage.js';
import { formatDate } from '../utils/format.js';
import { trapFocus } from '../utils/focusTrap.js';

const SLIDESHOW_INTERVAL_MS = 3500;

let overlay = null;
let list = [];
let index = 0;
let zoomed = false;
let slideshowTimer = null;
let onShareCallback = null;
let releaseFocus = null;

function currentPhoto() {
  return list[index];
}

function render() {
  const photo = currentPhoto();
  if (!photo || !overlay) return;

  const img = overlay.querySelector('.viewer-image');
  img.src = photoDataUri(photo.id, photo.name);
  img.classList.toggle('zoomed', zoomed);

  overlay.querySelector('.viewer-title').textContent = photo.name;
  overlay.querySelector('.viewer-meta').textContent =
    `${formatDate(photo.dateTaken)} · ${photo.tags.join(', ') || 'sin etiquetas'} · ${index + 1} de ${list.length}`;

  const playBtn = overlay.querySelector('.viewer-slideshow-btn .material-icons');
  playBtn.textContent = slideshowTimer ? 'pause' : 'play_arrow';
}

function goTo(newIndex) {
  if (!list.length) return;
  index = (newIndex + list.length) % list.length;
  zoomed = false;
  render();
}

function next() { goTo(index + 1); }
function prev() { goTo(index - 1); }

function toggleZoom() {
  zoomed = !zoomed;
  render();
}

function stopSlideshow() {
  clearInterval(slideshowTimer);
  slideshowTimer = null;
  render();
}

function toggleSlideshow() {
  if (slideshowTimer) {
    stopSlideshow();
  } else {
    slideshowTimer = setInterval(next, SLIDESHOW_INTERVAL_MS);
    render();
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') closePhotoViewer();
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === '+' || e.key === '=') { zoomed = true; render(); }
  else if (e.key === '-') { zoomed = false; render(); }
}

export function openPhotoViewer(photosList, startIndex = 0, { onShare } = {}) {
  list = photosList;
  index = startIndex;
  zoomed = false;
  onShareCallback = onShare || null;
  if (!list.length) return;

  overlay = document.createElement('div');
  overlay.className = 'photo-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'photo-viewer-title');
  overlay.innerHTML = `
    <div class="viewer-topbar">
      <div>
        <div class="viewer-title" id="photo-viewer-title"></div>
        <div class="viewer-meta"></div>
      </div>
      <div class="viewer-actions">
        <button class="icon-btn viewer-share-btn" title="Compartir" aria-label="Compartir"><span class="material-icons">person_add</span></button>
        <button class="icon-btn viewer-slideshow-btn" title="Presentación" aria-label="Iniciar o pausar presentación"><span class="material-icons">play_arrow</span></button>
        <button class="icon-btn viewer-zoom-btn" title="Zoom" aria-label="Alternar zoom"><span class="material-icons">zoom_in</span></button>
        <button class="icon-btn viewer-close-btn" title="Cerrar" aria-label="Cerrar visor"><span class="material-icons">close</span></button>
      </div>
    </div>
    <button class="icon-btn viewer-nav viewer-prev" aria-label="Foto anterior"><span class="material-icons">chevron_left</span></button>
    <div class="viewer-stage">
      <img class="viewer-image" alt="">
    </div>
    <button class="icon-btn viewer-nav viewer-next" aria-label="Foto siguiente"><span class="material-icons">chevron_right</span></button>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.viewer-close-btn').addEventListener('click', closePhotoViewer);
  overlay.querySelector('.viewer-prev').addEventListener('click', prev);
  overlay.querySelector('.viewer-next').addEventListener('click', next);
  overlay.querySelector('.viewer-zoom-btn').addEventListener('click', toggleZoom);
  overlay.querySelector('.viewer-image').addEventListener('click', toggleZoom);
  overlay.querySelector('.viewer-slideshow-btn').addEventListener('click', toggleSlideshow);
  overlay.querySelector('.viewer-share-btn').addEventListener('click', () => {
    if (onShareCallback) onShareCallback(currentPhoto());
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePhotoViewer(); });

  document.addEventListener('keydown', onKeydown);
  releaseFocus = trapFocus(overlay);
  render();
}

export function closePhotoViewer() {
  stopSlideshow();
  document.removeEventListener('keydown', onKeydown);
  if (releaseFocus) { releaseFocus(); releaseFocus = null; }
  if (overlay) { overlay.remove(); overlay = null; }
}
