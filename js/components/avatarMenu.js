import { $, esc } from '../utils/dom.js';
import { formatBytes } from '../utils/format.js';
import { getCurrentUser } from '../api/users.js';
import { getStorageUsage } from '../api/files.js';
import { appStore } from '../state.js';
import { logout } from '../session.js';
import { navigate } from '../router.js';

/** Iniciales a partir del nombre; si no hay, del correo. */
function iniciales(user) {
  const base = (user?.name || user?.email || '').trim();
  if (!base) return '·';
  const partes = base.split(/[\s._@]+/).filter(Boolean);
  const dos = partes.length >= 2 ? partes[0][0] + partes[1][0] : base.slice(0, 2);
  return dos.toUpperCase();
}

export function initAvatarMenu() {
  const avatar = $('#avatar-btn');
  const menu = $('#avatar-menu');
  if (!avatar || !menu) return;

  // El avatar arrancaba con unas iniciales escritas en el HTML y no cambiaba
  // nunca: con sesión real seguía mostrando las del usuario de ejemplo. Se
  // sigue el usuario de la sesión, que es quien las decide.
  const pintarIniciales = (user) => {
    avatar.textContent = user ? iniciales(user) : '·';
    avatar.title = user ? `${user.name} · ${user.email}` : 'Cuenta';
  };
  pintarIniciales(appStore.getState().user);
  appStore.subscribe((estado) => pintarIniciales(estado.user));

  const close = () => menu.classList.add('hidden');
  const open = async () => {
    menu.classList.remove('hidden');
    menu.innerHTML = '<p class="avatar-menu-loading">Cargando…</p>';
    try {
      // El uso real lo lleva el Home compartido, que es quien guarda los
      // archivos; el contador del directorio no se actualiza al subir y
      // mostraría 0 siempre.
      const [user, uso] = await Promise.all([
        getCurrentUser(),
        getStorageUsage().catch(() => null),
      ]);
      pintarIniciales(user);
      const usedBytes = uso?.usedBytes ?? user.quotaUsedGB * 1024 ** 3;
      const totalBytes = uso?.totalBytes ?? user.quotaTotalGB * 1024 ** 3;
      menu.innerHTML = `
        <div class="avatar-menu-profile">
          <div class="avatar-menu-name">${esc(user.name)}</div>
          <div class="avatar-menu-email">${esc(user.email)}</div>
          <div class="avatar-menu-quota">${formatBytes(usedBytes)} de ${formatBytes(totalBytes)} usados</div>
        </div>
        <hr>
        <button class="ctx-item" id="avatar-logout">
          <span class="material-icons">logout</span> Cerrar sesión
        </button>
      `;
      $('#avatar-logout', menu).addEventListener('click', async () => {
        close();
        await logout();
        navigate('/login');
      });
    } catch (err) {
      menu.innerHTML = `<p class="avatar-menu-loading">No se pudo cargar el perfil</p>`;
    }
  };

  avatar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) open(); else close();
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== avatar) close();
  });
}
