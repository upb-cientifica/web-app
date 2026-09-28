// Enrutador con rutas reales (History API): /archivos/Tesis/datos, /fotos…
// en vez de /#/archivos. Para que una URL copiada o recargada funcione, el
// servidor debe responder index.html en cualquier ruta que no sea un archivo
// (nginx: try_files $uri $uri/ /index.html; en local lo hace server.js).
//
// Cada ruta registra mount(root, params), que se encarga de sus propios
// estados de carga/error/vacío y puede devolver una función de limpieza.
// Un patrón puede llevar parámetros (`/videos/:id`) o terminar en `/*`, que
// captura el resto de la ruta en params.resto. Si la nueva URL cae en la
// misma vista y ésta registró `update(params)`, no se vuelve a montar: solo
// se le avisa (así navegar entre carpetas no redibuja toda la pantalla).
//
// Las rutas protegidas (por defecto) exigen sesión: sin ella se recuerda el
// destino y se va a /login. Las públicas ocultan el chrome de la app
// (body.auth-mode). Las que declaran `roles` exigen uno de esos roles.

import { $, $$ } from './utils/dom.js';

const RUTA_INICIAL = '/archivos';

const routes = [];        // { patron, regex, claves, mount, update, public, roles }
let actual = null;        // entrada montada
let cleanup = null;
let authGuard = null;     // () => boolean
let roleGuard = null;     // (roles: string[]) => boolean
let pendingPath = null;

export function setAuthGuard(fn) {
  authGuard = fn;
}

export function setRoleGuard(fn) {
  roleGuard = fn;
}

function compilar(patron) {
  const claves = [];
  if (patron === '*') return { regex: /^.*$/, claves };
  let fuente = patron
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, k) => { claves.push(k); return '([^/]+)'; });
  if (fuente.endsWith('/*')) {
    fuente = fuente.slice(0, -2) + '(?:/(.*))?';
    claves.push('resto');
  }
  return { regex: new RegExp(`^${fuente}/?$`), claves };
}

/**
 * registerRoute('/fotos', mount)
 * registerRoute('/archivos/*', mount, { update })   // params.resto = "Tesis/datos"
 * registerRoute('/papelera', mount, { update, datos: { seccion: 'trash' } })  // datos fijos en params
 */
export function registerRoute(patron, mountFn, { public: isPublic = false, roles = null, update = null, datos = {} } = {}) {
  routes.push({ patron, ...compilar(patron), mount: mountFn, update, public: isPublic, roles, datos });
}

function resolver(path) {
  // '*' va siempre al final, sin importar el orden de registro.
  const orden = [...routes.filter((r) => r.patron !== '*'), ...routes.filter((r) => r.patron === '*')];
  for (const r of orden) {
    const m = r.regex.exec(path);
    if (!m) continue;
    const params = { ...r.datos };
    r.claves.forEach((k, i) => {
      const v = m[i + 1];
      params[k] = v === undefined ? '' : v.split('/').map(decodeURIComponent).join('/');
    });
    return { entry: r, params };
  }
  return { entry: null, params: {} };
}

export function navigate(path, { replace = false } = {}) {
  if (path === currentPath() + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  render();
}

/** Arma una ruta escapando cada segmento: rutaDe('/archivos', 'Mis datos/2026'). */
export function rutaDe(base, resto = '') {
  const partes = String(resto).split('/').filter(Boolean).map(encodeURIComponent);
  return partes.length ? `${base}/${partes.join('/')}` : base;
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
  return location.pathname.replace(/\/+$/, '') || '/';
}

function updateActiveRouteNav(path) {
  const primero = '/' + (path.split('/')[1] || '');
  $$('[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === primero);
  });
}

async function render() {
  const root = $('#view-root');
  if (!root) return;

  const path = currentPath();
  if (path === '/') { navigate(RUTA_INICIAL, { replace: true }); return; }

  const { entry, params } = resolver(path);

  if (entry && !entry.public && authGuard && !authGuard()) {
    setPendingPath(path + location.search);
    navigate('/login', { replace: true });
    return;
  }

  if (entry && entry.roles && roleGuard && !roleGuard(entry.roles)) {
    navigate(RUTA_INICIAL, { replace: true });
    return;
  }

  updateActiveRouteNav(path);

  // Misma pantalla, otros parámetros: se actualiza sin desmontar.
  if (entry && actual && entry.mount === actual.mount && entry.update) {
    actual = entry;
    await entry.update(params);
    return;
  }

  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error('Error al desmontar la vista anterior', err); }
  }
  cleanup = null;
  actual = entry;

  document.body.classList.toggle('auth-mode', !!(entry && entry.public));
  root.innerHTML = '';

  if (!entry) return;
  const result = await entry.mount(root, params);
  cleanup = typeof result === 'function' ? result : null;
}

/** Los <a href="/..."> internos navegan sin recargar la página. */
function interceptarEnlaces(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/')) return;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return;   // archivos estáticos: que los abra el navegador
  e.preventDefault();
  navigate(url.pathname + url.search);
}

export function initRouter() {
  // Enlaces viejos con #/ruta: se pasan a la ruta real sin dejar rastro.
  if (location.hash.startsWith('#/')) {
    history.replaceState(null, '', location.hash.slice(1));
  }
  window.addEventListener('popstate', render);
  document.addEventListener('click', interceptarEnlaces);
  render();
}

export function getCurrentPath() {
  return currentPath();
}
