// API de usuarios y sesión, contra el servicio SOAP de PHP (vía gateway REST).
// Andamiaje de la fase 1: se conecta a la UI de autenticación en la fase 2.1.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
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

const loginReal = (payload) => request(`${API_BASE.users}/login`, { method: 'POST', body: payload });
const verifyTotpReal = (payload) => request(`${API_BASE.users}/mfa/verify`, { method: 'POST', body: payload });
const refreshTokenReal = () => request(`${API_BASE.users}/token/refresh`, { method: 'POST' });
const getCurrentUserReal = () => request(`${API_BASE.users}/me`);
const logoutReal = () => request(`${API_BASE.users}/logout`, { method: 'POST' });
const enrollMfaReal = () => request(`${API_BASE.users}/mfa/enroll`, { method: 'POST' });
const listPrincipalsReal = ({ search = '' } = {}) => request(`${API_BASE.users}/principals?q=${encodeURIComponent(search)}`);

export const login = USE_MOCKS ? loginMock : loginReal;
export const verifyTotp = USE_MOCKS ? verifyTotpMock : verifyTotpReal;
export const refreshToken = USE_MOCKS ? refreshTokenMock : refreshTokenReal;
export const getCurrentUser = USE_MOCKS ? getCurrentUserMock : getCurrentUserReal;
export const logout = USE_MOCKS ? logoutMock : logoutReal;
export const enrollMfa = USE_MOCKS ? enrollMfaMock : enrollMfaReal;
export const listPrincipals = USE_MOCKS ? listPrincipalsMock : listPrincipalsReal;
