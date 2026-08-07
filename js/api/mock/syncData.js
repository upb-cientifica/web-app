// Estado en memoria de sincronización de dispositivos (modo mock).

const T = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();

export const devices = [
  { id: 'd1', name: 'Laptop-Yolanda', platform: 'Linux', lastSyncAt: T(0.2), status: 'synced' },
  { id: 'd2', name: 'Estación-Lab3',  platform: 'Windows', lastSyncAt: T(6), status: 'pending' },
  { id: 'd3', name: 'iPhone de Yolanda', platform: 'iOS', lastSyncAt: T(1.5), status: 'synced' },
  { id: 'd4', name: 'Servidor-Backup', platform: 'Linux', lastSyncAt: T(72), status: 'offline' },
];

export const conflicts = [
  {
    id: 'cf1', fileId: 'a3', fileName: 'Plan PROYECTO.xlsx', deviceId: 'd2',
    local: { date: '22 jul 2026', sizeMeta: '318 KB', modifiedBy: 'u2' },
    server: { date: '22 jul 2026', sizeMeta: '320 KB', modifiedBy: 'u1' },
  },
  {
    id: 'cf2', fileId: 'a7', fileName: 'Resultados PRUEBAS.xlsx', deviceId: 'd1',
    local: { date: '18 jul 2026', sizeMeta: '182 KB', modifiedBy: 'u1' },
    server: { date: '18 jul 2026', sizeMeta: '180 KB', modifiedBy: 'u4' },
  },
];

export const activity = [
  { id: 'ac1', deviceId: 'd1', action: 'subida', fileName: 'Documento TESIS.docx', timestamp: T(0.2), status: 'ok' },
  { id: 'ac2', deviceId: 'd3', action: 'descarga', fileName: 'Diagrama ARQUITECTURA.png', timestamp: T(1.5), status: 'ok' },
  { id: 'ac3', deviceId: 'd2', action: 'conflicto detectado', fileName: 'Plan PROYECTO.xlsx', timestamp: T(6), status: 'conflicto' },
  { id: 'ac4', deviceId: 'd1', action: 'conflicto detectado', fileName: 'Resultados PRUEBAS.xlsx', timestamp: T(8), status: 'conflicto' },
  { id: 'ac5', deviceId: 'd1', action: 'subida', fileName: 'Foto Equipo.jpg', timestamp: T(20), status: 'ok' },
  { id: 'ac6', deviceId: 'd4', action: 'sin conexión', fileName: '—', timestamp: T(72), status: 'error' },
  { id: 'ac7', deviceId: 'd2', action: 'descarga', fileName: 'Presentacion DEFENSA.pptx', timestamp: T(30), status: 'ok' },
];
