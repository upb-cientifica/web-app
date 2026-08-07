import { $, $$, esc } from '../utils/dom.js';
import { formatDateTime } from '../utils/format.js';
import { showToast } from '../components/toast.js';
import { listUsers, createUser, setUserStatus, updateUserQuota, listServices, listAuditLog } from '../api/admin.js';
import { listPrincipals } from '../api/users.js';

let root = null;
let groupOptions = [];
let auditFilters = { userId: 'all', action: 'all', dateFrom: '', dateTo: '' };

const ROLE_LABELS = { admin: 'Administrador', user: 'Usuario' };
const STATUS_LABELS = { active: 'Activo', inactive: 'Dado de baja' };
const ACTION_LABELS = {
  login: 'Inicio de sesión', crear_carpeta: 'Crear carpeta', compartir: 'Compartir',
  cambiar_permisos: 'Cambiar permisos', eliminar: 'Eliminar', enviar_trabajo: 'Enviar trabajo',
  descargar: 'Descargar', crear_usuario: 'Crear usuario', activar_usuario: 'Activar usuario',
  dar_de_baja_usuario: 'Dar de baja usuario', cambiar_cuota: 'Cambiar cuota',
};

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Administración</h1></div>
  </div>

  <section class="block">
    <h2 class="block-title">Gestión de usuarios</h2>
    <div class="admin-add-row">
      <input type="text" class="share-select" id="user-name" placeholder="Nombre">
      <input type="email" class="share-select" id="user-email" placeholder="correo@upb-cientifica.edu">
      <select class="share-select" id="user-role">
        <option value="user">Usuario</option>
        <option value="admin">Administrador</option>
      </select>
      <select class="share-select" id="user-group"></select>
      <input type="number" class="share-select field-narrow-sm" id="user-quota" placeholder="Cuota (GB)" value="50">
      <button class="btn-primary" id="user-add-btn">Dar de alta</button>
    </div>
    <div id="users-wrap"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Mapa de servicios</h2>
    <div id="services-wrap"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Bitácora de auditoría</h2>
    <div class="admin-audit-filters">
      <label class="share-field"><span>Usuario</span><select class="share-select" id="audit-user"><option value="all">Todos</option></select></label>
      <label class="share-field"><span>Acción</span><select class="share-select" id="audit-action"><option value="all">Todas</option></select></label>
      <label class="share-field"><span>Desde</span><input type="date" class="share-select" id="audit-from"></label>
      <label class="share-field"><span>Hasta</span><input type="date" class="share-select" id="audit-to"></label>
    </div>
    <div id="audit-wrap"></div>
  </section>
`;

function groupName(groupId) {
  return groupOptions.find((g) => g.id === groupId)?.name || '—';
}

async function refreshUsers() {
  const wrap = $('#users-wrap', root);
  try {
    const users = await listUsers();
    wrap.innerHTML = `
      <div class="table-scroll">
        <table class="jobs-table">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Grupo</th><th>Cuota (GB)</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${users.map((u) => `
              <tr data-id="${esc(u.id)}">
                <td>${esc(u.name)}</td>
                <td>${esc(u.email)}</td>
                <td>${esc(ROLE_LABELS[u.role] || u.role)}</td>
                <td>${esc(groupName(u.groupId))}</td>
                <td>
                  <input type="number" class="share-select user-quota-input" data-id="${esc(u.id)}" value="${u.quotaGB}" aria-label="Cuota en GB de ${esc(u.name)}">
                </td>
                <td><span class="job-status ${u.status === 'active' ? 'job-status-completed' : 'job-status-cancelled'}">${esc(STATUS_LABELS[u.status] || u.status)}</span></td>
                <td>
                  <button class="btn-text user-toggle-btn" data-id="${esc(u.id)}" data-status="${u.status}">
                    ${u.status === 'active' ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    $$('.user-quota-input', wrap).forEach((input) => {
      input.addEventListener('change', async () => {
        try {
          await updateUserQuota({ id: input.dataset.id, quotaGB: input.value });
          showToast('Cuota actualizada', 'success');
          refreshAudit();
        } catch (err) {
          showToast(err.message || 'No se pudo actualizar la cuota', 'error');
        }
      });
    });

    $$('.user-toggle-btn', wrap).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        try {
          await setUserStatus({ id: btn.dataset.id, status: nextStatus });
          showToast(nextStatus === 'active' ? 'Usuario reactivado' : 'Usuario dado de baja', 'success');
          await refreshUsers();
          await refreshAudit();
        } catch (err) {
          showToast(err.message || 'No se pudo actualizar el estado', 'error');
        }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudo cargar la lista de usuarios.</p>`;
  }
}

async function initCreateUserForm() {
  const groupSelect = $('#user-group', root);
  try {
    const principals = await listPrincipals();
    groupOptions = principals.filter((p) => p.type === 'group');
    groupSelect.innerHTML = groupOptions.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  } catch (err) {
    showToast('No se pudieron cargar los grupos', 'error');
  }

  $('#user-add-btn', root).addEventListener('click', async () => {
    const name = $('#user-name', root).value.trim();
    const email = $('#user-email', root).value.trim();
    const role = $('#user-role', root).value;
    const groupId = groupSelect.value || null;
    const quotaGB = $('#user-quota', root).value;
    try {
      await createUser({ name, email, role, groupId, quotaGB });
      showToast('Usuario dado de alta', 'success');
      $('#user-name', root).value = '';
      $('#user-email', root).value = '';
      await refreshUsers();
      await refreshAudit();
      await populateAuditUserFilter();
    } catch (err) {
      showToast(err.message || 'No se pudo dar de alta al usuario', 'error');
    }
  });
}

async function refreshServices() {
  const wrap = $('#services-wrap', root);
  try {
    const list = await listServices();
    wrap.innerHTML = `
      <div class="table-scroll">
        <table class="jobs-table">
          <thead><tr><th>Servicio</th><th>URL</th><th>Estado</th></tr></thead>
          <tbody>
            ${list.map((s) => `
              <tr>
                <td>${esc(s.name)}</td>
                <td><code>${esc(s.url)}</code></td>
                <td><span class="service-dot ${s.status === 'up' ? 'service-dot-up' : s.status === 'degraded' ? 'service-dot-degraded' : 'service-dot-down'}"></span> ${esc(s.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudo cargar el mapa de servicios.</p>`;
  }
}

async function refreshAudit() {
  const wrap = $('#audit-wrap', root);
  try {
    const list = await listAuditLog(auditFilters);
    if (!list.length) { wrap.innerHTML = `<div class="empty-state"><span class="material-icons">history</span><p>Sin resultados</p></div>`; return; }
    wrap.innerHTML = `
      <div class="table-scroll">
        <table class="jobs-table">
          <thead><tr><th>Usuario</th><th>Acción</th><th>Objetivo</th><th>Fecha</th></tr></thead>
          <tbody>
            ${list.map((e) => `
              <tr>
                <td>${esc(e.userName)}</td>
                <td>${esc(ACTION_LABELS[e.action] || e.action)}</td>
                <td>${esc(e.target)}</td>
                <td>${esc(formatDateTime(e.timestamp))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudo cargar la bitácora.</p>`;
  }
}

async function populateAuditUserFilter() {
  const select = $('#audit-user', root);
  const current = select.value;
  try {
    const users = await listUsers();
    select.innerHTML = '<option value="all">Todos</option>' +
      users.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
    select.value = current || 'all';
  } catch (err) { /* silencioso: el filtro simplemente queda con "Todos" */ }
}

function initAuditFilters() {
  const actionSelect = $('#audit-action', root);
  actionSelect.innerHTML = '<option value="all">Todas</option>' +
    Object.entries(ACTION_LABELS).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');

  $('#audit-user', root).addEventListener('change', (e) => { auditFilters.userId = e.target.value; refreshAudit(); });
  actionSelect.addEventListener('change', (e) => { auditFilters.action = e.target.value; refreshAudit(); });
  $('#audit-from', root).addEventListener('change', (e) => { auditFilters.dateFrom = e.target.value; refreshAudit(); });
  $('#audit-to', root).addEventListener('change', (e) => { auditFilters.dateTo = e.target.value; refreshAudit(); });
}

export async function mount(rootEl) {
  root = rootEl;
  auditFilters = { userId: 'all', action: 'all', dateFrom: '', dateTo: '' };
  root.innerHTML = TEMPLATE;

  await initCreateUserForm();
  initAuditFilters();
  await Promise.all([refreshUsers(), refreshServices(), refreshAudit(), populateAuditUserFilter()]);

  return function unmount() { root = null; };
}
