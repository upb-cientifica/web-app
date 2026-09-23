// Vista "Archivos" (/archivos, /archivos/<carpeta>, /papelera…): explorador de Drive Upb.
// Migrado del prototipo original app.js, ahora sobre la capa js/api/files.js
// y el enrutador. El estado de esta vista persiste durante toda la sesión
// (no se reinicia al desmontar), igual que el `state` global del prototipo.

import { $, $$, esc } from '../utils/dom.js';
import { formatBytes } from '../utils/format.js';
import { debounce } from '../utils/debounce.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, initModalBackdropDismiss } from '../components/modal.js';
import { createContextMenu } from '../components/contextMenu.js';
import { initDropzone } from '../components/uploadModal.js';
import { openPreview } from '../components/previewModal.js';
import { openShareModal } from '../components/shareModal.js';
import { openDetailsPanel, closeDetailsPanel } from '../components/detailsPanel.js';
import { showConfirm, showPrompt } from '../components/dialogs.js';
import { navigate, rutaDe } from '../router.js';
import { USE_MOCKS } from '../config.js';
import {
  listItems, getQuickAccess, getStorageUsage,
  createFolder, renameItem, toggleStar, deleteItem, uploadFile,
} from '../api/files.js';

const SECTION_TITLES = {
  'my-drive': 'Mi unidad',
  'shared':   'Compartido conmigo',
  'computer': 'Computadora',
  'starred':  'Destacados',
  'trash':    'Papelera',
};

// Cada sección tiene su propia URL; las carpetas de Mi unidad cuelgan de
// /archivos con su ruta del Home (/archivos/Tesis/datos). Así la URL basta para
// volver al mismo lugar: se puede recargar, copiar o usar atrás/adelante.
export const SECTION_PATHS = {
  'my-drive': '/archivos',
  'shared':   '/compartidos',
  'computer': '/computadora',
  'starred':  '/destacados',
  'trash':    '/papelera',
};

const TYPE_META = {
  folder: { icon: 'folder',      cls: 'folder' },
  image:  { icon: 'image',       cls: 'image'  },
  video:  { icon: 'movie',       cls: 'video'  },
  doc:    { icon: 'description', cls: 'doc'    },
  sheet:  { icon: 'table_chart', cls: 'sheet'  },
  slides: { icon: 'slideshow',   cls: 'slides' },
};

// Estado de la vista: persiste durante toda la sesión (módulo = singleton).
const viewState = {
  view: 'list',
  filter: 'all',
  section: 'my-drive',
  search: '',
  selectedId: null,
  currentFolderId: null,
  pathStack: [],
  folders: [],
  files: [],
  quickAccessCache: null,
  storageCache: null,
};

let mountedRoot = null; // referencia al #view-root mientras esta vista está activa
let ctxMenu = null;

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap">
      <button class="icon-btn breadcrumb-back hidden" id="btn-back" title="Volver" aria-label="Volver">
        <span class="material-icons">arrow_back</span>
      </button>
      <h1 class="main-title" id="section-title">Mi unidad</h1>
    </div>
    <div class="breadcrumb hidden" id="breadcrumb"></div>
    <div class="main-controls">
      <div class="quick-filters" id="quick-filters">
        <button class="filter-chip active" data-type="all">Mis archivos</button>
        <button class="filter-chip" data-type="image">Fotos</button>
        <button class="filter-chip" data-type="video">Videos</button>
      </div>
      <div class="view-toggle">
        <button class="icon-btn" id="btn-view-info" title="Ver detalles" aria-label="Ver detalles">
          <span class="material-icons">info_outline</span>
        </button>
        <button class="icon-btn" id="btn-view-list" title="Vista de lista" aria-label="Vista de lista">
          <span class="material-icons">view_headline</span>
        </button>
        <button class="icon-btn" id="btn-view-grid" title="Vista de cuadrícula" aria-label="Vista de cuadrícula">
          <span class="material-icons">view_module</span>
        </button>
      </div>
    </div>
  </div>

  <div class="quick-access" id="quick-access">
    <h2 class="qa-title">Acceso rápido</h2>
    <div class="qa-grid" id="qa-grid"></div>
  </div>

  <section class="block">
    <h2 class="block-title">Carpetas</h2>
    <div class="items-container list-view" id="folders-container"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Archivos</h2>
    <div class="items-container list-view" id="files-container"></div>
  </section>
`;

/* ---------- Utilidades de render ---------- */

const listHeaderHTML = () => viewState.view === 'list' ? `
  <div class="list-header">
    <span></span>
    <span>Nombre</span>
    <span>Propietario</span>
    <span>Modificación</span>
    <span></span>
    <span></span>
  </div>
` : '';

// Botón de acciones (⋮): abre el mismo menú que el clic derecho, que en un
// portátil sin ratón o en una pantalla táctil no hay forma de descubrir.
const moreBtnHTML = (item) => `
  <button type="button" class="icon-btn item-more" data-act="more"
          aria-label="Acciones de ${esc(item.name)}" title="Más acciones">
    <span class="material-icons">more_vert</span>
  </button>`;

const thumbHTML = (item) => {
  const m = TYPE_META[item.type] || TYPE_META.doc;
  return `<span class="material-icons ${m.cls}">${m.icon}</span>`;
};

const emptyStateHTML = (icon, text) => `
  <div class="empty-state">
    <span class="material-icons">${icon}</span>
    <p>${esc(text)}</p>
  </div>
`;

const setViewClass = (container) => {
  container.classList.remove('list-view', 'grid-view');
  container.classList.add(viewState.view === 'grid' ? 'grid-view' : 'list-view');
};

const itemRowHTML = (item, kind) => viewState.view === 'list' ? `
  <div class="item-row" data-id="${item.id}" data-kind="${kind}" data-name="${esc(item.name)}" data-starred="${item.starred}" tabindex="0" role="button" aria-label="${esc(item.name)}">
    <div class="item-thumb">${thumbHTML(item)}</div>
    <div class="item-name">${esc(item.name)}</div>
    <div class="item-meta">${esc(item.meta)}</div>
    <div class="item-date">${esc(item.date)}</div>
    <div class="item-thumb">${item.starred ? '<span class="material-icons star-badge">star</span>' : ''}</div>
    <div class="item-thumb">${moreBtnHTML(item)}</div>
  </div>
` : `
  <div class="grid-card" data-id="${item.id}" data-kind="${kind}" data-name="${esc(item.name)}" data-starred="${item.starred}" tabindex="0" role="button" aria-label="${esc(item.name)}">
    <div class="grid-thumb">${thumbHTML(item)}</div>
    <div class="grid-meta">
      <div class="grid-meta-text">
        <span class="item-name">${esc(item.name)}</span>
        <span class="item-date">${esc(item.date)}</span>
      </div>
      ${moreBtnHTML(item)}
    </div>
  </div>
`;

function findItem(id) {
  return viewState.folders.find((x) => x.id === id) || viewState.files.find((x) => x.id === id);
}

function renderQuickAccess() {
  const grid = $('#qa-grid', mountedRoot);
  const wrap = $('#quick-access', mountedRoot);
  if (!grid || !wrap) return;
  const visible = viewState.section === 'my-drive' && !viewState.currentFolderId;
  wrap.style.display = visible ? '' : 'none';
  if (!visible) return;

  const list = viewState.quickAccessCache || [];
  grid.innerHTML = list.map((q) => `
    <div class="qa-card ${q.color}" data-qa-id="${esc(q.id)}" data-qa="${esc(q.name)}" title="${esc(q.name)}" tabindex="0" role="button" aria-label="${esc(q.name)}">
      <span class="material-icons">${q.icon}</span>
      <span class="qa-name">${esc(q.name)}</span>
    </div>
  `).join('');

  const activateQaCard = (card) => {
    const folderId = card.dataset.qaId;
    const target = viewState.folders.find((f) => f.id === folderId);
    if (target) {
      openFolder(target);
    } else {
      showToast('Acceso rápido: ' + card.dataset.qa);
    }
  };

  $$('.qa-card', grid).forEach((card) => {
    card.addEventListener('click', () => activateQaCard(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateQaCard(card); }
    });
  });
}

function renderFolders() {
  const container = $('#folders-container', mountedRoot);
  if (!container) return;
  setViewClass(container);
  container.innerHTML = listHeaderHTML() + (viewState.folders.length
    ? viewState.folders.map((f) => itemRowHTML(f, 'folder')).join('')
    : emptyStateHTML('folder_open', 'No hay carpetas'));
  bindItems(container);
}

function renderFiles() {
  const container = $('#files-container', mountedRoot);
  if (!container) return;
  setViewClass(container);
  container.innerHTML = listHeaderHTML() + (viewState.files.length
    ? viewState.files.map((f) => itemRowHTML(f, 'file')).join('')
    : emptyStateHTML('insert_drive_file', 'No hay archivos'));
  bindItems(container);
}

function bindItems(container) {
  $$('.item-row, .grid-card', container).forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      $$('.item-row, .grid-card', mountedRoot).forEach((n) => n.classList.remove('selected'));
      el.classList.add('selected');
      viewState.selectedId = el.dataset.id;
      openItem(el);
    });
    el.querySelector('[data-act="more"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewState.selectedId = el.dataset.id;
      $$('.item-row, .grid-card', mountedRoot).forEach((n) => n.classList.remove('selected'));
      el.classList.add('selected');
      // El menú se abre pegado al botón, hacia abajo y a la izquierda.
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu && ctxMenu.show(r.right - 200, r.bottom + 4);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      viewState.selectedId = el.dataset.id;
      $$('.item-row, .grid-card', mountedRoot).forEach((n) => n.classList.remove('selected'));
      el.classList.add('selected');
      ctxMenu && ctxMenu.show(e.clientX, e.clientY);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $$('.item-row, .grid-card', mountedRoot).forEach((n) => n.classList.remove('selected'));
        el.classList.add('selected');
        viewState.selectedId = el.dataset.id;
        openItem(el);
      }
    });
  });
}

function openItem(el) {
  const kind = el.dataset.kind;
  const id = el.dataset.id;
  if (kind === 'folder') {
    const folder = viewState.folders.find((f) => f.id === id) || findItem(id);
    if (folder) openFolder(folder);
    return;
  }
  openPreview(findItem(id), TYPE_META[findItem(id)?.type] || TYPE_META.doc);
}

/* ---------- Carga de datos ---------- */

async function loadAndRenderItems() {
  const { section, currentFolderId, filter, search } = viewState;
  const { folders, files } = await listItems({ section, parentId: currentFolderId, type: filter, search });
  viewState.folders = folders;
  viewState.files = files;
  renderQuickAccess();
  renderFolders();
  renderFiles();
}

/* ---------- Navegación de carpetas + breadcrumb ---------- */

function findFolderById(id) {
  return viewState.folders.find((f) => f.id === id) || null;
}

function buildPathFromCache(folderId) {
  // Con los datos ya cargados en memoria (mock), reconstruimos la ruta.
  // Si la carpeta no está en el listado actual, al menos mostramos su nombre.
  const path = [];
  let cur = folderId;
  let guard = 0;
  while (cur && guard++ < 50) {
    const f = viewState.pathStack.find((p) => p.id === cur) || findFolderById(cur);
    if (!f) break;
    path.unshift(f);
    cur = f.parentId;
  }
  return path;
}

/** URL de una carpeta de Mi unidad (null = la raíz). */
function rutaCarpeta(folderId) {
  return rutaDe(SECTION_PATHS['my-drive'], folderId || '');
}

/**
 * Migas de una carpeta. En modo real el id es la ruta del Home, así que las
 * migas salen de ella sin preguntar a nadie; con mocks se reconstruyen con lo
 * que ya está cargado.
 */
function pilaDe(folderId) {
  if (folderId.startsWith('/')) {
    const partes = folderId.split('/').filter(Boolean);
    return partes.map((nombre, i) => ({ id: '/' + partes.slice(0, i + 1).join('/'), name: nombre }));
  }
  const i = viewState.pathStack.findIndex((f) => f.id === folderId);
  if (i >= 0) return viewState.pathStack.slice(0, i + 1);
  const f = findFolderById(folderId);
  return f ? [...buildPathFromCache(f.parentId), f] : [{ id: folderId, name: folderId }];
}

/** Traduce la URL al estado de la vista. params: { seccion, resto }. */
function aplicarRuta({ seccion = 'my-drive', resto = '' } = {}) {
  viewState.section = seccion;
  viewState.selectedId = null;
  const folderId = seccion === 'my-drive' && resto ? (USE_MOCKS ? resto : '/' + resto) : null;
  viewState.currentFolderId = folderId;
  viewState.pathStack = folderId ? pilaDe(folderId) : [];
}

/** El router avisa aquí cuando cambia la URL sin salir de esta vista. */
export async function update(params) {
  aplicarRuta(params);
  if (!mountedRoot) return;
  updateSectionNavUI(viewState.section);
  updateBreadcrumb();
  await loadAndRenderItems();
}

function openFolder(folder) {
  if (folder) navigate(rutaCarpeta(folder.id));
}

function goToFolder(folderId) {
  navigate(folderId ? rutaCarpeta(folderId) : SECTION_PATHS['my-drive']);
}

function goUpOneLevel() {
  const padre = viewState.pathStack[viewState.pathStack.length - 2];
  goToFolder(padre ? padre.id : null);
}

function updateBreadcrumb() {
  const crumb = $('#breadcrumb', mountedRoot);
  const title = $('#section-title', mountedRoot);
  const backBtn = $('#btn-back', mountedRoot);
  const inFolder = !!viewState.currentFolderId;

  if (backBtn) backBtn.classList.toggle('hidden', !inFolder);
  if (crumb) crumb.classList.toggle('hidden', !inFolder);

  if (title) {
    title.textContent = inFolder
      ? (viewState.pathStack[viewState.pathStack.length - 1] || {}).name
      : (SECTION_TITLES[viewState.section] || 'Mi unidad');
  }

  if (!crumb) return;

  const crumbs = [{ id: null, name: SECTION_TITLES['my-drive'] }];
  viewState.pathStack.forEach((f) => crumbs.push({ id: f.id, name: f.name }));

  crumb.innerHTML = crumbs.map((c, i) => {
    const isCurrent = i === crumbs.length - 1 && !!c.id;
    const cls = 'crumb' + (isCurrent ? ' current' : '');
    const sep = i > 0 ? '<span class="material-icons crumb-sep" aria-hidden="true">chevron_right</span>' : '';
    return `${sep}<button type="button" class="${cls}" data-folder="${c.id || ''}" ${isCurrent ? 'aria-current="page"' : ''}>${esc(c.name)}</button>`;
  }).join('');

  $$('.crumb', crumb).forEach((el) => {
    el.addEventListener('click', () => {
      if (el.classList.contains('current')) return;
      goToFolder(el.dataset.folder || null);
    });
  });
}

/* ---------- Controles: chips, vista, búsqueda ---------- */

function initControls() {
  $$('#quick-filters .filter-chip', mountedRoot).forEach((chip) => {
    chip.addEventListener('click', async () => {
      $$('#quick-filters .filter-chip', mountedRoot).forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      viewState.filter = chip.dataset.type;
      await loadAndRenderItems();
    });
  });

  const setActiveView = (active) => {
    ['#btn-view-list', '#btn-view-grid'].forEach((sel) => {
      const b = $(sel, mountedRoot); if (b) b.classList.remove('active');
    });
    active.classList.add('active');
  };

  const viewList = $('#btn-view-list', mountedRoot);
  const viewGrid = $('#btn-view-grid', mountedRoot);
  if (viewList) {
    viewList.classList.add('active');
    viewList.addEventListener('click', () => {
      viewState.view = 'list'; setActiveView(viewList);
      renderFolders(); renderFiles();
    });
  }
  if (viewGrid) {
    viewGrid.addEventListener('click', () => {
      viewState.view = 'grid'; setActiveView(viewGrid);
      renderFolders(); renderFiles();
    });
  }
  if (viewState.view === 'grid' && viewGrid) setActiveView(viewGrid);

  const viewInfo = $('#btn-view-info', mountedRoot);
  if (viewInfo) {
    viewInfo.addEventListener('click', () => {
      if (!viewState.selectedId) { showToast('Selecciona un elemento', 'error'); return; }
      const item = findItem(viewState.selectedId);
      if (item) openDetailsPanel(item);
    });
  }

  const backBtn = $('#btn-back', mountedRoot);
  if (backBtn) backBtn.addEventListener('click', goUpOneLevel);
}

function initSearch() {
  const input = $('#search-input');
  if (!input) return;
  const onInput = debounce(async () => {
    viewState.search = input.value.trim().toLowerCase();
    await loadAndRenderItems();
  }, 150);
  input.addEventListener('input', onInput);
  return () => input.removeEventListener('input', onInput);
}

/* ---------- Menú contextual ---------- */

async function handleContextAction(act, item) {
  if (!item) { showToast('Nada seleccionado', 'error'); return; }
  const isFolder = viewState.folders.some((f) => f.id === item.id);

  switch (act) {
    case 'open':
      if (isFolder) {
        const folder = viewState.folders.find((f) => f.id === item.id);
        if (folder) await openFolder(folder);
      } else {
        openPreview(item, TYPE_META[item.type] || TYPE_META.doc);
      }
      break;
    case 'download':
      showToast('Descargando: ' + item.name, 'success');
      break;
    case 'share':
      openShareModal(item);
      break;
    case 'details':
      openDetailsPanel(item);
      break;
    case 'rename': {
      const newName = await showPrompt('Nuevo nombre:', item.name);
      if (newName && newName.trim()) {
        await renameItem({ id: item.id, name: newName.trim() });
        await loadAndRenderItems();
        showToast('Renombrado', 'success');
      }
      break;
    }
    case 'star':
      await toggleStar({ id: item.id });
      await loadAndRenderItems();
      showToast(!item.starred ? 'Destacado' : 'Quitado de destacados');
      break;
    case 'move':
      showToast('Mover a... (demo)');
      break;
    case 'delete': {
      const confirmed = await showConfirm(`¿Eliminar "${item.name}"?`, { confirmLabel: 'Eliminar', danger: true });
      if (confirmed) {
        await deleteItem({ id: item.id });
        viewState.selectedId = null;
        await loadAndRenderItems();
        showToast('Eliminado', 'success');
      }
      break;
    }
  }
}

/* ---------- Modal de subida ---------- */

// El diálogo de subida vive en index.html y el botón "Nuevo" está en la barra
// lateral, visible desde cualquier sección. Por eso se conecta UNA vez para
// toda la aplicación, y no al montar esta vista: antes, abrirlo desde Fotos o
// Videos no hacía nada, porque el manejador sólo existía dentro de Mi unidad.
let dropzoneListo = false;
export function initUploadDropzone() {
  const dz = $('#dropzone');
  if (!dz || dropzoneListo) return;
  initDropzone(dz, { onFilesSelected: subirArchivos });
  dropzoneListo = true;
}

/** Tras una subida: refresca lo que se ve, o lleva a Mi unidad si se subió desde otra sección. */
async function trasSubir() {
  viewState.storageCache = await getStorageUsage().catch(() => viewState.storageCache);
  renderStorageBar();
  if (mountedRoot) await loadAndRenderItems();
  else navigate(rutaCarpeta(viewState.currentFolderId));
}

/** Une una carpeta del Home con un nombre: "/" + "a" = "/a", "/x" + "a" = "/x/a". */
function unirRuta(base, nombre) {
  return `${!base || base === '/' ? '' : base}/${nombre}`;
}

/**
 * Sube archivos a la carpeta abierta, uno detrás de otro. En serie y no en
 * paralelo: con un solo núcleo en el servidor, varias subidas a la vez sólo se
 * estorban, y así cada error —cuota llena, nombre repetido— se reporta sobre
 * el archivo que lo causó.
 */
async function subirArchivos(archivos, { destino = viewState.currentFolderId || '/' } = {}) {
  closeModal('modal-upload');
  const input = $('#dropzone input[type="file"]');
  if (input) input.value = '';   // para poder volver a elegir el mismo archivo

  let subidos = 0;
  for (const archivo of archivos) {
    const carpeta = archivo.destino || destino;
    showToast(`Subiendo ${archivo.name}…`);
    try {
      await uploadFile({ file: archivo, parentId: carpeta });
      subidos += 1;
    } catch (err) {
      showToast(`${archivo.name}: ${err.message || 'no se pudo subir'}`, 'error');
    }
  }
  if (subidos) {
    showToast(subidos === 1 ? 'Archivo subido' : `${subidos} archivos subidos`, 'success');
    await trasSubir();
  }
}

/**
 * Sube una carpeta completa respetando su estructura. El navegador entrega los
 * archivos con su ruta relativa ("proyecto/datos/a.csv"); las carpetas se crean
 * primero, de la más externa a la más interna, porque el servidor exige que el
 * padre exista.
 */
function subirCarpeta() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.addEventListener('change', async () => {
    const archivos = Array.from(input.files || []);
    if (!archivos.length) return;
    const base = viewState.currentFolderId || '/';
    const creadas = new Set();
    for (const archivo of archivos) {
      const partes = (archivo.webkitRelativePath || archivo.name).split('/').slice(0, -1);
      let actual = base;
      for (const parte of partes) {
        const siguiente = unirRuta(actual, parte);
        if (!creadas.has(siguiente)) {
          try {
            await createFolder({ name: parte, parentId: actual });
          } catch (err) {
            // Si ya existía, se sigue: lo que importa es que esté.
            if (!/existe/i.test(err.message || '')) throw err;
          }
          creadas.add(siguiente);
        }
        actual = siguiente;
      }
      archivo.destino = actual;
    }
    await subirArchivos(archivos);
  });
  input.click();
}

/* ---------- Menú "Nuevo" (invocado desde main.js) ---------- */

export async function handleNewAction(action) {
  switch (action) {
    case 'upload-folder':
      openModal('modal-upload');
      break;
    case 'upload-folder-carp':
      subirCarpeta();
      break;
    case 'create-folder': {
      const name = await showPrompt('Nombre de la nueva carpeta:', 'Carpeta sin título');
      if (name && name.trim()) {
        await createFolder({ name: name.trim(), parentId: viewState.currentFolderId });
        if (mountedRoot) await loadAndRenderItems();
        else navigate(rutaCarpeta(viewState.currentFolderId));
        showToast('Carpeta creada', 'success');
      }
      break;
    }
    default:
      showToast('Demo: ' + action);
  }
}

/* ---------- Navegación de secciones del sidebar (invocado desde main.js) ---------- */

export function goToSection(section) {
  navigate(SECTION_PATHS[section] || SECTION_PATHS['my-drive']);
}

function updateSectionNavUI(section) {
  $$('.nav-item[data-section]').forEach((n) => n.classList.toggle('active', n.dataset.section === section));
}

/* ---------- Teclado (activo mientras la vista está montada) ---------- */

function initKeyboard() {
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      ctxMenu && ctxMenu.hide();
    }
    if (e.key === 'Backspace' && viewState.currentFolderId) {
      const active = document.activeElement;
      const tag = active && active.tagName;
      const editable = active && (active.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA');
      if (!editable) {
        e.preventDefault();
        goUpOneLevel();
      }
    }
  };
  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
}

/* ---------- Ciclo de vida de la vista (llamado por el router) ---------- */

export async function mount(root, params) {
  aplicarRuta(params);
  root.innerHTML = TEMPLATE;
  mountedRoot = root;

  updateSectionNavUI(viewState.section);
  initModalBackdropDismiss();
  initControls();
  ctxMenu = createContextMenu('context-menu', (act) => {
    const item = viewState.selectedId ? findItem(viewState.selectedId) : null;
    handleContextAction(act, item);
  });
  const unbindSearch = initSearch();
  const unbindKeyboard = initKeyboard();

  if (!viewState.quickAccessCache) viewState.quickAccessCache = await getQuickAccess();
  if (!viewState.storageCache) viewState.storageCache = await getStorageUsage();
  renderStorageBar();

  updateBreadcrumb();
  await loadAndRenderItems();

  return function unmount() {
    if (ctxMenu) ctxMenu.destroy();
    if (unbindSearch) unbindSearch();
    if (unbindKeyboard) unbindKeyboard();
    closeDetailsPanel();
    closeModal('modal-share');
    // Fuera de Drive ninguna de sus secciones queda marcada en el menú.
    $$('.nav-item[data-section]').forEach((n) => n.classList.remove('active'));
    mountedRoot = null;
    ctxMenu = null;
  };
}

function renderStorageBar() {
  const bar = $('.storage-bar');
  const text = $('.storage-text');
  if (!bar || !viewState.storageCache) return;
  const { used, total, usedBytes, totalBytes } = viewState.storageCache;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  bar.style.width = pct.toFixed(2) + '%';
  // La etiqueta sale de los bytes y no de los GB redondeados: un Home de
  // 150 B decía "0 GB de 0.01 TB", que no informa de nada. formatBytes elige
  // la unidad que corresponda a cada lado.
  if (text) {
    text.textContent = usedBytes === undefined
      ? `${used} GB de ${total} GB`
      : `${formatBytes(usedBytes)} de ${formatBytes(totalBytes)}`;
  }
}
