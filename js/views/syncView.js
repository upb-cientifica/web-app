import { $, $$, esc } from '../utils/dom.js';
import { formatDateTime } from '../utils/format.js';
import { showToast } from '../components/toast.js';
import {
  listDevices, listVersionableFiles, listVersions, restoreVersion,
  listConflicts, resolveConflict, listActivity,
} from '../api/sync.js';

let root = null;

const DEVICE_STATUS_LABELS = { synced: 'Sincronizado', pending: 'Pendiente', offline: 'Sin conexión' };
const PLATFORM_ICONS = { Windows: 'desktop_windows', Linux: 'terminal', macOS: 'laptop_mac', iOS: 'phone_iphone', Android: 'phone_android' };
const ACTIVITY_STATUS_ICON = { ok: 'check_circle', conflicto: 'warning', error: 'error' };

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Sincronización de dispositivos</h1></div>
  </div>

  <section class="block">
    <h2 class="block-title">Dispositivos vinculados</h2>
    <div id="devices-wrap"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Historial de versiones</h2>
    <label class="share-field field-narrow">
      <span>Archivo</span>
      <select class="share-select" id="version-file-select"><option value="">Selecciona un archivo…</option></select>
    </label>
    <div id="versions-wrap"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Bandeja de conflictos</h2>
    <div id="conflicts-wrap"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Registro de actividad</h2>
    <div id="activity-wrap"></div>
  </section>
`;

function deviceStatusClass(status) {
  if (status === 'synced') return 'job-status-completed';
  if (status === 'pending') return 'job-status-running';
  return 'job-status-cancelled';
}

async function refreshDevices() {
  const wrap = $('#devices-wrap', root);
  try {
    const list = await listDevices();
    if (!list.length) { wrap.innerHTML = `<div class="empty-state"><span class="material-icons">devices</span><p>No hay dispositivos vinculados</p></div>`; return; }
    wrap.innerHTML = `
      <div class="table-scroll">
        <table class="jobs-table">
          <thead><tr><th>Dispositivo</th><th>Plataforma</th><th>Última sincronización</th><th>Estado</th></tr></thead>
          <tbody>
            ${list.map((d) => `
              <tr>
                <td><span class="material-icons device-platform-icon">${PLATFORM_ICONS[d.platform] || 'devices'}</span> ${esc(d.name)}</td>
                <td>${esc(d.platform)}</td>
                <td>${esc(formatDateTime(d.lastSyncAt))}</td>
                <td><span class="job-status ${deviceStatusClass(d.status)}">${esc(DEVICE_STATUS_LABELS[d.status] || d.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudieron cargar los dispositivos.</p>`;
  }
}

function diffRow(label, oldVal, newVal) {
  const changed = oldVal !== newVal;
  return `<span class="version-diff-field ${changed ? 'version-diff-changed' : ''}">${label}: ${esc(oldVal)}${changed ? ' → ' + esc(newVal) : ''}</span>`;
}

async function renderVersions(fileId) {
  const wrap = $('#versions-wrap', root);
  if (!fileId) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<p class="details-loading">Cargando versiones…</p>';
  try {
    const versions = await listVersions({ fileId });
    const current = versions.find((v) => v.label === 'Actual') || versions[0];
    wrap.innerHTML = `
      <ul class="version-list">
        ${versions.map((v) => `
          <li class="version-item ${v.label === 'Actual' ? 'version-current' : ''}">
            <div class="version-item-head">
              <span class="version-label">${esc(v.label)}</span>
              ${v.label !== 'Actual' ? `<button class="btn-text version-restore-btn" data-version-id="${esc(v.id)}">Restaurar esta versión</button>` : ''}
            </div>
            <div class="version-diff">
              ${diffRow('Tamaño', v.sizeMeta, current.sizeMeta)}
              ${diffRow('Fecha', v.date, current.date)}
              ${diffRow('Modificado por', v.modifiedByName, current.modifiedByName)}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    $$('.version-restore-btn', wrap).forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await restoreVersion({ fileId, versionId: btn.dataset.versionId });
          showToast('Versión restaurada', 'success');
          await renderVersions(fileId);
          await refreshActivity();
        } catch (err) {
          showToast(err.message || 'No se pudo restaurar', 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudieron cargar las versiones.</p>`;
  }
}

async function initVersionSelect() {
  const select = $('#version-file-select', root);
  try {
    const files = await listVersionableFiles();
    files.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      select.appendChild(opt);
    });
  } catch (err) {
    showToast('No se pudo cargar la lista de archivos con historial', 'error');
  }
  select.addEventListener('change', () => renderVersions(select.value));
}

async function refreshConflicts() {
  const wrap = $('#conflicts-wrap', root);
  try {
    const list = await listConflicts();
    if (!list.length) { wrap.innerHTML = `<div class="empty-state"><span class="material-icons">check_circle</span><p>No hay conflictos pendientes</p></div>`; return; }
    wrap.innerHTML = list.map((c) => `
      <div class="conflict-card" data-id="${esc(c.id)}">
        <div class="conflict-title">${esc(c.fileName)}</div>
        <div class="conflict-versions">
          <div class="conflict-version">
            <h4>Versión local</h4>
            <p>${esc(c.local.sizeMeta)} · ${esc(c.local.date)}</p>
            <button class="btn-primary conflict-btn" data-resolution="local">Conservar esta</button>
          </div>
          <div class="conflict-version">
            <h4>Versión del servidor</h4>
            <p>${esc(c.server.sizeMeta)} · ${esc(c.server.date)}</p>
            <button class="btn-primary conflict-btn" data-resolution="server">Conservar esta</button>
          </div>
        </div>
      </div>
    `).join('');

    $$('.conflict-btn', wrap).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.conflict-card');
        btn.closest('.conflict-versions').querySelectorAll('button').forEach((b) => b.disabled = true);
        try {
          await resolveConflict({ conflictId: card.dataset.id, resolution: btn.dataset.resolution });
          showToast('Conflicto resuelto', 'success');
          await refreshConflicts();
          await refreshActivity();
        } catch (err) {
          showToast(err.message || 'No se pudo resolver el conflicto', 'error');
        }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudieron cargar los conflictos.</p>`;
  }
}

async function refreshActivity() {
  const wrap = $('#activity-wrap', root);
  try {
    const list = await listActivity();
    if (!list.length) { wrap.innerHTML = `<div class="empty-state"><span class="material-icons">history</span><p>Sin actividad reciente</p></div>`; return; }
    wrap.innerHTML = `
      <ul class="activity-list">
        ${list.map((a) => `
          <li class="activity-item">
            <span class="material-icons activity-icon-${a.status}">${ACTIVITY_STATUS_ICON[a.status] || 'info'}</span>
            <span class="activity-text"><strong>${esc(a.action)}</strong> · ${esc(a.fileName)}</span>
            <span class="activity-time">${esc(formatDateTime(a.timestamp))}</span>
          </li>
        `).join('')}
      </ul>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudo cargar el registro de actividad.</p>`;
  }
}

export async function mount(rootEl) {
  root = rootEl;
  root.innerHTML = TEMPLATE;

  await Promise.all([
    refreshDevices(),
    initVersionSelect(),
    refreshConflicts(),
    refreshActivity(),
  ]);

  return function unmount() { root = null; };
}
