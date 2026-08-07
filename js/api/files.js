// API de archivos/carpetas (Home). Respalda el explorador (js/views/filesView.js).
// Misma firma en modo mock y modo real; el interruptor está en js/config.js.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
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

// ---------- Modo real (backend HTTP aún no disponible) ----------

async function listItemsReal({ section, parentId, type, search } = {}) {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (parentId) params.set('parentId', parentId);
  if (type && type !== 'all') params.set('type', type);
  if (search) params.set('q', search);
  return request(`${API_BASE.files}/items?${params.toString()}`);
}

const getQuickAccessReal = () => request(`${API_BASE.files}/quick-access`);
const getStorageUsageReal = () => request(`${API_BASE.files}/storage`);
const createFolderReal = (payload) => request(`${API_BASE.files}/folders`, { method: 'POST', body: payload });
const createFileReal = (payload) => request(`${API_BASE.files}/items`, { method: 'POST', body: payload });
const renameItemReal = ({ id, name }) => request(`${API_BASE.files}/items/${id}`, { method: 'PATCH', body: { name } });
const toggleStarReal = ({ id }) => request(`${API_BASE.files}/items/${id}/star`, { method: 'POST' });
const deleteItemReal = ({ id }) => request(`${API_BASE.files}/items/${id}`, { method: 'DELETE' });

const getItemDetailsReal = ({ id }) => request(`${API_BASE.files}/items/${id}/details`);
const updatePermissionsReal = ({ id, ...body }) => request(`${API_BASE.files}/items/${id}/permissions`, { method: 'PATCH', body });
const listSharesReal = ({ id }) => request(`${API_BASE.files}/items/${id}/shares`);
const addShareReal = ({ id, ...body }) => request(`${API_BASE.files}/items/${id}/shares`, { method: 'POST', body });
const removeShareReal = ({ id, shareId }) => request(`${API_BASE.files}/items/${id}/shares/${shareId}`, { method: 'DELETE' });
const listExternalLinksReal = ({ id }) => request(`${API_BASE.files}/items/${id}/links`);
const createExternalLinkReal = ({ id, ...body }) => request(`${API_BASE.files}/items/${id}/links`, { method: 'POST', body });
const revokeExternalLinkReal = ({ id, linkId }) => request(`${API_BASE.files}/items/${id}/links/${linkId}`, { method: 'DELETE' });

// ---------- Exportes: misma firma sin importar el modo ----------

export const listItems = USE_MOCKS ? listItemsMock : listItemsReal;
export const getQuickAccess = USE_MOCKS ? getQuickAccessMock : getQuickAccessReal;
export const getStorageUsage = USE_MOCKS ? getStorageUsageMock : getStorageUsageReal;
export const createFolder = USE_MOCKS ? createFolderMock : createFolderReal;
export const createFile = USE_MOCKS ? createFileMock : createFileReal;
export const renameItem = USE_MOCKS ? renameItemMock : renameItemReal;
export const toggleStar = USE_MOCKS ? toggleStarMock : toggleStarReal;
export const deleteItem = USE_MOCKS ? deleteItemMock : deleteItemReal;
export const getItemDetails = USE_MOCKS ? getItemDetailsMock : getItemDetailsReal;
export const updatePermissions = USE_MOCKS ? updatePermissionsMock : updatePermissionsReal;
export const listShares = USE_MOCKS ? listSharesMock : listSharesReal;
export const addShare = USE_MOCKS ? addShareMock : addShareReal;
export const removeShare = USE_MOCKS ? removeShareMock : removeShareReal;
export const listExternalLinks = USE_MOCKS ? listExternalLinksMock : listExternalLinksReal;
export const createExternalLink = USE_MOCKS ? createExternalLinkMock : createExternalLinkReal;
export const revokeExternalLink = USE_MOCKS ? revokeExternalLinkMock : revokeExternalLinkReal;
