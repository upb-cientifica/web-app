// API de sincronización de dispositivos, contra el servicio gRPC de Go (vía gateway REST).

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
import { delay, genId, clone } from './mock/helpers.js';
import { devices, conflicts, activity } from './mock/syncData.js';
import { files, principals } from './mock/data.js';

function resolvePrincipalName(id) {
  return principals.find((p) => p.id === id)?.name || 'Desconocido';
}

function findFileMutable(id) {
  return files.find((f) => f.id === id);
}

// ---------- Dispositivos ----------

async function listDevicesMock() {
  await delay();
  return clone(devices);
}

// ---------- Versiones (comparten datos con js/api/files.js: campo `versions`) ----------

async function listVersionableFilesMock() {
  await delay();
  return clone(files.filter((f) => (f.versions || []).length > 1).map((f) => ({ id: f.id, name: f.name })));
}

async function listVersionsMock({ fileId }) {
  await delay();
  const file = findFileMutable(fileId);
  if (!file) throw new Error('Archivo no encontrado');
  return clone((file.versions || []).map((v) => ({ ...v, modifiedByName: resolvePrincipalName(v.modifiedBy) })));
}

async function restoreVersionMock({ fileId, versionId }) {
  await delay();
  const file = findFileMutable(fileId);
  if (!file) throw new Error('Archivo no encontrado');
  const target = (file.versions || []).find((v) => v.id === versionId);
  if (!target) throw new Error('Versión no encontrada');

  file.meta = target.sizeMeta;
  file.date = 'hoy';
  const rest = file.versions.filter((v) => v.id !== versionId);
  file.versions = [
    { ...target, label: 'Actual', date: 'hoy' },
    ...rest.map((v) => ({ ...v, label: 'Anterior' })),
  ];

  activity.unshift({
    id: genId('ac'), deviceId: devices[0]?.id || 'd1', action: 'versión restaurada',
    fileName: file.name, timestamp: new Date().toISOString(), status: 'ok',
  });

  return clone(file);
}

// ---------- Conflictos ----------

async function listConflictsMock() {
  await delay();
  return clone(conflicts);
}

async function resolveConflictMock({ conflictId, resolution }) {
  await delay();
  const idx = conflicts.findIndex((c) => c.id === conflictId);
  if (idx < 0) throw new Error('Conflicto no encontrado');
  const conflict = conflicts[idx];
  conflicts.splice(idx, 1);

  activity.unshift({
    id: genId('ac'), deviceId: conflict.deviceId,
    action: `conflicto resuelto (${resolution === 'local' ? 'versión local' : 'versión del servidor'})`,
    fileName: conflict.fileName, timestamp: new Date().toISOString(), status: 'ok',
  });

  return { conflictId, resolution };
}

// ---------- Actividad ----------

async function listActivityMock() {
  await delay();
  return clone([...activity].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
}

// ---------- Modo real (backend HTTP aún no disponible) ----------

const listDevicesReal = () => request(`${API_BASE.sync}/devices`);
const listVersionableFilesReal = () => request(`${API_BASE.sync}/files`);
const listVersionsReal = ({ fileId }) => request(`${API_BASE.sync}/files/${fileId}/versions`);
const restoreVersionReal = ({ fileId, versionId }) => request(`${API_BASE.sync}/files/${fileId}/versions/${versionId}/restore`, { method: 'POST' });
const listConflictsReal = () => request(`${API_BASE.sync}/conflicts`);
const resolveConflictReal = (payload) => request(`${API_BASE.sync}/conflicts/resolve`, { method: 'POST', body: payload });
const listActivityReal = () => request(`${API_BASE.sync}/activity`);

export const listDevices = USE_MOCKS ? listDevicesMock : listDevicesReal;
export const listVersionableFiles = USE_MOCKS ? listVersionableFilesMock : listVersionableFilesReal;
export const listVersions = USE_MOCKS ? listVersionsMock : listVersionsReal;
export const restoreVersion = USE_MOCKS ? restoreVersionMock : restoreVersionReal;
export const listConflicts = USE_MOCKS ? listConflictsMock : listConflictsReal;
export const resolveConflict = USE_MOCKS ? resolveConflictMock : resolveConflictReal;
export const listActivity = USE_MOCKS ? listActivityMock : listActivityReal;
