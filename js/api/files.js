// API de archivos/carpetas (Home). Respalda el explorador (js/views/filesView.js).
// Misma firma en modo mock y modo real; el interruptor está en js/config.js.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, requestBlob, qs } from './client.js';
import { agregarAFotos } from './photos.js';
import { importarVideo } from './videos.js';
import { delay, genId, clone } from './mock/helpers.js';
import { folders, files, quickAccess, STORAGE, principals, shares, externalLinks } from './mock/data.js';
import { modeToTriads } from '../utils/permissions.js';
import { CURRENT_USER_ID, CURRENT_USER_GROUPS } from '../utils/currentUser.js';

// ---------- Modo mock (datos en memoria) ----------

async function listItemsMock({ section = 'my-drive', parentId = null, type = 'all', search = '' } = {}) {
  await delay();
  const q = search.trim().toLowerCase();

  const matches = (item) => {
    if (section === 'starred') {
      if (!item.starred) return false;
    } else if (section === 'my-drive') {
      if ((item.parentId || null) !== parentId) return false;
    } else {
      // Otras secciones (compartido, computadora, papelera) no tienen datos de ejemplo aún.
      return false;
    }
    if (type !== 'all' && item.type !== type) return false;
    if (q && !item.name.toLowerCase().includes(q)) return false;
    return true;
  };

  return {
    folders: clone(folders.filter(matches)),
    files: clone(files.filter(matches)),
  };
}

async function getQuickAccessMock() {
  await delay();
  return clone(quickAccess);
}

async function getStorageUsageMock() {
  await delay();
  return clone(STORAGE);
}

async function createFolderMock({ name, parentId = null }) {
  await delay();
  const folder = {
    id: genId('f'),
    name,
    type: 'folder',
    meta: '0 elementos',
    date: 'hoy',
    starred: false,
    parentId,
  };
  folders.unshift(folder);
  return clone(folder);
}

async function uploadFileMock({ file, parentId = null }) {
  return createFileMock({ name: file.name, parentId, meta: `${Math.max(1, Math.round(file.size / 1024))} KB` });
}

async function createFileMock({ name, parentId = null, type = 'doc', meta = '—' }) {
  await delay();
  const file = {
    id: genId('a'),
    name,
    type,
    meta,
    date: 'hoy',
    starred: false,
    parentId,
    owner: 'u1',
    group: 'g1',
    mode: '644',
  };
  files.unshift(file);
  return clone(file);
}

function findItemMutable(id) {
  return folders.find((x) => x.id === id) || files.find((x) => x.id === id);
}

async function renameItemMock({ id, name }) {
  await delay();
  const item = findItemMutable(id);
  if (!item) throw new Error('Elemento no encontrado');
  item.name = name;
  return clone(item);
}

async function toggleStarMock({ id }) {
  await delay();
  const item = findItemMutable(id);
  if (!item) throw new Error('Elemento no encontrado');
  item.starred = !item.starred;
  return clone(item);
}

async function deleteItemMock({ id }) {
  await delay();
  const idxF = folders.findIndex((f) => f.id === id);
  if (idxF >= 0) folders.splice(idxF, 1);
  const idxA = files.findIndex((f) => f.id === id);
  if (idxA >= 0) files.splice(idxA, 1);
}

function resolvePrincipal(id) {
  return principals.find((p) => p.id === id) || null;
}

function effectivePermissionFor(item) {
  const triads = modeToTriads(item.mode || '000');
  if (item.owner === CURRENT_USER_ID) return triads.owner;
  if (item.group && CURRENT_USER_GROUPS.includes(item.group)) return triads.group;
  return triads.others;
}

async function getItemDetailsMock({ id }) {
  await delay();
  const item = findItemMutable(id);
  if (!item) throw new Error('Elemento no encontrado');
  return clone({
    ...item,
    ownerPrincipal: resolvePrincipal(item.owner),
    groupPrincipal: resolvePrincipal(item.group),
    effectivePermission: effectivePermissionFor(item),
    versions: item.versions || [],
  });
}

async function updatePermissionsMock({ id, owner, group, mode }) {
  await delay();
  const item = findItemMutable(id);
  if (!item) throw new Error('Elemento no encontrado');
  if (owner) item.owner = owner;
  if (group) item.group = group;
  if (mode) item.mode = mode;
  return clone(item);
}

async function listSharesMock({ id }) {
  await delay();
  const list = shares[id] || [];
  return clone(list.map((s) => ({ ...s, principal: resolvePrincipal(s.principalId) })));
}

async function addShareMock({ id, principalId, role }) {
  await delay();
  if (!shares[id]) shares[id] = [];
  const existing = shares[id].find((s) => s.principalId === principalId);
  if (existing) {
    existing.role = role;
    return clone({ ...existing, principal: resolvePrincipal(principalId) });
  }
  const share = { id: genId('sh'), principalId, role };
  shares[id].push(share);
  return clone({ ...share, principal: resolvePrincipal(principalId) });
}

async function removeShareMock({ id, shareId }) {
  await delay();
  if (!shares[id]) return;
  shares[id] = shares[id].filter((s) => s.id !== shareId);
}

async function listExternalLinksMock({ id }) {
  await delay();
  return clone(externalLinks[id] || []);
}

async function createExternalLinkMock({ id, role, expiresAt }) {
  await delay();
  if (!externalLinks[id]) externalLinks[id] = [];
  const link = {
    id: genId('lnk'),
    role,
    expiresAt: expiresAt || null,
    token: genId('tok'),
  };
  externalLinks[id].push(link);
  return clone(link);
}

async function revokeExternalLinkMock({ id, linkId }) {
  await delay();
  if (!externalLinks[id]) return;
  externalLinks[id] = externalLinks[id].filter((l) => l.id !== linkId);
}

// ---------- Modo real: contra el Service Bus → Shared File Server ----------
//
// El Shared File Server identifica cada nodo por su **ruta** dentro del Home,
// no por un id opaco. Aquí la ruta ES el id: es única, estable y permite
// deducir el padre sin una llamada extra.

const GB = 1024 ** 3;

function padreDe(ruta) {
  const i = ruta.lastIndexOf('/');
  return i <= 0 ? '/' : ruta.slice(0, i);
}

function tamanoLegible(bytes) {
  if (!bytes) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

function fechaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Traduce la clasificación del servicio al tipo que dibuja la interfaz. */
function aTipo(n) {
  if (n.esCarpeta) return 'folder';
  switch (n.tipo) {
    case 'imagen': return 'image';
    case 'video': return 'video';
    case 'dataset': return 'sheet';
    default: return 'doc';
  }
}

/** Nodo del Shared File Server → Item de la interfaz. */
function aItem(n) {
  return {
    id: n.ruta,
    name: n.nombre,
    type: aTipo(n),
    meta: n.esCarpeta ? 'Carpeta' : tamanoLegible(n.tamanoBytes),
    date: fechaLegible(n.modificadoEn),
    starred: !!n.destacado,
    parentId: padreDe(n.ruta),
    owner: n.propietario,
    group: n.grupo || '',
    mode: n.permisos?.octal || '640',
    sizeBytes: n.tamanoBytes || 0,
    version: n.version || 0,
    miAcceso: n.miAcceso || '',
  };
}

const RUTA_SECCION = { starred: 'destacados', trash: 'papelera' };

async function listItemsReal({ section = 'my-drive', parentId = null, type = 'all', search = '' } = {}) {
  let d;
  if (section === 'shared') {
    // Lo que otros me compartieron: llega como lista plana, ya con propietario.
    const filas = await request(`${API_BASE.files}/compartidos-conmigo`);
    d = { carpetas: [], archivos: filas || [] };
  } else if (RUTA_SECCION[section]) {
    d = await request(`${API_BASE.files}/files${qs({ seccion: RUTA_SECCION[section] })}`);
  } else {
    d = await request(`${API_BASE.files}/files${qs({ ruta: parentId || '/' })}`);
  }

  const q = search.trim().toLowerCase();
  const filtra = (it) => (type === 'all' || it.type === type || (type === 'folder' && it.type === 'folder'))
    && (!q || it.name.toLowerCase().includes(q));

  return {
    folders: (d.carpetas || []).map(aItem).filter(filtra),
    files: (d.archivos || []).map(aItem).filter(filtra),
  };
}

/** Acceso rápido: las carpetas de primer nivel del Home. */
async function getQuickAccessReal() {
  const d = await request(`${API_BASE.files}/files${qs({ ruta: '/' })}`);
  const colores = ['#4c8dff', '#a371f7', '#e0537b', '#2fa37a', '#d29922'];
  return (d.carpetas || []).slice(0, 5).map((c, i) => ({
    id: c.ruta, name: c.nombre, icon: 'folder', color: colores[i % colores.length],
  }));
}

async function getStorageUsageReal() {
  const d = await request(`${API_BASE.files}/home`);
  return {
    // En GB para la barra de la barra lateral, que es lo que dibuja.
    used: Math.round(((d.usadoBytes || 0) / GB) * 100) / 100,
    total: Math.round(((d.cuotaBytes || 0) / GB) * 100) / 100,
    // Y en bytes, porque redondear a dos decimales de GB convierte en "0"
    // cualquier Home de menos de 10 MB: quien muestre una cifra exacta debe
    // partir de aquí.
    usedBytes: d.usadoBytes || 0,
    totalBytes: d.cuotaBytes || 0,
  };
}

const createFolderReal = async ({ name, parentId }) =>
  aItem(await request(`${API_BASE.files}/files/carpeta${qs({ ruta: parentId || '/', nombre: name })}`,
    { method: 'POST' }));

/** Crea un archivo con contenido mínimo (p. ej. el resultado de un trabajo MPI). */
const createFileReal = async ({ name, parentId }) =>
  aItem(await request(`${API_BASE.files}/files/upload${qs({ ruta: parentId || '/', nombre: name })}`,
    { method: 'POST', body: { creadoPor: 'web' } }));

/**
 * Sube un archivo del equipo al Home. El Shared File Server recibe los bytes
 * tal cual en el cuerpo y toma la carpeta y el nombre de la consulta; el bus
 * los reenvía sin tocarlos. Sin reintento: repetir un archivo grande a ciegas
 * por un fallo de red duplicaría el tráfico sin avisar.
 */
const uploadFileReal = async ({ file, parentId }) => {
  const item = aItem(await request(`${API_BASE.files}/files/upload${qs({ ruta: parentId || '/', nombre: file.name })}`,
    { method: 'POST', body: file, retries: 0 }));
  // Una imagen subida a Mi unidad también debe verse en Fotos. El Álbum la
  // toma del Home por RMI (no se vuelve a subir desde el navegador); si eso
  // falla, el archivo ya quedó guardado y solo se avisa en consola.
  if (item.type === 'image') {
    await agregarAFotos({ homeRuta: item.id, titulo: item.name })
      .catch((e) => console.warn('No se pudo añadir a Fotos:', e.message));
  } else if (item.type === 'video') {
    // Igual con los videos: quedan publicados en Streaming (HLS).
    await importarVideo({ ruta: item.id, titulo: item.name.replace(/\.[^.]+$/, '') })
      .catch((e) => console.warn('No se pudo publicar en Videos:', e.message));
  }
  return item;
};

/** Bytes de un archivo del Home, para la vista previa. */
async function downloadBlobReal({ id, owner }) {
  return requestBlob(`${API_BASE.files}/files/download${qs({ ruta: id, propietario: owner })}`);
}

const renameItemReal = async ({ id, name }) =>
  aItem(await request(`${API_BASE.files}/files${qs({ ruta: id, nuevoNombre: name })}`, { method: 'PATCH' }));

// Sin `valor`, el servicio conmuta el destacado.
const toggleStarReal = async ({ id }) =>
  aItem(await request(`${API_BASE.files}/files/destacar${qs({ ruta: id })}`, { method: 'POST' }));

/** Borrado reversible: va a la papelera. Con `definitivo` se elimina de verdad. */
const deleteItemReal = ({ id, definitivo = false }) =>
  request(`${API_BASE.files}/files${qs({ ruta: id, definitivo: definitivo ? 'true' : '' })}`,
    { method: 'DELETE' });

const restoreItemReal = async ({ id }) =>
  aItem(await request(`${API_BASE.files}/files/restaurar${qs({ ruta: id })}`, { method: 'POST' }));

function aShare(c) {
  return {
    id: c.correo,
    principalId: c.correo,
    role: c.permiso === 'escritura' ? 'editor' : 'viewer',
    principal: { id: c.correo, type: 'user', name: c.correo, email: c.correo },
  };
}

async function getItemDetailsReal({ id }) {
  const [perm, versiones] = await Promise.all([
    request(`${API_BASE.files}/files/permisos${qs({ ruta: id })}`),
    request(`${API_BASE.files}/files/versiones${qs({ ruta: id })}`).catch(() => []),
  ]);
  const p = perm.permisos || {};
  return {
    id,
    name: id.slice(id.lastIndexOf('/') + 1),
    owner: perm.propietario,
    group: perm.grupo || '',
    mode: p.octal || '640',
    ownerPrincipal: { id: perm.propietario, type: 'user', name: perm.propietario, email: perm.propietario },
    groupPrincipal: perm.grupo ? { id: perm.grupo, type: 'group', name: perm.grupo } : null,
    effectivePermission: {
      read: !!p.propietario?.lectura, write: !!p.propietario?.escritura, execute: !!p.propietario?.ejecucion,
    },
    shares: (perm.compartidoCon || []).map(aShare),
    versions: (versiones || []).map((v) => ({
      id: String(v.version),
      label: `Versión ${v.version}`,
      date: fechaLegible(v.fecha),
      sizeMeta: tamanoLegible(v.tamanoBytes),
      modifiedBy: v.autor,
    })),
  };
}

const updatePermissionsReal = async ({ id, mode, group }) => {
  const m = String(mode || '640').padStart(3, '0');
  return aItem(await request(`${API_BASE.files}/files/permisos${qs({
    ruta: id, owner: m[0], group: m[1], others: m[2], grupo: group,
  })}`, { method: 'PUT' }));
};

const listSharesReal = async ({ id }) =>
  ((await request(`${API_BASE.files}/files/permisos${qs({ ruta: id })}`)).compartidoCon || []).map(aShare);

const addShareReal = async ({ id, principalId, role }) => {
  await request(`${API_BASE.files}/files/compartir${qs({
    ruta: id, correo: principalId, permiso: role === 'editor' ? 'escritura' : 'lectura', accion: 'grant',
  })}`, { method: 'POST' });
  return listSharesReal({ id });
};

const removeShareReal = async ({ id, shareId }) => {
  await request(`${API_BASE.files}/files/compartir${qs({ ruta: id, correo: shareId, accion: 'revoke' })}`,
    { method: 'POST' });
  return null;
};

// El Shared File Server comparte por ACL de usuario, no con enlaces que caducan.
// El Álbum de fotos sí publica enlaces externos; para archivos aún no existe.
const listExternalLinksReal = async () => [];
const createExternalLinkReal = async () => {
  throw new Error('Los enlaces externos con caducidad aún no están disponibles para archivos');
};
const revokeExternalLinkReal = async () => null;

// ---------- Exportes: misma firma sin importar el modo ----------

export const listItems = USE_MOCKS ? listItemsMock : listItemsReal;
export const getQuickAccess = USE_MOCKS ? getQuickAccessMock : getQuickAccessReal;
export const getStorageUsage = USE_MOCKS ? getStorageUsageMock : getStorageUsageReal;
export const createFolder = USE_MOCKS ? createFolderMock : createFolderReal;
export const createFile = USE_MOCKS ? createFileMock : createFileReal;
export const uploadFile = USE_MOCKS ? uploadFileMock : uploadFileReal;
export const downloadBlob = USE_MOCKS ? async () => null : downloadBlobReal;
export const renameItem = USE_MOCKS ? renameItemMock : renameItemReal;
export const toggleStar = USE_MOCKS ? toggleStarMock : toggleStarReal;
export const deleteItem = USE_MOCKS ? deleteItemMock : deleteItemReal;
export const restoreItem = USE_MOCKS ? (async (x) => x) : restoreItemReal;
export const getItemDetails = USE_MOCKS ? getItemDetailsMock : getItemDetailsReal;
export const updatePermissions = USE_MOCKS ? updatePermissionsMock : updatePermissionsReal;
export const listShares = USE_MOCKS ? listSharesMock : listSharesReal;
export const addShare = USE_MOCKS ? addShareMock : addShareReal;
export const removeShare = USE_MOCKS ? removeShareMock : removeShareReal;
export const listExternalLinks = USE_MOCKS ? listExternalLinksMock : listExternalLinksReal;
export const createExternalLink = USE_MOCKS ? createExternalLinkMock : createExternalLinkReal;
export const revokeExternalLink = USE_MOCKS ? revokeExternalLinkMock : revokeExternalLinkReal;
