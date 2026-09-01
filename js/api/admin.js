// API de administración: usuarios, mapa de servicios, bitácora de auditoría.
// Solo accesible con rol 'admin' (guarda de ruta en js/main.js).

import { USE_MOCKS, API_BASE, BUS_URL } from '../config.js';
import { request, qs } from './client.js';
import { delay, genId, clone } from './mock/helpers.js';
import { principals } from './mock/data.js';
import { userMeta, services, auditLog } from './mock/adminData.js';
import { CURRENT_USER_ID } from '../utils/currentUser.js';

function logAudit(action, target) {
  auditLog.unshift({ id: genId('au'), userId: CURRENT_USER_ID, action, target, timestamp: new Date().toISOString() });
}

function joinedUser(p) {
  const meta = userMeta[p.id] || { role: 'user', groupId: null, quotaGB: 50, status: 'active' };
  return { id: p.id, name: p.name, email: p.email, ...meta };
}

// ---------- Usuarios ----------

async function listUsersMock() {
  await delay();
  return clone(principals.filter((p) => p.type === 'user').map(joinedUser));
}

async function createUserMock({ name, email, role = 'user', groupId = null, quotaGB = 50 }) {
  await delay();
  if (!name || !email) throw new Error('Nombre y correo son obligatorios');
  const id = genId('u');
  principals.push({ id, type: 'user', name, email });
  userMeta[id] = { role, groupId, quotaGB: Number(quotaGB) || 0, status: 'active' };
  logAudit('crear_usuario', name);
  return clone(joinedUser({ id, name, email }));
}

async function setUserStatusMock({ id, status }) {
  await delay();
  if (!userMeta[id]) throw new Error('Usuario no encontrado');
  userMeta[id].status = status;
  const name = principals.find((p) => p.id === id)?.name || id;
  logAudit(status === 'active' ? 'activar_usuario' : 'dar_de_baja_usuario', name);
  return clone(joinedUser({ id, ...principals.find((p) => p.id === id) }));
}

async function updateUserQuotaMock({ id, quotaGB }) {
  await delay();
  if (!userMeta[id]) throw new Error('Usuario no encontrado');
  userMeta[id].quotaGB = Number(quotaGB) || 0;
  const name = principals.find((p) => p.id === id)?.name || id;
  logAudit('cambiar_cuota', `${name} → ${quotaGB} GB`);
  return clone(joinedUser({ id, ...principals.find((p) => p.id === id) }));
}

// ---------- Mapa de servicios ----------

async function listServicesMock() {
  await delay();
  return clone(services);
}

// ---------- Bitácora de auditoría ----------

async function listAuditLogMock({ userId = 'all', action = 'all', dateFrom = '', dateTo = '' } = {}) {
  await delay();
  const items = auditLog.filter((entry) => {
    if (userId !== 'all' && entry.userId !== userId) return false;
    if (action !== 'all' && entry.action !== action) return false;
    const day = entry.timestamp.slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  });
  return clone(items
    .map((e) => ({ ...e, userName: principals.find((p) => p.id === e.userId)?.name || e.userId }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
}

// ---------- Modo real: contra el Service Bus → Servicio de Usuarios ----------
//
// Todas estas operaciones son SOAP: el bus arma el sobre y devuelve JSON, así
// que aquí solo se adapta la forma. Requieren rol admin, que el propio servicio
// comprueba.

const GB = 1024 ** 3;

function comoLista(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// El directorio nombra el estado en español y la interfaz en inglés. Traducir
// en los dos sentidos es trabajo de esta capa: sin ello, la vista comparaba
// `estado === 'active'` -contra "activo"- y nunca acertaba, así que todas las
// cuentas se dibujaban como dadas de baja y el botón guardaba "inactive", que
// no es ninguno de los dos valores que el directorio entiende.
const ESTADO_A_UI = { activo: 'active', inactivo: 'inactive' };
const UI_A_ESTADO = { active: 'activo', inactive: 'inactivo' };

/** Usuario del directorio → el que dibuja la interfaz. */
function aUsuario(u) {
  return {
    id: u.id,
    name: u.nombre,
    email: u.correo,
    role: u.rol,
    status: ESTADO_A_UI[u.estado] || u.estado,
    group: u.grupo || null,
    quotaGB: Math.round(((Number(u.cuotaBytes) || 0) / GB) * 100) / 100,
    usedGB: Math.round(((Number(u.usoBytes) || 0) / GB) * 100) / 100,
    services: comoLista(u.servicios),
    createdAt: u.creadoEn,
  };
}

const listUsersReal = async () => {
  const d = await request(`${API_BASE.users}/listarUsuarios${qs({ tamano: 100 })}`, { method: 'POST' });
  return comoLista(d?.items).map(aUsuario);
};

const createUserReal = async ({ name, email, password, role = 'investigador' } = {}) => {
  const d = await request(`${API_BASE.users}/crearUsuario${qs({
    nombre: name, correo: email, password, rol: role,
  })}`, { method: 'POST' });
  return aUsuario(d);
};

const setUserStatusReal = async ({ id, status }) => {
  const d = await request(`${API_BASE.users}/actualizarUsuario${qs({
    id, estado: UI_A_ESTADO[status] || status,
  })}`, { method: 'POST' });
  return aUsuario(d);
};

const updateUserQuotaReal = async ({ id, quotaGB }) => {
  const d = await request(`${API_BASE.users}/actualizarUsuario${qs({
    id, cuotaBytes: Math.round(quotaGB * GB),
  })}`, { method: 'POST' });
  return aUsuario(d);
};

/**
 * Mapa de servicios. Se arma con las tres fuentes que lo describen:
 * el catálogo del directorio (qué servicios existen y cómo se llaman), el
 * registro del bus (dónde vive cada uno y con qué protocolo se le habla) y el
 * Monitoreo (si responde). Es el mismo catálogo que gobierna el claim del JWT.
 */
const normaliza = (s) => String(s || '').toLowerCase().replace(/[-_\s]/g, '');

const listServicesReal = async () => {
  const [cat, registro, estado] = await Promise.all([
    request(`${API_BASE.users}/listarCatalogos`, { method: 'POST' }),
    request(`${BUS_URL}/registro`).catch(() => []),
    request(`${API_BASE.metrics}/servicios`).catch(() => []),
  ]);

  // Los nombres difieren entre fuentes (file_sync / file-sync): se comparan
  // sin guiones ni mayúsculas.
  const enBus = new Map((registro || []).map((r) => [normaliza(r.codigo), r]));
  const vivos = new Map((estado || []).map((s) => [normaliza(s.nombre), s]));

  return comoLista(cat?.servicios).map((s) => {
    const k = normaliza(s.codigo);
    const r = enBus.get(k);
    const v = vivos.get(k);
    return {
      code: s.codigo,
      name: s.nombre,
      url: r ? r.endpoint : '—',
      protocol: r ? r.protocolo : '—',
      status: v ? (v.estado === 'disponible' ? 'up' : 'down') : (r ? 'sin sondear' : 'no registrado'),
      latencyMs: v?.latenciaMs ?? null,
    };
  });
};

/** Auditoría: las sesiones abiertas, que es la bitácora que lleva el directorio. */
const listAuditLogReal = async () => {
  const d = await request(`${API_BASE.users}/listarSesiones`, { method: 'POST' });
  return comoLista(d?.items ?? d?.sesiones).map((s) => ({
    id: s.id,
    user: s.correo || s.usuario,
    action: 'sesión iniciada',
    detail: s.dispositivo || s.ip || '',
    timestamp: s.creadoEn || s.iniciadaEn,
    status: s.revocada === 'true' ? 'revocada' : 'activa',
  }));
};

export const listUsers = USE_MOCKS ? listUsersMock : listUsersReal;
export const createUser = USE_MOCKS ? createUserMock : createUserReal;
export const setUserStatus = USE_MOCKS ? setUserStatusMock : setUserStatusReal;
export const updateUserQuota = USE_MOCKS ? updateUserQuotaMock : updateUserQuotaReal;
export const listServices = USE_MOCKS ? listServicesMock : listServicesReal;
export const listAuditLog = USE_MOCKS ? listAuditLogMock : listAuditLogReal;
