// API de administración: usuarios, mapa de servicios, bitácora de auditoría.
// Solo accesible con rol 'admin' (guarda de ruta en js/main.js).

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
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

// ---------- Modo real (backend HTTP aún no disponible) ----------

const listUsersReal = () => request(`${API_BASE.users}/admin/users`);
const createUserReal = (payload) => request(`${API_BASE.users}/admin/users`, { method: 'POST', body: payload });
const setUserStatusReal = ({ id, status }) => request(`${API_BASE.users}/admin/users/${id}/status`, { method: 'PATCH', body: { status } });
const updateUserQuotaReal = ({ id, quotaGB }) => request(`${API_BASE.users}/admin/users/${id}/quota`, { method: 'PATCH', body: { quotaGB } });
const listServicesReal = () => request(`${API_BASE.metrics}/services/map`);
const listAuditLogReal = (params = {}) => request(`${API_BASE.users}/admin/audit?${new URLSearchParams(params).toString()}`);

export const listUsers = USE_MOCKS ? listUsersMock : listUsersReal;
export const createUser = USE_MOCKS ? createUserMock : createUserReal;
export const setUserStatus = USE_MOCKS ? setUserStatusMock : setUserStatusReal;
export const updateUserQuota = USE_MOCKS ? updateUserQuotaMock : updateUserQuotaReal;
export const listServices = USE_MOCKS ? listServicesMock : listServicesReal;
export const listAuditLog = USE_MOCKS ? listAuditLogMock : listAuditLogReal;
