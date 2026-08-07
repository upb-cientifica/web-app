import { $, $$, esc } from '../utils/dom.js';
import { formatDateTime, formatDuration } from '../utils/format.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { listJobs, getJob, submitJob, cancelJob, subscribeJobLog } from '../api/jobs.js';
import { createFile } from '../api/files.js';

const STATUS_LABELS = {
  queued: 'Encolado', running: 'Ejecutando', completed: 'Completado',
  failed: 'Fallido', cancelled: 'Cancelado',
};
const STATUS_FILTERS = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled'];

let root = null;
let statusFilter = 'all';
let selectedJobId = null;
let refreshTimer = null;
let logUnsubscribe = null;
let envRowCount = 0;

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Trabajos MPI</h1></div>
    <div class="main-controls">
      <div class="quick-filters" id="job-filters">
        ${STATUS_FILTERS.map((s) => `
          <button class="filter-chip ${s === 'all' ? 'active' : ''}" data-status="${s}">${s === 'all' ? 'Todos' : STATUS_LABELS[s]}</button>
        `).join('')}
      </div>
      <button class="btn-primary" id="btn-new-job">
        <span class="material-icons btn-icon-inline">add</span> Nuevo trabajo
      </button>
    </div>
  </div>

  <div class="jobs-layout">
    <section class="jobs-queue" id="jobs-queue"></section>
    <aside class="job-detail hidden" id="job-detail"></aside>
  </div>

  <!-- Modal: enviar trabajo -->
  <div class="modal hidden" id="modal-job-submit">
    <div class="modal-card job-submit-card">
      <div class="modal-head">
        <h3>Nuevo trabajo MPI</h3>
        <button class="icon-btn" id="job-submit-close" aria-label="Cerrar"><span class="material-icons">close</span></button>
      </div>
      <form id="job-submit-form" class="job-submit-form">
        <label class="share-field">
          <span>Nombre del trabajo</span>
          <input type="text" class="share-select" id="job-name" required>
        </label>
        <div class="job-submit-row">
          <label class="share-field">
            <span>Código fuente</span>
            <input type="file" class="share-select" id="job-source">
          </label>
          <label class="share-field">
            <span>Dataset</span>
            <input type="file" class="share-select" id="job-dataset">
          </label>
        </div>
        <div class="job-submit-row">
          <label class="share-field">
            <span>Procesos</span>
            <input type="number" class="share-select" id="job-processes" min="1" value="16" required>
          </label>
          <label class="share-field">
            <span>Nodos</span>
            <input type="number" class="share-select" id="job-nodes" min="1" max="8" value="2" required>
          </label>
          <label class="share-field">
            <span>Tiempo límite (min)</span>
            <input type="number" class="share-select" id="job-time-limit" min="1" value="60" required>
          </label>
        </div>
        <div class="job-env-head">
          <span>Variables de entorno</span>
          <button type="button" class="btn-text" id="job-env-add">+ Agregar</button>
        </div>
        <div id="job-env-rows"></div>
        <div class="modal-foot">
          <button type="button" class="btn-text" id="job-submit-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">Enviar trabajo</button>
        </div>
      </form>
    </div>
  </div>
`;

function statusBadge(status) {
  return `<span class="job-status job-status-${status}">${STATUS_LABELS[status] || status}</span>`;
}

function durationText(job) {
  if (job.startedAt && job.completedAt) return formatDuration(new Date(job.completedAt) - new Date(job.startedAt));
  if (job.startedAt) return formatDuration(Date.now() - new Date(job.startedAt)) + ' (en curso)';
  return '—';
}

function queueTableHTML(jobsList) {
  if (!jobsList.length) {
    return `<div class="empty-state"><span class="material-icons">terminal</span><p>No hay trabajos en este estado</p></div>`;
  }
  return `
    <div class="table-scroll">
      <table class="jobs-table">
        <thead>
          <tr><th>Nombre</th><th>Estado</th><th>Nodos</th><th>Procesos</th><th>Enviado</th><th>Duración</th><th></th></tr>
        </thead>
        <tbody>
          ${jobsList.map((j) => `
            <tr class="job-row ${j.id === selectedJobId ? 'selected' : ''}" data-id="${j.id}" tabindex="0" role="button" aria-label="Ver detalle de ${esc(j.name)}">
              <td>${esc(j.name)}</td>
              <td>${statusBadge(j.status)}</td>
              <td>${j.nodes}</td>
              <td>${j.processes}</td>
              <td>${esc(formatDateTime(j.submittedAt))}</td>
              <td>${durationText(j)}</td>
              <td>
                ${(j.status === 'queued' || j.status === 'running')
                  ? `<button class="icon-btn job-cancel-btn" data-id="${j.id}" title="Cancelar" aria-label="Cancelar trabajo"><span class="material-icons">cancel</span></button>`
                  : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function refreshQueue() {
  const container = $('#jobs-queue', root);
  if (!container) return;
  try {
    const jobsList = await listJobs({ status: statusFilter === 'all' ? undefined : statusFilter });
    container.innerHTML = queueTableHTML(jobsList);
    $$('.job-row', container).forEach((row) => {
      row.addEventListener('click', () => openDetail(row.dataset.id));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(row.dataset.id); }
      });
    });
    $$('.job-cancel-btn', container).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await cancelJob({ id: btn.dataset.id });
          showToast('Trabajo cancelado', 'success');
          refreshQueue();
          if (selectedJobId === btn.dataset.id) openDetail(btn.dataset.id);
        } catch (err) {
          showToast(err.message || 'No se pudo cancelar', 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="share-error">No se pudo cargar la cola de trabajos.</p>`;
  }
}

function envVarsHTML(job) {
  if (!job.envVars || !job.envVars.length) return '<p class="job-detail-empty">Sin variables de entorno.</p>';
  return `<ul class="job-envvars">${job.envVars.map((v) => `<li><code>${esc(v.key)}=${esc(v.value)}</code></li>`).join('')}</ul>`;
}

async function openDetail(jobId) {
  selectedJobId = jobId;
  if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }

  const panel = $('#job-detail', root);
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="details-loading">Cargando trabajo…</p>';

  $$('.job-row', root).forEach((r) => r.classList.toggle('selected', r.dataset.id === jobId));

  try {
    const job = await getJob({ id: jobId });
    panel.innerHTML = `
      <div class="details-head">
        <h3>${esc(job.name)}</h3>
        <button class="icon-btn" id="job-detail-close" aria-label="Cerrar"><span class="material-icons">close</span></button>
      </div>
      <div class="details-body">
        ${statusBadge(job.status)}
        <dl class="details-facts">
          <dt>Procesos</dt><dd>${job.processes}</dd>
          <dt>Nodos solicitados</dt><dd>${job.nodes}</dd>
          <dt>Nodos asignados</dt><dd>${job.assignedNodes.length ? esc(job.assignedNodes.join(', ')) : '—'}</dd>
          <dt>Tiempo límite</dt><dd>${job.timeLimitMinutes} min</dd>
          <dt>Código fuente</dt><dd>${esc(job.sourceFileName)}</dd>
          <dt>Dataset</dt><dd>${esc(job.datasetFileName)}</dd>
          <dt>Enviado</dt><dd>${esc(formatDateTime(job.submittedAt))}</dd>
          <dt>Tiempo transcurrido</dt><dd id="job-elapsed">${durationText(job)}</dd>
        </dl>
        <h4 class="details-subtitle">Variables de entorno</h4>
        ${envVarsHTML(job)}
        <h4 class="details-subtitle">Log</h4>
        <div class="job-log" id="job-log">${job.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
        <div class="job-detail-actions">
          ${(job.status === 'queued' || job.status === 'running')
            ? `<button class="btn-text" id="job-detail-cancel">Cancelar trabajo</button>` : ''}
          ${job.status === 'completed'
            ? `<button class="btn-primary" id="job-detail-download">Descargar resultados al Home</button>` : ''}
        </div>
      </div>
    `;

    $('#job-detail-close', panel).addEventListener('click', closeDetail);

    const cancelBtn = $('#job-detail-cancel', panel);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        try {
          await cancelJob({ id: jobId });
          showToast('Trabajo cancelado', 'success');
          refreshQueue();
          openDetail(jobId);
        } catch (err) {
          showToast(err.message || 'No se pudo cancelar', 'error');
        }
      });
    }

    const downloadBtn = $('#job-detail-download', panel);
    if (downloadBtn) {
      downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        try {
          await createFile({
            name: `resultados_${job.name.replace(/\s+/g, '_')}.tar.gz`,
            parentId: null,
            type: 'doc',
            meta: 'Resultado de trabajo MPI',
          });
          showToast('Resultados guardados en Mi unidad', 'success');
        } catch (err) {
          showToast(err.message || 'No se pudo descargar', 'error');
          downloadBtn.disabled = false;
        }
      });
    }

    const logEl = $('#job-log', panel);
    if (logEl) logEl.scrollTop = logEl.scrollHeight;

    if (job.status === 'running' || job.status === 'queued') {
      logUnsubscribe = subscribeJobLog({
        id: jobId,
        onLine: (line) => {
          const el = $('#job-log', panel);
          if (!el) return;
          const div = document.createElement('div');
          div.textContent = line;
          el.appendChild(div);
          el.scrollTop = el.scrollHeight;
        },
      });
    }
  } catch (err) {
    panel.innerHTML = `<div class="details-head"><h3>Trabajo</h3></div><p class="share-error details-error-pad">No se pudo cargar el trabajo.</p>`;
  }
}

async function refreshDetailFacts() {
  if (!selectedJobId || !root) return;
  const panel = $('#job-detail', root);
  if (!panel || panel.classList.contains('hidden')) return;
  try {
    const job = await getJob({ id: selectedJobId });
    const setText = (sel, text) => { const el = $(sel, panel); if (el) el.textContent = text; };
    const heading = $('.details-head h3', panel);
    if (heading) heading.textContent = job.name;
    const badge = $('.job-status', panel);
    if (badge) { badge.outerHTML = statusBadge(job.status); }
    setText('#job-elapsed', durationText(job));
    const nodesDd = $$('.details-facts dd', panel)[2];
    if (nodesDd) nodesDd.textContent = job.assignedNodes.length ? job.assignedNodes.join(', ') : '—';

    const actions = $('.job-detail-actions', panel);
    const stillActive = job.status === 'queued' || job.status === 'running';
    if (actions && !stillActive && !$('#job-detail-download', panel) && job.status === 'completed') {
      // El trabajo terminó mientras el panel estaba abierto: vuelve a pintar para mostrar "Descargar resultados".
      openDetail(selectedJobId);
    } else if (actions && $('#job-detail-cancel', panel) && !stillActive) {
      $('#job-detail-cancel', panel).remove();
    }
  } catch {
    // silencioso: el próximo tick lo reintenta
  }
}

function closeDetail() {
  selectedJobId = null;
  if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }
  const panel = $('#job-detail', root);
  if (panel) panel.classList.add('hidden');
  $$('.job-row', root).forEach((r) => r.classList.remove('selected'));
}

/* ---------- Formulario de envío ---------- */

function addEnvRow(container, key = '', value = '') {
  const idx = envRowCount++;
  const row = document.createElement('div');
  row.className = 'job-env-row';
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text" class="share-select" placeholder="VARIABLE" value="${esc(key)}" data-env-key>
    <input type="text" class="share-select" placeholder="valor" value="${esc(value)}" data-env-value>
    <button type="button" class="icon-btn job-env-remove" aria-label="Quitar variable"><span class="material-icons">close</span></button>
  `;
  row.querySelector('.job-env-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function readEnvRows(container) {
  return $$('.job-env-row', container)
    .map((row) => ({
      key: row.querySelector('[data-env-key]').value.trim(),
      value: row.querySelector('[data-env-value]').value.trim(),
    }))
    .filter((v) => v.key);
}

function initSubmitModal() {
  const btnNew = $('#btn-new-job', root);
  const modal = $('#modal-job-submit', root);
  const form = $('#job-submit-form', root);
  const envRows = $('#job-env-rows', root);

  btnNew.addEventListener('click', () => {
    form.reset();
    envRows.innerHTML = '';
    envRowCount = 0;
    openModal('modal-job-submit');
  });

  $('#job-submit-close', root).addEventListener('click', () => closeModal('modal-job-submit'));
  $('#job-submit-cancel', root).addEventListener('click', () => closeModal('modal-job-submit'));
  $('#job-env-add', root).addEventListener('click', () => addEnvRow(envRows));

  const onBackdropClick = (e) => { if (e.target === modal) closeModal('modal-job-submit'); };
  modal.addEventListener('click', onBackdropClick);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const sourceInput = $('#job-source', root);
      const datasetInput = $('#job-dataset', root);
      await submitJob({
        name: $('#job-name', root).value.trim() || 'Trabajo sin título',
        processes: $('#job-processes', root).value,
        nodes: $('#job-nodes', root).value,
        timeLimitMinutes: $('#job-time-limit', root).value,
        envVars: readEnvRows(envRows),
        sourceFileName: sourceInput.files[0]?.name || '—',
        datasetFileName: datasetInput.files[0]?.name || '—',
      });
      showToast('Trabajo enviado', 'success');
      closeModal('modal-job-submit');
      statusFilter = 'all';
      $$('#job-filters .filter-chip', root).forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      refreshQueue();
    } catch (err) {
      showToast(err.message || 'No se pudo enviar el trabajo', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return () => modal.removeEventListener('click', onBackdropClick);
}

function initFilters() {
  $$('#job-filters .filter-chip', root).forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('#job-filters .filter-chip', root).forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      statusFilter = chip.dataset.status;
      refreshQueue();
    });
  });
}

export async function mount(rootEl) {
  root = rootEl;
  statusFilter = 'all';
  selectedJobId = null;
  root.innerHTML = TEMPLATE;

  initFilters();
  const unbindModal = initSubmitModal();
  await refreshQueue();

  refreshTimer = setInterval(() => { refreshQueue(); refreshDetailFacts(); }, 4000);

  return function unmount() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }
    if (unbindModal) unbindModal();
    root = null;
  };
}
