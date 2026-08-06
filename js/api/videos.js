// API del catálogo de streaming de video.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
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

const listVideosReal = ({ sortBy } = {}) => request(`${API_BASE.videos}?sortBy=${sortBy || 'recent'}`);
const getVideoReal = ({ id }) => request(`${API_BASE.videos}/${id}`);

export const listVideos = USE_MOCKS ? listVideosMock : listVideosReal;
export const getVideo = USE_MOCKS ? getVideoMock : getVideoReal;
