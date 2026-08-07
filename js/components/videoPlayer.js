// Reproductor de video a pantalla completa. Intenta hls.js contra el
// manifiesto real del backend; si no existe o falla (network error fatal),
// cae de forma automática y visible al reproductor nativo con un clip de
// prueba generado en el cliente. Controles propios: play/pausa, línea de
// tiempo, volumen, calidad, velocidad y pantalla completa.

import { esc } from '../utils/dom.js';
import { formatClock as formatTime } from '../utils/format.js';
import { showToast } from './toast.js';
import { generateTestClip, qualityLabel, QUALITY_ORDER } from './testVideoGenerator.js';
import { trapFocus } from '../utils/focusTrap.js';

let overlay = null;
let hlsInstance = null;
let currentVideo = null;
let currentQuality = 'medium';
let releaseFocus = null;

function onKeydown(e) {
  if (e.key === 'Escape') closeVideoPlayer();
}

function accessDeniedTemplate(video) {
  return `
    <div class="video-denied">
      <span class="material-icons">lock</span>
      <h3>Acceso denegado</h3>
      <p>No tienes permiso para ver "${esc(video.title)}". Este contenido está restringido a un grupo del que no formas parte. Solicita acceso a tu administrador.</p>
    </div>
  `;
}

function playerTemplate(video) {
  return `
    <div class="video-stage" id="video-stage">
      <video class="video-el" id="video-el" playsinline></video>
      <div class="video-loading" id="video-loading"><span class="material-icons spin">progress_activity</span> Cargando…</div>
    </div>
    <div class="video-controls">
      <button class="icon-btn video-playpause" id="video-playpause" aria-label="Reproducir o pausar">
        <span class="material-icons">play_arrow</span>
      </button>
      <span class="video-time" id="video-time">0:00 / 0:00</span>
      <input type="range" class="video-seek" id="video-seek" min="0" max="100" value="0" step="0.1" aria-label="Línea de tiempo">
      <button class="icon-btn video-mute" id="video-mute" aria-label="Silenciar"><span class="material-icons">volume_up</span></button>
      <input type="range" class="video-volume" id="video-volume" min="0" max="100" value="100" aria-label="Volumen">
      <select class="video-select" id="video-quality" aria-label="Calidad">
        ${QUALITY_ORDER.map((q) => `<option value="${q}">${esc(qualityLabel(q))}</option>`).join('')}
      </select>
      <select class="video-select" id="video-speed" aria-label="Velocidad de reproducción">
        ${[0.5, 1, 1.25, 1.5, 2].map((s) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}×</option>`).join('')}
      </select>
      <button class="icon-btn video-fullscreen" id="video-fullscreen" aria-label="Pantalla completa"><span class="material-icons">fullscreen</span></button>
    </div>
  `;
}

async function loadNativeQuality(quality, { preserveState = false } = {}) {
  const videoEl = overlay.querySelector('#video-el');
  const loading = overlay.querySelector('#video-loading');
  const wasPlaying = preserveState && !videoEl.paused;
  const resumeAt = preserveState ? videoEl.currentTime : 0;

  loading.classList.remove('hidden');
  try {
    const url = await generateTestClip(currentVideo.id, quality, {
      durationSeconds: 4,
      title: currentVideo.title,
    });
    videoEl.src = url;
    videoEl.loop = true;
    await new Promise((resolve) => { videoEl.onloadedmetadata = resolve; });
    if (preserveState) videoEl.currentTime = Math.min(resumeAt, videoEl.duration || 0);
    if (wasPlaying) videoEl.play().catch(() => {});
  } catch (err) {
    showToast(err.message || 'No se pudo generar el video de prueba', 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

async function tryLoadHls(video) {
  const videoEl = overlay.querySelector('#video-el');
  try {
    const { default: Hls } = await import('../vendor/hls.mjs');
    if (!Hls.isSupported()) throw new Error('hls.js no soportado en este navegador');

    hlsInstance = new Hls();
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      hlsInstance.destroy();
      hlsInstance = null;
      showToast('El manifiesto HLS no está disponible todavía; usando reproductor nativo de respaldo.', '');
      loadNativeQuality(currentQuality);
    });
    hlsInstance.loadSource(video.stream.manifestUrl);
    hlsInstance.attachMedia(videoEl);
  } catch (err) {
    showToast('hls.js no disponible; usando reproductor nativo de respaldo.', '');
    await loadNativeQuality(currentQuality);
  }
}

function bindControls() {
  const videoEl = overlay.querySelector('#video-el');
  const playBtn = overlay.querySelector('#video-playpause');
  const seek = overlay.querySelector('#video-seek');
  const timeLabel = overlay.querySelector('#video-time');
  const muteBtn = overlay.querySelector('#video-mute');
  const volume = overlay.querySelector('#video-volume');
  const qualitySelect = overlay.querySelector('#video-quality');
  const speedSelect = overlay.querySelector('#video-speed');
  const fullscreenBtn = overlay.querySelector('#video-fullscreen');
  const stage = overlay.querySelector('#video-stage');

  qualitySelect.value = currentQuality;

  playBtn.addEventListener('click', () => {
    if (videoEl.paused) videoEl.play().catch(() => {}); else videoEl.pause();
  });
  videoEl.addEventListener('play', () => { playBtn.querySelector('.material-icons').textContent = 'pause'; });
  videoEl.addEventListener('pause', () => { playBtn.querySelector('.material-icons').textContent = 'play_arrow'; });

  videoEl.addEventListener('timeupdate', () => {
    if (!videoEl.duration) return;
    seek.value = (videoEl.currentTime / videoEl.duration) * 100;
    timeLabel.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`;
  });
  seek.addEventListener('input', () => {
    if (!videoEl.duration) return;
    videoEl.currentTime = (seek.value / 100) * videoEl.duration;
  });

  muteBtn.addEventListener('click', () => {
    videoEl.muted = !videoEl.muted;
    muteBtn.querySelector('.material-icons').textContent = videoEl.muted ? 'volume_off' : 'volume_up';
  });
  volume.addEventListener('input', () => {
    videoEl.volume = volume.value / 100;
    videoEl.muted = false;
    muteBtn.querySelector('.material-icons').textContent = 'volume_up';
  });

  speedSelect.addEventListener('change', () => { videoEl.playbackRate = Number(speedSelect.value); });

  qualitySelect.addEventListener('change', async () => {
    currentQuality = qualitySelect.value;
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    await loadNativeQuality(currentQuality, { preserveState: true });
    showToast(`Calidad: ${qualityLabel(currentQuality)}`, '');
  });

  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.().catch(() => {});
  });
}

export async function openVideoPlayer(video) {
  currentVideo = video;
  currentQuality = 'medium';

  overlay = document.createElement('div');
  overlay.className = 'video-player-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'video-player-title');
  overlay.innerHTML = `
    <div class="viewer-topbar">
      <div>
        <div class="viewer-title" id="video-player-title">${esc(video.title)}</div>
      </div>
      <div class="viewer-actions">
        <button class="icon-btn video-close-btn" title="Cerrar" aria-label="Cerrar"><span class="material-icons">close</span></button>
      </div>
    </div>
    <div class="video-body" id="video-body"></div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.video-close-btn').addEventListener('click', closeVideoPlayer);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeVideoPlayer(); });
  document.addEventListener('keydown', onKeydown);
  releaseFocus = trapFocus(overlay);

  const body = overlay.querySelector('#video-body');

  if (!video.hasAccess) {
    body.innerHTML = accessDeniedTemplate(video);
    return;
  }

  body.innerHTML = playerTemplate(video);
  bindControls();

  if (video.stream?.type === 'hls') {
    await tryLoadHls(video);
  } else {
    await loadNativeQuality(currentQuality);
  }
}

export function closeVideoPlayer() {
  document.removeEventListener('keydown', onKeydown);
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  if (releaseFocus) { releaseFocus(); releaseFocus = null; }
  if (overlay) { overlay.remove(); overlay = null; }
  currentVideo = null;
}
