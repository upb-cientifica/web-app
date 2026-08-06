// Estado en memoria del panel de administración (modo mock).

const H = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();

// Metadatos administrativos por usuario (id coincide con principals en mock/data.js).
export const userMeta = {
  u1: { role: 'admin', groupId: 'g1', quotaGB: 2027, status: 'active' },
  u2: { role: 'user',  groupId: 'g1', quotaGB: 100,  status: 'active' },
  u3: { role: 'user',  groupId: 'g3', quotaGB: 100,  status: 'active' },
  u4: { role: 'user',  groupId: 'g2', quotaGB: 50,   status: 'inactive' },
};

export const services = [
  { name: 'web',           url: 'http://localhost:8080',           status: 'up' },
  { name: 'autenticación', url: 'http://localhost:8080/api/users',   status: 'up' },
  { name: 'sync',          url: 'http://localhost:8080/api/sync',    status: 'up' },
  { name: 'clúster',       url: 'http://localhost:8080/api/jobs',    status: 'up' },
  { name: 'almacenamiento',url: 'http://localhost:8080/api/files',   status: 'up' },
];

export const auditLog = [
  { id: 'au1', userId: 'u1', action: 'login',            target: '—',                         timestamp: H(0.1) },
  { id: 'au2', userId: 'u1', action: 'crear_carpeta',     target: 'Proyecto Final',             timestamp: H(2) },
  { id: 'au3', userId: 'u2', action: 'compartir',         target: 'Documento TESIS.docx',       timestamp: H(5) },
  { id: 'au4', userId: 'u1', action: 'cambiar_permisos',  target: 'Documento TESIS.docx',       timestamp: H(6) },
  { id: 'au5', userId: 'u3', action: 'login',             target: '—',                          timestamp: H(20) },
  { id: 'au6', userId: 'u4', action: 'eliminar',          target: 'Borrador antiguo.docx',       timestamp: H(30) },
  { id: 'au7', userId: 'u1', action: 'enviar_trabajo',    target: 'Simulación CFD',              timestamp: H(48) },
  { id: 'au8', userId: 'u2', action: 'descargar',         target: 'Plan PROYECTO.xlsx',          timestamp: H(50) },
];
