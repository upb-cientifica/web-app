// API de usuarios y sesión, contra el servicio SOAP de PHP (vía gateway REST).
// Andamiaje de la fase 1: se conecta a la UI de autenticación en la fase 2.1.

import { USE_MOCKS, API_BASE, DOMINIO_CORREO } from '../config.js';
import { request, qs, setAuthToken } from './client.js';
import { delay, clone } from './mock/helpers.js';
import { principals } from './mock/data.js';

const MOCK_USER = {
  id: 'u1',
  name: 'Yolanda Sánchez',
  email: 'ysanchez@upb-cientifica.edu',
  role: 'admin',
  quotaUsedGB: 21,
  quotaTotalGB: 1.98 * 1024,
};

// Cualquier otro usuario/contraseña entra con rol "user" (sin admin), para
// poder probar de verdad la guarda de rol de la ruta /admin (fase 2.9).
function guestUser(username) {
  return {
    id: 'u-guest', name: username, email: `${username}@upb-cientifica.edu`,
    role: 'user', quotaUsedGB: 3, quotaTotalGB: 100,
  };
}

const pendingChallenges = new Map(); // challengeId -> username
let sessionUser = null;

async function loginMock({ username, password }) {
  await delay();
  if (!username || !password) throw new Error('Usuario y contraseña son obligatorios');
  const challengeId = 'chg' + Date.now().toString(36);
  pendingChallenges.set(challengeId, username);
  return { mfaRequired: true, challengeId };
}

async function verifyTotpMock({ challengeId, code }) {
  await delay();
  if (!/^\d{6}$/.test(code)) throw new Error('Código inválido');
  const username = pendingChallenges.get(challengeId) || '';
  pendingChallenges.delete(challengeId);
  sessionUser = username.trim().toLowerCase() === 'ysanchez' ? MOCK_USER : guestUser(username.trim() || 'invitado');
  return { token: 'mock-token', expiresInSeconds: 900, user: sessionUser };
}

async function refreshTokenMock() {
  await delay();
  return { token: 'mock-token', expiresInSeconds: 900 };
}

async function getCurrentUserMock() {
  await delay();
  return sessionUser || MOCK_USER;
}

async function logoutMock() {
  await delay();
  sessionUser = null;
  return null;
}

function randomBase32(length = 16) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function randomBackupCode() {
  const part = () => Math.floor(1000 + Math.random() * 9000);
  return `${part()}-${part()}`;
}

async function enrollMfaMock() {
  await delay();
  const secret = randomBase32();
  const issuer = 'UPB-Cientifica';
  const account = MOCK_USER.email;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  const backupCodes = Array.from({ length: 8 }, randomBackupCode);
  return { secret, otpauthUrl, backupCodes };
}

async function listPrincipalsMock({ search = '' } = {}) {
  await delay();
  const q = search.trim().toLowerCase();
  const items = q
    ? principals.filter((p) => p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
    : principals;
  return clone(items);
}

// ---------- Modo real: contra el Service Bus ----------
//
// El bus expone el Servicio de Usuarios (SOAP/PHP) como REST: arma el sobre
// SOAP y traduce la respuesta XML a JSON. Aquí sólo se adapta esa respuesta a
// la forma que consume la interfaz.

/** El usuario puede escribir "ana.torres" o el correo completo. */
function aCorreo(username) {
  const u = (username || '').trim();
  return u.includes('@') ? u : `${u}@${DOMINIO_CORREO}`;
}

const GB = 1024 ** 3;

/** Traduce el usuario que devuelve el Servicio de Usuarios al de la interfaz. */
function aUsuario(d) {
  return {
    id: d.id || '',
    name: d.nombre || d.correo || '',
    email: d.correo || '',
    role: d.rol === 'admin' ? 'admin' : 'user',
    quotaUsedGB: Math.round(((Number(d.usoBytes) || 0) / GB) * 100) / 100,
    quotaTotalGB: Math.round(((Number(d.cuotaBytes) || 0) / GB) * 100) / 100,
    // El bus devuelve un arreglo cuando hay varios servicios y un valor suelto
    // cuando hay uno solo, que es como lo expresa el XML.
    servicios: Array.isArray(d.servicios) ? d.servicios : (d.servicios ? [d.servicios] : []),
  };
}

// El token de acceso vive solo en memoria (15 minutos). El de refresco sí se
// guarda, para que recargar la página no obligue a entrar de nuevo: dura 7
// días, es lo único que se puede almacenar y se borra al cerrar sesión. El
// servidor lo rota en cada uso, así que un token robado que ya se usó no sirve.
const CLAVE_REFRESCO = 'upb.refreshToken';
let refreshTokenActual = null;

function recordarRefresco(t) {
  refreshTokenActual = t || null;
  try {
    if (t) localStorage.setItem(CLAVE_REFRESCO, t);
    else localStorage.removeItem(CLAVE_REFRESCO);
  } catch { /* almacenamiento bloqueado: la sesión seguirá siendo en memoria */ }
}

/** Borra el refresco guardado (cerrar sesión, o refresco que ya no sirve). */
export function olvidarSesionGuardada() {
  recordarRefresco(null);
}

/** ¿Quedó una sesión de antes que se pueda reanudar? */
export function haySesionGuardada() {
  if (USE_MOCKS) return false;
  try {
    refreshTokenActual = refreshTokenActual || localStorage.getItem(CLAVE_REFRESCO);
  } catch { /* sin almacenamiento */ }
  return !!refreshTokenActual;
}

async function loginReal({ username, password }) {
  const d = await request(`${API_BASE.users}/login${qs({ correo: aCorreo(username), password })}`,
    { method: 'POST' });
  if (!d?.accessToken) throw new Error('El servicio de usuarios no devolvió un token');
  recordarRefresco(d.refreshToken);
  setAuthToken(d.accessToken);
  // El sistema autentica con token (no con segundo factor): la sesión queda
  // lista aquí mismo y la vista se salta el paso de verificación.
  return {
    mfaRequired: false,
    token: d.accessToken,
    expiresInSeconds: Number(d.expiraEn) || 900,
    // La respuesta anida los datos del usuario bajo `usuario`.
    user: aUsuario(d.usuario || d),
  };
}

async function verifyTotpReal() {
  throw new Error('El sistema autentica con token; no hay verificación en dos pasos');
}

async function refreshTokenReal() {
  if (!refreshTokenActual) haySesionGuardada();
  if (!refreshTokenActual) throw new Error('No hay token de refresco');
  const d = await request(`${API_BASE.users}/renovarToken${qs({ refreshToken: refreshTokenActual })}`,
    { method: 'POST' });
  if (d?.refreshToken) recordarRefresco(d.refreshToken);
  setAuthToken(d.accessToken);
  return { token: d.accessToken, expiresInSeconds: Number(d.expiraEn) || 900 };
}

const getCurrentUserReal = async () => {
  const d = await request(`${API_BASE.users}/miPerfil`, { method: 'POST' });
  return aUsuario(d.usuario || d);
};

async function logoutReal() {
  try {
    await request(`${API_BASE.users}/cerrarSesion`, { method: 'POST' });
  } finally {
    recordarRefresco(null);
    setAuthToken(null);
  }
  return null;
}

async function enrollMfaReal() {
  throw new Error('El sistema autentica con token; no hay enrolamiento de segundo factor');
}

/** Directorio de usuarios para el selector de compartición. */
async function listPrincipalsReal({ search = '' } = {}) {
  const d = await request(`${API_BASE.users}/listarUsuarios${qs({ q: search, tamano: 100 })}`, { method: 'POST' });
  const filas = Array.isArray(d?.items) ? d.items : (d?.items ? [d.items] : []);
  return filas.map((u) => ({
    id: u.correo || u.id,
    type: 'user',
    name: u.nombre || u.correo,
    email: u.correo,
  }));
}

export const login = USE_MOCKS ? loginMock : loginReal;
export const verifyTotp = USE_MOCKS ? verifyTotpMock : verifyTotpReal;
export const refreshToken = USE_MOCKS ? refreshTokenMock : refreshTokenReal;
export const getCurrentUser = USE_MOCKS ? getCurrentUserMock : getCurrentUserReal;
export const logout = USE_MOCKS ? logoutMock : logoutReal;
export const enrollMfa = USE_MOCKS ? enrollMfaMock : enrollMfaReal;
export const listPrincipals = USE_MOCKS ? listPrincipalsMock : listPrincipalsReal;
