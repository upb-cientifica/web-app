// Punto de entrada de la SPA: monta la cáscara (topbar/sidebar), registra
// las rutas y arranca el enrutador.

import { $, $$ } from './utils/dom.js';
import { showToast } from './components/toast.js';
import { closeModal, closeAllModals } from './components/modal.js';
import { closeDetailsPanel } from './components/detailsPanel.js';
import { registerRoute, initRouter, navigate, setAuthGuard, setRoleGuard } from './router.js';
import { createPlaceholderView } from './views/placeholderView.js';
import * as filesView from './views/filesView.js';
import * as loginView from './views/loginView.js';
import * as mfaEnrollView from './views/mfaEnrollView.js';
import * as jobsView from './views/jobsView.js';
import * as monitoringView from './views/monitoringView.js';
import * as photosView from './views/photosView.js';
import * as videosView from './views/videosView.js';
import * as syncView from './views/syncView.js';
import * as adminView from './views/adminView.js';
import { initAvatarMenu } from './components/avatarMenu.js';
import { isAuthenticated } from './session.js';
import { appStore } from './state.js';

/* ---------- Botones de cerrar/confirmar de los modales estáticos ---------- */
function initStaticModalButtons() {
  $$('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  const uploadConfirm = $('#upload-confirm-btn');
  if (uploadConfirm) {
    uploadConfirm.addEventListener('click', () => {
      showToast('Demo: archivo cargado', 'success');
      closeModal('modal-upload');
    });
  }
}

/* ---------- Menú "Nuevo" ---------- */
function initNewMenu() {
  const btn = $('#btn-new');
  const menu = $('#new-menu');
  if (!btn || !menu) return;

  const toggleMenu = (force) => {
    const willOpen = force === undefined ? menu.classList.contains('hidden') : force;
    menu.classList.toggle('hidden', !willOpen);
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  $$('.new-menu-item', menu).forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      menu.classList.add('hidden');
      filesView.handleNewAction(action);
    });
  });
}

/* ---------- Sidebar: secciones tipo Drive (Mi unidad, Compartido...) ---------- */
function initDriveSectionNav() {
  $$('.nav-item[data-section]').forEach((item) => {
    item.addEventListener('click', () => {
      const sidebar = $('.sidebar');
      sidebar && sidebar.classList.remove('open');
      filesView.goToSection(item.dataset.section);
    });
  });
}

/* ---------- Sidebar: módulos de nivel superior (rutas) ---------- */
function initModuleNav() {
  $$('.nav-item[data-route]').forEach((item) => {
    item.addEventListener('click', () => {
      const sidebar = $('.sidebar');
      sidebar && sidebar.classList.remove('open');
      navigate(item.dataset.route);
    });
  });
}

/* ---------- Topbar: menú responsive ---------- */
function initResponsiveSidebar() {
  const sidebar = $('.sidebar');
  const menuBtn = $('#btn-menu');
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar && sidebar.classList.toggle('open');
    });
  }
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && e.target !== menuBtn) {
      sidebar.classList.remove('open');
    }
  });
}

/* ---------- Teclado a nivel de aplicación (menús y modales) ---------- */
function initGlobalKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const nm = $('#new-menu');
      nm && nm.classList.add('hidden');
      closeAllModals();
      closeDetailsPanel();
    }
  });
}

/* ---------- Visibilidad de "Administración" en el sidebar según el rol ---------- */
function initAdminNavVisibility() {
  const item = $('.nav-item[data-route="/admin"]');
  if (!item) return;
  const update = (state) => {
    item.classList.toggle('hidden', state.user?.role !== 'admin');
  };
  update(appStore.getState());
  appStore.subscribe(update);
}

/* ---------- Rutas ---------- */
function registerRoutes() {
  registerRoute('/login', loginView.mount, { public: true });
  registerRoute('/mfa-enroll', mfaEnrollView.mount, { public: true });
  registerRoute('/archivos', filesView.mount);
  registerRoute('/fotos', photosView.mount);
  registerRoute('/videos', videosView.mount);
  registerRoute('/sync', syncView.mount);
  registerRoute('/trabajos', jobsView.mount);
  registerRoute('/monitoreo', monitoringView.mount);
  registerRoute('/admin', adminView.mount, { roles: ['admin'] });
  registerRoute('*', createPlaceholderView({
    title: 'No encontrado', icon: 'error_outline',
    description: 'La sección solicitada no existe.',
  }));
}

function init() {
  registerRoutes();
  setAuthGuard(isAuthenticated);
  setRoleGuard((roles) => {
    const user = appStore.getState().user;
    const ok = !roles || (user && roles.includes(user.role));
    if (!ok) showToast('No tienes permisos de administrador', 'error');
    return ok;
  });
  initStaticModalButtons();
  initNewMenu();
  initDriveSectionNav();
  initModuleNav();
  initResponsiveSidebar();
  initGlobalKeyboard();
  initAvatarMenu();
  initAdminNavVisibility();
  initRouter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
