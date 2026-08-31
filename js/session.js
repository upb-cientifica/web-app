// Sesión en memoria: token de acceso + refresco silencioso antes de que
// expire. Nunca se persiste en localStorage/sessionStorage: una recarga
// completa de la página cierra la sesión, como exige el enunciado.

import { appStore } from './state.js';
import { refreshToken as apiRefreshToken, logout as apiLogout } from './api/users.js';
import { setAuthToken } from './api/client.js';

let token = null;
let refreshTimer = null;

function scheduleRefresh(expiresInSeconds) {
  clearTimeout(refreshTimer);
  const ms = Math.max(5000, (expiresInSeconds - 60) * 1000);
  refreshTimer = setTimeout(async () => {
    try {
      const next = await apiRefreshToken();
      token = next.token;
      setAuthToken(token);
      scheduleRefresh(next.expiresInSeconds);
    } catch (err) {
      console.error('No se pudo refrescar la sesión', err);
      clearSession();
    }
  }, ms);
}

export function isAuthenticated() {
  return !!token;
}

export function getToken() {
  return token;
}

export function startSession({ token: t, expiresInSeconds, user }) {
  token = t;
  setAuthToken(t);
  appStore.setState({ user });
  scheduleRefresh(expiresInSeconds);
}

export function clearSession() {
  token = null;
  setAuthToken(null);
  clearTimeout(refreshTimer);
  refreshTimer = null;
  appStore.setState({ user: null });
}

export async function logout() {
  try { await apiLogout(); } catch (err) { console.error(err); }
  clearSession();
}
