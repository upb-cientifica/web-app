// API del catálogo de streaming de video.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, qs, getAuthToken } from './client.js';
import { delay, clone } from './mock/helpers.js';
import { videos } from './mock/videosData.js';
import { CURRENT_USER_GROUPS } from '../utils/currentUser.js';

const SORTERS = {
  recent: (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt),
  title: (a, b) => a.title.localeCompare(b.title, 'es'),
  duration: (a, b) => b.durationSeconds - a.durationSeconds,
};

function withAccess(video) {
  const hasAccess = !video.requiredGroup || CURRENT_USER_GROUPS.includes(video.requiredGroup);
  return { ...video, hasAccess };
}

async function listVideosMock({ sortBy = 'recent' } = {}) {
  await delay();
  const sorter = SORTERS[sortBy] || SORTERS.recent;
  return clone([...videos].map(withAccess).sort(sorter));
}

async function getVideoMock({ id }) {
  await delay();
  const video = videos.find((v) => v.id === id);
  if (!video) throw new Error('Video no encontrado');
  const withA = withAccess(video);
  if (!withA.hasAccess) return clone(withA);

  // Solo el primer video del catálogo simula tener un manifiesto HLS real
  // (aún no publicado por el backend), para ejercitar el camino hls.js ->
  // respaldo nativo. El resto usa directamente el reproductor nativo.
  const stream = video.id === 'v1'
    ? { type: 'hls', manifestUrl: `/media/${video.id}/index.m3u8` }
    : { type: 'native' };

  return clone({ ...withA, stream });
}

// ---------- Modo real: contra el Service Bus → Streaming ----------
//
// El manifiesto HLS se pide por el bus; sus segmentos van referenciados de
// forma relativa, así que resuelven contra la misma URL y siguen pasando por
// el bus sin tener que reescribirlos.

const ORDEN = { recent: 'fecha', title: 'titulo', duration: 'duracion' };

function conToken(url) {
  const t = getAuthToken();
  return t ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}` : url;
}

/** Video del servicio → el que dibuja la interfaz. */
function aVideo(v) {
  return {
    id: v.id,
    title: v.titulo,
    durationSeconds: v.duracionSeg || 0,
    uploadedAt: v.publicadoEn,
    requiredGroup: v.nivelAcceso === 'publico' ? null : (v.proyecto || v.nivelAcceso),
    // El catálogo del servicio ya viene filtrado a lo que el usuario puede ver.
    hasAccess: true,
    author: v.autor,
    project: v.proyecto,
    sizeBytes: v.tamanoBytes,
  };
}

const listVideosReal = async ({ sortBy } = {}) =>
  (await request(`${API_BASE.videos}/videos${qs({ orden: ORDEN[sortBy] || 'fecha' })}`) || []).map(aVideo);

const getVideoReal = async ({ id }) => {
  const v = await request(`${API_BASE.videos}/videos/${encodeURIComponent(id)}`);
  const base = aVideo(v);
  if (!v.hlsListo) {
    return { ...base, stream: null, notReady: true };
  }
  return {
    ...base,
    stream: {
      type: 'hls',
      manifestUrl: conToken(`${API_BASE.videos}/videos/${encodeURIComponent(id)}/index.m3u8`),
    },
  };
};

export const listVideos = USE_MOCKS ? listVideosMock : listVideosReal;
export const getVideo = USE_MOCKS ? getVideoMock : getVideoReal;
