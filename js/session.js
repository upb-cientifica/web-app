// Sesión: el token de acceso vive en memoria y se refresca en silencio antes
// de expirar. Lo único que se guarda entre recargas es el token de refresco
// (js/api/users.js), que dura 7 días y el servidor rota en cada uso: al
// arrancar, la aplicación lo canjea por un token de acceso nuevo. Cerrar
// sesión lo borra.

import { appStore } from './state.js';
import {
  refreshToken as apiRefreshToken, logout as apiLogout,
  haySesionGuardada, olvidarSesionGuardada, getCurrentUser,
} from './api/users.js';
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

/**
 * Reanuda la sesión guardada, si la hay. Se llama antes de arrancar el
 * enrutador: si devuelve false, el guardia de rutas lleva a /login.
 */
export async function restoreSession() {
  if (!haySesionGuardada()) return false;
  try {
    const { token: t, expiresInSeconds } = await apiRefreshToken();
    token = t;
    setAuthToken(t);
    appStore.setState({ user: await getCurrentUser() });
    scheduleRefresh(expiresInSeconds);
    return true;
  } catch (err) {
    // Refresco vencido, revocado o servicio caído: se empieza de cero.
    console.warn('No se pudo reanudar la sesión:', err.message);
    clearSession();
    return false;
  }
}

export function clearSession() {
  token = null;
  setAuthToken(null);
  olvidarSesionGuardada();
  clearTimeout(refreshTimer);
  refreshTimer = null;
  appStore.setState({ user: null });
}

export async function logout() {
  try { await apiLogout(); } catch (err) { console.error(err); }
  clearSession();
}
