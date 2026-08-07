import { $, esc } from '../utils/dom.js';
import { formatBytes } from '../utils/format.js';
import { getCurrentUser } from '../api/users.js';
import { logout } from '../session.js';
import { navigate } from '../router.js';

export function initAvatarMenu() {
  const avatar = $('#avatar-btn');
  const menu = $('#avatar-menu');
  if (!avatar || !menu) return;

  const close = () => menu.classList.add('hidden');
  const open = async () => {
    menu.classList.remove('hidden');
    menu.innerHTML = '<p class="avatar-menu-loading">Cargando…</p>';
    try {
      const user = await getCurrentUser();
      const usedBytes = user.quotaUsedGB * 1024 ** 3;
      const totalBytes = user.quotaTotalGB * 1024 ** 3;
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
