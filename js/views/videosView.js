import { $, $$, esc } from '../utils/dom.js';
import { formatDate, formatClock } from '../utils/format.js';
import { photoDataUri } from '../utils/placeholderImage.js';
import { showToast } from '../components/toast.js';
import { listVideos, getVideo } from '../api/videos.js';
import { openVideoPlayer } from '../components/videoPlayer.js';

let root = null;
let sortBy = 'recent';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'title', label: 'Título' },
  { value: 'duration', label: 'Duración' },
];

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Videos</h1></div>
    <div class="quick-filters" id="video-sort"></div>
  </div>
  <div class="videos-grid" id="videos-grid"></div>
`;

function cardHTML(video) {
  return `
    <figure class="video-card ${video.hasAccess ? '' : 'video-card-locked'}" data-id="${esc(video.id)}" tabindex="0" role="button" aria-label="${esc(video.title)}">
      <div class="video-thumb-wrap">
        <img class="video-thumb" src="${photoDataUri(video.id, video.title)}" alt="">
        <span class="video-duration-badge">${formatClock(video.durationSeconds)}</span>
        ${video.hasAccess
          ? '<span class="video-play-overlay material-icons">play_circle</span>'
          : '<span class="video-play-overlay material-icons">lock</span>'}
      </div>
      <figcaption>
        <span class="video-title">${esc(video.title)}</span>
        <span class="video-meta">${esc(formatDate(video.uploadedAt))}</span>
      </figcaption>
    </figure>
  `;
}

async function refreshGrid() {
  const grid = $('#videos-grid', root);
  grid.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Cargando catálogo…</p></div>';
  try {
    const videos = await listVideos({ sortBy });
    if (!videos.length) {
      grid.innerHTML = `<div class="empty-state"><span class="material-icons">movie</span><p>No hay videos disponibles</p></div>`;
      return;
    }
    grid.innerHTML = videos.map(cardHTML).join('');
    $$('.video-card', grid).forEach((card) => {
      const open = async () => {
        try {
          const video = await getVideo({ id: card.dataset.id });
          await openVideoPlayer(video);
        } catch (err) {
          showToast(err.message || 'No se pudo abrir el video', 'error');
        }
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  } catch (err) {
    grid.innerHTML = `<p class="share-error">No se pudo cargar el catálogo de videos.</p>`;
  }
}

function initSort() {
  const wrap = $('#video-sort', root);
  wrap.innerHTML = SORT_OPTIONS.map((o, i) => `
    <button class="filter-chip ${i === 0 ? 'active' : ''}" data-sort="${o.value}">${esc(o.label)}</button>
  `).join('');
  $$('.filter-chip', wrap).forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.filter-chip', wrap).forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      sortBy = chip.dataset.sort;
      refreshGrid();
    });
  });
}

export async function mount(rootEl) {
  root = rootEl;
  sortBy = 'recent';
  root.innerHTML = TEMPLATE;
  initSort();
  await refreshGrid();
  return function unmount() { root = null; };
}
