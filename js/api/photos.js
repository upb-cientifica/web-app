// API del álbum de fotos.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, qs, getAuthToken } from './client.js';
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

// ---------- Modo real: contra el Service Bus → Álbum de fotos ----------
//
// Las imágenes las pide el navegador con <img src>, que no puede mandar la
// cabecera Authorization: por eso el token viaja en la URL. Tanto el bus como
// el servicio aceptan `?token=` además de la cabecera, precisamente para esto.

function conToken(url) {
  const t = getAuthToken();
  return t ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}` : url;
}

/** Imagen del servicio → foto de la interfaz. */
function aFoto(im) {
  return {
    id: im.id,
    name: im.titulo || '(sin título)',
    collectionId: im.albumId,
    tags: im.etiquetas || [],
    dateTaken: im.subidaEn,
    url: conToken(`${API_BASE.photos}/imagenes/${im.id}`),
    thumbnailUrl: conToken(`${API_BASE.photos}/imagenes/${im.id}/miniatura`),
    width: im.ancho,
    height: im.alto,
    description: im.descripcion || '',
  };
}

const listCollectionsReal = async () =>
  (await request(`${API_BASE.photos}/albums`) || []).map((a) => ({
    id: a.id, name: a.titulo, project: a.proyecto, count: a.numImagenes, role: a.miRol,
  }));

/** El servicio no publica un catálogo de etiquetas: se deduce de las fotos. */
const listTagsReal = async () => {
  const fotos = await request(`${API_BASE.photos}/buscar`) || [];
  return [...new Set(fotos.flatMap((f) => f.etiquetas || []))].sort();
};

async function listPhotosReal({ collectionId = 'all', tag = 'all', dateFrom = '', dateTo = '' } = {}) {
  const crudas = (collectionId && collectionId !== 'all')
    ? await request(`${API_BASE.photos}/albums/${encodeURIComponent(collectionId)}/imagenes`)
    : await request(`${API_BASE.photos}/buscar${qs({ etiqueta: tag !== 'all' ? tag : '' })}`);

  let fotos = (crudas || []).map(aFoto);
  if (tag && tag !== 'all') fotos = fotos.filter((f) => f.tags.includes(tag));
  if (dateFrom) fotos = fotos.filter((f) => f.dateTaken >= dateFrom);
  if (dateTo) fotos = fotos.filter((f) => f.dateTaken <= `${dateTo}T23:59:59Z`);
  return fotos;
}

/** El servicio sirve el contenido por id, no sus metadatos: se buscan. */
const getPhotoReal = async ({ id }) => {
  const fotos = await request(`${API_BASE.photos}/buscar`) || [];
  const im = fotos.find((f) => f.id === id);
  if (!im) throw new Error('No se encontró la imagen');
  return aFoto(im);
};

export const listCollections = USE_MOCKS ? listCollectionsMock : listCollectionsReal;
export const listTags = USE_MOCKS ? listTagsMock : listTagsReal;
export const listPhotos = USE_MOCKS ? listPhotosMock : listPhotosReal;
export const getPhoto = USE_MOCKS ? getPhotoMock : getPhotoReal;
