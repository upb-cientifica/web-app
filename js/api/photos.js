// API del álbum de fotos.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
import { delay, clone } from './mock/helpers.js';
import { collections, photos } from './mock/photosData.js';

async function listCollectionsMock() {
  await delay();
  return clone(collections);
}

async function listTagsMock() {
  await delay();
  const set = new Set();
  photos.forEach((p) => p.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

async function listPhotosMock({ collectionId = 'all', tag = 'all', dateFrom = '', dateTo = '' } = {}) {
  await delay();
  const items = photos.filter((p) => {
    if (collectionId !== 'all' && p.collectionId !== collectionId) return false;
    if (tag !== 'all' && !p.tags.includes(tag)) return false;
    if (dateFrom && p.dateTaken < dateFrom) return false;
    if (dateTo && p.dateTaken > dateTo) return false;
    return true;
  });
  return clone(items.sort((a, b) => (a.dateTaken < b.dateTaken ? 1 : -1)));
}

async function getPhotoMock({ id }) {
  await delay();
  const photo = photos.find((p) => p.id === id);
  if (!photo) throw new Error('Foto no encontrada');
  return clone(photo);
}

const listCollectionsReal = () => request(`${API_BASE.photos}/collections`);
const listTagsReal = () => request(`${API_BASE.photos}/tags`);
const listPhotosReal = ({ collectionId, tag, dateFrom, dateTo } = {}) => {
  const params = new URLSearchParams();
  if (collectionId && collectionId !== 'all') params.set('collectionId', collectionId);
  if (tag && tag !== 'all') params.set('tag', tag);
  if (dateFrom) params.set('from', dateFrom);
  if (dateTo) params.set('to', dateTo);
  return request(`${API_BASE.photos}?${params.toString()}`);
};
const getPhotoReal = ({ id }) => request(`${API_BASE.photos}/${id}`);

export const listCollections = USE_MOCKS ? listCollectionsMock : listCollectionsReal;
export const listTags = USE_MOCKS ? listTagsMock : listTagsReal;
export const listPhotos = USE_MOCKS ? listPhotosMock : listPhotosReal;
export const getPhoto = USE_MOCKS ? getPhotoMock : getPhotoReal;
