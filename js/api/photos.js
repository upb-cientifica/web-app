// API del álbum de fotos.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, requestBlob, qs, getAuthToken } from './client.js';
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

async function listPhotosMock({ collectionId = 'all', tag = 'all', dateFrom = '', dateTo = '', q = '' } = {}) {
  await delay();
  const items = photos.filter((p) => {
    if (!coincideTexto(p, q)) return false;
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
    origenHome: im.origenHome || '',
  };
}

function aAlbum(a) {
  return {
    id: a.id, name: a.titulo, project: a.proyecto, count: a.numImagenes,
    role: a.miRol, owner: a.propietario, publico: !!a.publico,
    urlPublica: a.urlPublica || '', sharedWith: a.compartidoCon || [],
  };
}

function coincideTexto(foto, q) {
  return [foto.name, foto.description, ...foto.tags].join(' ').toLowerCase().includes(q.trim().toLowerCase());
}

const listCollectionsReal = async () =>
  (await request(`${API_BASE.photos}/albums`) || []).map(aAlbum);

/** El servicio no publica un catálogo de etiquetas: se deduce de las fotos. */
const listTagsReal = async () => {
  const fotos = await request(`${API_BASE.photos}/buscar`) || [];
  return [...new Set(fotos.flatMap((f) => f.etiquetas || []))].sort();
};

async function listPhotosReal({ collectionId = 'all', tag = 'all', dateFrom = '', dateTo = '', q = '' } = {}) {
  const crudas = (collectionId && collectionId !== 'all')
    ? await request(`${API_BASE.photos}/albums/${encodeURIComponent(collectionId)}/imagenes`)
    : await request(`${API_BASE.photos}/buscar${qs({ q: q.trim(), etiqueta: tag !== 'all' ? tag : '' })}`);

  let fotos = (crudas || []).map(aFoto);
  if (collectionId && collectionId !== 'all' && q.trim()) fotos = fotos.filter((f) => coincideTexto(f, q));
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

// Álbum donde caen las imágenes que se suben desde Mi unidad.
const ALBUM_MI_UNIDAD = 'Mi unidad';

/** Registra en Fotos una imagen que ya está en el Home (el servicio la lee por RMI). */
export async function agregarAFotos({ homeRuta, titulo }) {
  if (USE_MOCKS) return null;
  const albums = await request(`${API_BASE.photos}/albums`) || [];
  let album = albums.find((a) => a.titulo === ALBUM_MI_UNIDAD && a.miRol === 'propietario');
  if (!album) {
    album = await request(`${API_BASE.photos}/albums${qs({ titulo: ALBUM_MI_UNIDAD })}`, { method: 'POST' });
  }
  return request(`${API_BASE.photos}/albums/${encodeURIComponent(album.id)}/imagenes${qs({ homeRuta, titulo })}`,
    { method: 'POST', retries: 0 });
}

async function updatePhotoMock(id, { titulo, descripcion, etiquetas }) {
  await delay();
  const foto = photos.find((p) => p.id === id);
  if (!foto) throw new Error('Foto no encontrada');
  Object.assign(foto, { name: titulo, description: descripcion, tags: [...etiquetas] });
  return clone(foto);
}

async function updatePhotoReal(id, { titulo, descripcion, etiquetas }) {
  // qs omite vacíos: se añaden explícitamente para permitir borrar los detalles.
  const params = new URLSearchParams();
  params.set('titulo', titulo);
  params.set('descripcion', descripcion);
  params.set('etiquetas', etiquetas.join(','));
  return aFoto(await request(`${API_BASE.photos}/imagenes/${encodeURIComponent(id)}?${params}`,
    { method: 'PATCH', retries: 0 }));
}

function albumEditable(id) {
  const album = collections.find((a) => a.id === id);
  if (!album) throw new Error('Álbum no encontrado');
  if (!['propietario', 'admin'].includes(album.role)) throw new Error('No tienes permiso para compartir este álbum');
  return album;
}

async function shareAlbumMock(id, correo, accion) {
  await delay();
  const album = albumEditable(id);
  album.sharedWith = album.sharedWith.filter((c) => c !== correo);
  if (accion === 'grant') album.sharedWith.push(correo);
  return clone(album);
}

async function setAlbumPublicMock(id, activo) {
  await delay();
  const album = albumEditable(id);
  album.publico = activo;
  // El modo simulado no publica recursos fuera de la aplicación.
  album.urlPublica = activo ? `https://example.invalid/albums/${id}/${Date.now()}` : '';
  return clone(album);
}

const shareAlbumReal = async (id, correo, accion) => aAlbum(await request(
  `${API_BASE.photos}/albums/${encodeURIComponent(id)}/compartir${qs({ correo, accion })}`,
  { method: 'POST', retries: 0 }));
const setAlbumPublicReal = async (id, activo) => aAlbum(await request(
  `${API_BASE.photos}/albums/${encodeURIComponent(id)}/publico${qs({ accion: activo ? 'activar' : 'desactivar' })}`,
  { method: 'POST', retries: 0 }));

async function removePhotoMock(id) {
  await delay();
  const i = photos.findIndex((p) => p.id === id);
  if (i >= 0) photos.splice(i, 1);
}

const removePhotoReal = (id) =>
  request(`${API_BASE.photos}/imagenes/${encodeURIComponent(id)}`, { method: 'DELETE', retries: 0 });

/** Bytes originales de la foto, para guardarla en el equipo. */
const downloadPhotoReal = (id) => requestBlob(`${API_BASE.photos}/imagenes/${encodeURIComponent(id)}`);
async function downloadPhotoMock(id) {
  const foto = photos.find((p) => p.id === id);
  return (await fetch(foto?.url || '')).blob();
}

export const removePhoto = USE_MOCKS ? removePhotoMock : removePhotoReal;
export const downloadPhoto = USE_MOCKS ? downloadPhotoMock : downloadPhotoReal;
export const updatePhoto = USE_MOCKS ? updatePhotoMock : updatePhotoReal;
export const shareAlbum = USE_MOCKS ? shareAlbumMock : shareAlbumReal;
export const setAlbumPublic = USE_MOCKS ? setAlbumPublicMock : setAlbumPublicReal;
