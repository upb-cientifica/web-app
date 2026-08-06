// Enrutador por hash. Cada ruta registra una función mount(root) que es
// responsable de sus propios estados de carga/error/vacío y que puede
// devolver una función de limpieza (unmount), llamada antes de montar
// la siguiente vista.
//
// Las rutas protegidas (por defecto) exigen sesión válida: si no la hay,
// se recuerda el destino y se redirige a /login. Las rutas públicas
// (login, enrolamiento MFA) además ocultan el chrome de la app
// (topbar + sidebar) vía la clase body.auth-mode. Las rutas con `roles`
// además exigen que el usuario tenga uno de esos roles (p. ej. /admin).

import { $, $$ } from './utils/dom.js';

const routes = new Map();
let cleanup = null;
let authGuard = null; // () => boolean
let roleGuard = null; // (roles: string[]) => boolean
let pendingPath = null;

export function setAuthGuard(fn) {
  authGuard = fn;
}

export function setRoleGuard(fn) {
  roleGuard = fn;
}

export function registerRoute(path, mountFn, { public: isPublic = false, roles = null } = {}) {
  routes.set(path, { mount: mountFn, public: isPublic, roles });
}

export function navigate(path) {
  if (location.hash.slice(1) === path) return;
  location.hash = path;
}

export function setPendingPath(path) {
  pendingPath = path;
}

export function consumePendingPath() {
  const p = pendingPath;
  pendingPath = null;
  return p;
}

function currentPath() {
  return location.hash.slice(1) || '/archivos';
}

function updateActiveRouteNav(path) {
  $$('[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === path);
  });
}

async function render() {
  const root = $('#view-root');
  if (!root) return;

  const path = currentPath();
  const entry = routes.get(path) || routes.get('*');

  if (entry && !entry.public && authGuard && !authGuard()) {
    setPendingPath(path);
    navigate('/login');
    return;
  }

  if (entry && entry.roles && roleGuard && !roleGuard(entry.roles)) {
    navigate('/archivos');
    return;
  }

  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error('Error al desmontar la vista anterior', err); }
  }
  cleanup = null;

  document.body.classList.toggle('auth-mode', !!(entry && entry.public));
  updateActiveRouteNav(path);
  root.innerHTML = '';

  if (!entry) return;
  const result = await entry.mount(root);
  cleanup = typeof result === 'function' ? result : null;
}

export function initRouter() {
  window.addEventListener('hashchange', render);
  render();
}

export function getCurrentPath() {
  return currentPath();
}
