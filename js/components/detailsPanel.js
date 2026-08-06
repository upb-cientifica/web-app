import { $, $$, esc } from '../utils/dom.js';
import { formatBytes } from '../utils/format.js';
import { showToast } from './toast.js';
import { getItemDetails, updatePermissions } from '../api/files.js';
import { listPrincipals } from '../api/users.js';
import { modeToTriads, triadsToMode, triadToRwxString } from '../utils/permissions.js';

const ROWS = [
  { key: 'owner', label: 'Propietario' },
  { key: 'group', label: 'Grupo' },
  { key: 'others', label: 'Otros' },
];
const COLS = [
  { key: 'read', label: 'Lectura' },
  { key: 'write', label: 'Escritura' },
  { key: 'execute', label: 'Ejecución' },
];

const EFFECTIVE_LABELS = { read: 'lectura', write: 'escritura', execute: 'ejecución' };

let currentTriads = null;

function panelEl() { return $('#details-panel'); }

function close() {
  const el = panelEl();
  if (el) el.classList.add('hidden');
}

function matrixHTML(triads) {
  return `
    <table class="perm-matrix">
      <thead>
        <tr>
          <th></th>
          ${COLS.map((c) => `<th>${c.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${ROWS.map((r) => `
          <tr>
            <th>${r.label}</th>
            ${COLS.map((c) => `
              <td>
                <input type="checkbox" data-row="${r.key}" data-col="${c.key}" ${triads[r.key][c.key] ? 'checked' : ''}>
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function currentOctal() {
  return triadsToMode(currentTriads);
}

function currentRwxString() {
  return ROWS.map((r) => triadToRwxString(currentTriads[r.key])).join('');
}

function refreshModeDisplay(root) {
  const el = $('#perm-mode-display', root);
  if (el) el.textContent = `${currentRwxString()} · ${currentOctal()}`;
}

function principalOptions(list, selectedId) {
  return list.map((p) => `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

async function render(item) {
  const root = panelEl();
  root.innerHTML = '<p class="details-loading">Cargando detalles…</p>';
  root.classList.remove('hidden');

  try {
    const [details, principals] = await Promise.all([
      getItemDetails({ id: item.id }),
      listPrincipals(),
    ]);
    currentTriads = modeToTriads(details.mode || '000');
    const users = principals.filter((p) => p.type === 'user');
    const groups = principals.filter((p) => p.type === 'group');
    const sizeText = details.sizeBytes ? formatBytes(details.sizeBytes) : (details.meta || '—');
    const effective = details.effectivePermission || {};
    const effectiveText = Object.entries(EFFECTIVE_LABELS)
      .filter(([key]) => effective[key])
      .map(([, label]) => label)
      .join(', ') || 'ninguno';

    root.innerHTML = `
      <div class="details-head">
        <h3>Detalles</h3>
        <button class="icon-btn" id="details-close" aria-label="Cerrar">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="details-body">
        <div class="details-item-name">
          <span class="material-icons">${details.type === 'folder' ? 'folder' : 'insert_drive_file'}</span>
          <span>${esc(details.name)}</span>
        </div>

        <dl class="details-facts">
          <dt>Tamaño</dt><dd>${esc(sizeText)}</dd>
          <dt>Permiso efectivo (tú)</dt><dd>${esc(effectiveText)}</dd>
        </dl>

        <h4 class="details-subtitle">Propietario y grupo</h4>
        <label class="share-field">
          <span>Propietario</span>
          <select class="share-select" id="perm-owner-select">${principalOptions(users, details.owner)}</select>
        </label>
        <label class="share-field">
          <span>Grupo</span>
          <select class="share-select" id="perm-group-select">${principalOptions(groups, details.group)}</select>
        </label>

        <h4 class="details-subtitle">Permisos (estilo Unix)</h4>
        <div id="perm-matrix-wrap">${matrixHTML(currentTriads)}</div>
        <p class="perm-mode-display" id="perm-mode-display">${currentRwxString()} · ${currentOctal()}</p>
        <button class="btn-primary" id="perm-save-btn">Guardar permisos</button>

        <h4 class="details-subtitle">Versiones</h4>
        <ul class="details-versions">
          ${(details.versions || []).length ? details.versions.map((v) => `
            <li><span>${esc(v.label)}</span><span>${esc(v.date)}</span><span>${esc(v.sizeMeta)}</span></li>
          `).join('') : '<li class="share-empty">Sin versiones registradas.</li>'}
        </ul>
      </div>
    `;

    $('#details-close', root).addEventListener('click', close);

    $$('#perm-matrix-wrap input[type="checkbox"]', root).forEach((box) => {
      box.addEventListener('change', () => {
        currentTriads[box.dataset.row][box.dataset.col] = box.checked;
        refreshModeDisplay(root);
      });
    });

    $('#perm-save-btn', root).addEventListener('click', async () => {
      const owner = $('#perm-owner-select', root).value;
      const group = $('#perm-group-select', root).value;
      const mode = currentOctal();
      try {
        await updatePermissions({ id: item.id, owner, group, mode });
        showToast('Permisos actualizados', 'success');
      } catch (err) {
        showToast(err.message || 'No se pudieron guardar los permisos', 'error');
      }
    });
  } catch (err) {
    root.innerHTML = `<div class="details-head"><h3>Detalles</h3><button class="icon-btn" id="details-close" aria-label="Cerrar"><span class="material-icons">close</span></button></div>
      <p class="share-error details-error-pad">No se pudieron cargar los detalles.</p>`;
    $('#details-close', root).addEventListener('click', close);
  }
}

export function openDetailsPanel(item) {
  if (!item) return;
  render(item);
}

export function closeDetailsPanel() {
  close();
}
