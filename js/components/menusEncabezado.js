// Los tres botones del encabezado: Ayuda, Ajustes y Aplicaciones.
//
// Estaban de adorno. Ajustes lleva ahora el tema; Aplicaciones, un acceso
// directo a cada sección; y Ayuda explica qué hace cada una.

import { $, $$, esc } from '../utils/dom.js';
import { openModal } from './modal.js';
import { navigate } from '../router.js';
import { TEMAS, temaActual, aplicarTema } from '../tema.js';

const SECCIONES = [
  { ruta: '/archivos',       nombre: 'Mi unidad',      icono: 'folder' },
  { ruta: '/fotos',          nombre: 'Fotos',          icono: 'photo_library' },
  { ruta: '/videos',         nombre: 'Videos',         icono: 'movie' },
  { ruta: '/sincronizacion', nombre: 'Sincronización', icono: 'sync' },
  { ruta: '/trabajos',       nombre: 'Trabajos MPI',   icono: 'terminal' },
  { ruta: '/monitoreo',      nombre: 'Monitoreo',      icono: 'monitor_heart' },
];

/** Abre un menú bajo su botón y lo cierra al hacer clic fuera o con Escape. */
function comoMenu(boton, menu, pintar) {
  const cerrar = () => {
    menu.classList.add('hidden');
    boton.setAttribute('aria-expanded', 'false');
  };
  boton.setAttribute('aria-haspopup', 'true');
  boton.setAttribute('aria-expanded', 'false');
  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.classList.contains('hidden');
    $$('.header-menu').forEach((m) => m.classList.add('hidden'));
    if (!abrir) return;
    pintar();
    menu.classList.remove('hidden');
    boton.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== boton) cerrar();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  return cerrar;
}

function initAjustes() {
  const boton = $('#btn-ajustes');
  const menu = $('#menu-ajustes');
  if (!boton || !menu) return;

  const pintar = () => {
    const actual = temaActual();
    menu.innerHTML = `
      <p class="header-menu-title">Tema</p>
      ${TEMAS.map((t) => `
        <button type="button" class="header-menu-item ${t.valor === actual ? 'active' : ''}"
                data-tema="${t.valor}" role="menuitemradio" aria-checked="${t.valor === actual}">
          <span class="material-icons">${t.icono}</span>
          <span>${esc(t.nombre)}</span>
          ${t.valor === actual ? '<span class="material-icons header-menu-check">check</span>' : ''}
        </button>`).join('')}
    `;
    $$('[data-tema]', menu).forEach((b) => b.addEventListener('click', () => {
      aplicarTema(b.dataset.tema);
      pintar();
    }));
  };
  comoMenu(boton, menu, pintar);
}

function initAplicaciones() {
  const boton = $('#btn-aplicaciones');
  const menu = $('#menu-aplicaciones');
  if (!boton || !menu) return;

  let cerrar = () => {};
  const pintar = () => {
    menu.innerHTML = `<div class="apps-grid">${SECCIONES.map((s) => `
      <button type="button" class="apps-item" data-ruta="${s.ruta}">
        <span class="material-icons">${s.icono}</span>
        <span>${esc(s.nombre)}</span>
      </button>`).join('')}</div>`;
    $$('[data-ruta]', menu).forEach((b) => b.addEventListener('click', () => {
      cerrar();
      navigate(b.dataset.ruta);
    }));
  };
  cerrar = comoMenu(boton, menu, pintar);
}

function initAyuda() {
  $('#btn-ayuda')?.addEventListener('click', () => openModal('modal-ayuda'));
}

export function initMenusEncabezado() {
  initAjustes();
  initAplicaciones();
  initAyuda();
}
