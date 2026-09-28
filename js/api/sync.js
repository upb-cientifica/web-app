// API de sincronización de dispositivos, contra el servicio gRPC de Go (vía gateway REST).

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, qs } from './client.js';
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

// ---------- Modo real: contra el Service Bus → File Sync ----------
//
// File Sync habla gRPC con su cliente de escritorio —que es lo que necesita
// para transferir por bloques— y además publica una cara REST para consultas.
// Es esa la que media el bus: mediar gRPC desvirtuaría el protocolo.

const ESTADO_DISP = { sincronizado: 'synced', pendiente: 'pending', desconectado: 'offline' };

const listDevicesReal = async () =>
  (await request(`${API_BASE.sync}/dispositivos`) || []).map((d) => ({
    id: d.id,
    name: d.nombre,
    platform: d.plataforma,
    lastSyncAt: d.ultimaSync,
    status: ESTADO_DISP[d.estado] || 'offline',
    localFolder: d.carpetaLocal,
  }));

const listVersionableFilesReal = async () =>
  (await request(`${API_BASE.sync}/archivos`) || []).map((f) => ({
    id: f.ruta, name: f.nombre, version: f.version, sizeBytes: f.tamanoBytes,
  }));

const listVersionsReal = async ({ fileId }) =>
  (await request(`${API_BASE.sync}/versiones${qs({ ruta: fileId })}`) || []).map((v) => ({
    id: String(v.version),
    label: `Versión ${v.version}`,
    date: v.fecha,
    sizeMeta: `${v.tamanoBytes} B`,
    modifiedBy: v.autor,
    modifiedByName: v.autor,
    comment: v.comentario,
    device: v.dispositivo,
  }));

/**
 * Restaurar una versión mueve contenido, y eso lo hace el cliente por gRPC:
 * el servidor no puede reescribir el archivo del dispositivo por su cuenta.
 */
async function restoreVersionReal() {
  throw new Error('Restaurar una versión se hace desde el cliente de escritorio: '
    + 'filesync-client pull --dir <carpeta>');
}

const listConflictsReal = async () =>
  (await request(`${API_BASE.sync}/conflictos`) || []).map((c) => ({
    id: c.id,
    fileId: c.ruta,
    fileName: c.nombre,
    deviceId: c.dispositivo,
    detectedAt: c.detectadoEn,
    local: { date: c.detectadoEn, sizeMeta: `${c.tamanoCliente} B`, modifiedBy: c.dispositivo },
    server: { date: c.detectadoEn, sizeMeta: '—', modifiedBy: `versión ${c.versionServidor}` },
  }));

const ESTRATEGIA = { local: 'MANTENER_CLIENTE', server: 'MANTENER_SERVIDOR', both: 'MANTENER_AMBOS' };

const resolveConflictReal = async ({ conflictId, resolution }) => {
  await request(`${API_BASE.sync}/conflictos/resolver${qs({
    id: conflictId, estrategia: ESTRATEGIA[resolution] || 'MANTENER_SERVIDOR',
  })}`, { method: 'POST' });
  return { conflictId, resolution };
};

const listActivityReal = async () =>
  (await request(`${API_BASE.sync}/actividad`) || []).map((a) => ({
    id: a.id,
    deviceId: a.dispositivo,
    action: a.accion,
    fileName: a.archivo,
    timestamp: a.fecha,
    status: a.estado,
  }));

/** Resumen general de la sincronización. */
const getSyncStatusReal = () => request(`${API_BASE.sync}/estado`);

export const listDevices = USE_MOCKS ? listDevicesMock : listDevicesReal;
export const listVersionableFiles = USE_MOCKS ? listVersionableFilesMock : listVersionableFilesReal;
export const listVersions = USE_MOCKS ? listVersionsMock : listVersionsReal;
export const restoreVersion = USE_MOCKS ? restoreVersionMock : restoreVersionReal;
export const listConflicts = USE_MOCKS ? listConflictsMock : listConflictsReal;
export const resolveConflict = USE_MOCKS ? resolveConflictMock : resolveConflictReal;
export const listActivity = USE_MOCKS ? listActivityMock : listActivityReal;
export const getSyncStatus = USE_MOCKS ? (async () => ({})) : getSyncStatusReal;
