import { $, $$, esc } from '../utils/dom.js';
import { formatDateTime, formatDuration } from '../utils/format.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { listJobs, getJob, submitJob, cancelJob, subscribeJobLog, getSlots } from '../api/jobs.js';
import { USE_MOCKS } from '../config.js';
import { navigate, rutaDe } from '../router.js';
import { createFile, createFolder, uploadFile, listItems } from '../api/files.js';
import { renovarSesion } from '../session.js';

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
let detailVersion = 0;
let detailBusy = false;

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
              <td>${j.nodes || '—'}</td>
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
  const version = ++detailVersion;
  if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }

  const panel = $('#job-detail', root);
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="details-loading">Cargando trabajo…</p>';

  $$('.job-row', root).forEach((r) => r.classList.toggle('selected', r.dataset.id === jobId));

  try {
    const job = await getJob({ id: jobId });
    if (version !== detailVersion || !root) return;
    panel.innerHTML = `
      <div class="details-head">
        <h3>${esc(job.name)}</h3>
        <button class="icon-btn" id="job-detail-close" aria-label="Cerrar"><span class="material-icons">close</span></button>
      </div>
      <div class="details-body">
        ${statusBadge(job.status)}
        <dl class="details-facts">
          <dt>Procesos</dt><dd>${job.processes}</dd>
          ${USE_MOCKS ? `<dt>Nodos solicitados</dt><dd>${job.nodes}</dd>
          <dt>Nodos asignados</dt><dd>${job.assignedNodes.length ? esc(job.assignedNodes.join(', ')) : '—'}</dd>
          <dt>Tiempo límite</dt><dd>${job.timeLimitMinutes} min</dd>
          <dt>Código fuente</dt><dd>${esc(job.sourceFileName)}</dd>
          <dt>Dataset</dt><dd>${esc(job.datasetFileName)}</dd>
          ` : `<dt>Equipos</dt><dd class="job-path">${job.assignedNodes.length ? esc(job.assignedNodes.join(', ')) : '—'}</dd>
          <dt>Comando</dt><dd class="job-path">${esc(job.command || '—')}</dd>
          <dt>Carpeta</dt><dd><button type="button" class="btn-text job-path" id="job-folder">${esc(job.folder || '—')}</button></dd>`}
          <dt>Enviado</dt><dd>${esc(formatDateTime(job.submittedAt))}</dd>
          <dt>Tiempo transcurrido</dt><dd id="job-elapsed">${durationText(job)}</dd>
        </dl>
        ${USE_MOCKS ? `<h4 class="details-subtitle">Variables de entorno</h4>${envVarsHTML(job)}` : `
        <progress id="job-progress" class="job-progress" max="100" value="0" aria-label="Progreso del trabajo"></progress>
        <p id="job-message" class="job-help" aria-live="polite"></p>`}
        <h4 class="details-subtitle">Log</h4>
        <div class="job-log" id="job-log">${job.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
        <div class="job-detail-actions">
          ${(job.status === 'queued' || job.status === 'running')
            ? `<button class="btn-text" id="job-detail-cancel">Cancelar trabajo</button>` : ''}
          ${USE_MOCKS && job.status === 'completed'
            ? `<button class="btn-primary" id="job-detail-download">Descargar resultados al Home</button>` : ''}
        </div>
      </div>
    `;

    $('#job-detail-close', panel).addEventListener('click', closeDetail);
    $('#job-folder', panel)?.addEventListener('click', () => navigate(rutaDe('/archivos', job.folder)));
    updateProgress(panel, job);
    if (!USE_MOCKS) await updateResults(panel, job, version);
    if (version !== detailVersion || !root) return;

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

    if (USE_MOCKS && (job.status === 'running' || job.status === 'queued')) {
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
    if (version !== detailVersion || !root) return;
    panel.innerHTML = `<div class="details-head"><h3>Trabajo</h3></div><p class="share-error details-error-pad">No se pudo cargar el trabajo.</p>`;
  }
}

function updateProgress(panel, job) {
  const value = Math.max(0, Math.min(100, Number(job.progress) || 0));
  const bar = $('#job-progress', panel);
  if (bar) bar.value = value;
  const message = $('#job-message', panel);
  const iteracion = job.iteration ? ` · iteración ${job.iteration}` : '';
  if (message) message.textContent = `${value}% · ${job.message || STATUS_LABELS[job.status]}${iteracion}`;
}

async function updateResults(panel, job, version) {
  if (!job.folder || !['completed', 'failed'].includes(job.status) || $('#job-results', panel)) return;
  try {
    const { folders } = await listItems({ parentId: job.folder });
    if (version !== detailVersion || !root) return;
    const name = `resultados-${String(job.id).slice(0, 8)}`;
    const result = folders.find((folder) => folder.name === name);
    if (!result) return;
    const button = document.createElement('button');
    button.id = 'job-results';
    button.className = 'btn-primary';
    button.textContent = 'Resultados';
    button.addEventListener('click', () => navigate(rutaDe('/archivos', result.id)));
    $('.job-detail-actions', panel).appendChild(button);
  } catch { /* Reintentar en el siguiente sondeo: aún puede estar publicándose. */ }
}

async function refreshDetailFacts() {
  if (!selectedJobId || !root || detailBusy) return;
  const version = detailVersion;
  const id = selectedJobId;
  const panel = $('#job-detail', root);
  detailBusy = true;
  try {
    const job = await getJob({ id });
    if (version !== detailVersion || !root) return;
    const badge = $('.job-status', panel);
    if (badge) badge.outerHTML = statusBadge(job.status);
    const elapsed = $('#job-elapsed', panel);
    if (elapsed) elapsed.textContent = durationText(job);
    updateProgress(panel, job);
    const log = $('#job-log', panel);
    if (log) {
      const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
      log.textContent = job.log.join('\n');
      if (atEnd) log.scrollTop = log.scrollHeight;
    }
    const active = ['queued', 'running'].includes(job.status);
    if (!active) {
      $('#job-detail-cancel', panel)?.remove();
      if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }
    }
    if (USE_MOCKS) {
      const nodes = $$('.details-facts dd', panel)[2];
      if (nodes) nodes.textContent = job.assignedNodes.join(', ') || '—';
      if (job.status === 'completed' && !$('#job-detail-download', panel)) openDetail(id);
    } else await updateResults(panel, job, version);
  } catch { /* El próximo sondeo reintenta. */ }
  finally { detailBusy = false; }
}

function closeDetail() {
  detailVersion += 1;
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

function initRealSubmitModal() {
  const modal = $('#modal-job-submit', root);
  const form = $('#job-submit-form', modal);
  form.innerHTML = `
    <label class="share-field"><span>Nombre del trabajo</span><input id="job-name" class="share-select" required></label>
    <label class="share-field"><span>Origen de los archivos</span>
      <select id="job-origin" class="share-select"><option value="upload">Subir archivos</option><option value="folder">Usar una carpeta de Mi unidad</option></select>
    </label>
    <div id="job-upload-fields"><label class="share-field"><span>Código (.c, .cpp, Makefile) y datasets</span>
      <input type="file" id="job-files" class="share-select" multiple></label>
      <p class="job-help">Se guardarán en /HPC/&lt;nombre-en-slug&gt;. Si la carpeta existe, se reutiliza; sus otros archivos permanecen.</p>
    </div>
    <div id="job-folder-fields" class="hidden">
      <p class="job-help">La carpeta abierta será la seleccionada. Solo se usan sus archivos directos.</p>
      <div class="job-folder-nav"><button type="button" class="btn-text" id="job-folder-root">Mi unidad</button><button type="button" class="btn-text" id="job-folder-up">Subir un nivel</button></div>
      <p id="job-folder-path" class="job-path"></p><div id="job-folder-list" class="job-folder-list"></div>
    </div>
    <label class="share-field"><span>Comando</span><input id="job-command" class="share-select" placeholder="./kmeans -k 10 -a USCensus1990.data.txt" required>
      <span class="job-help">Si la carpeta tiene archivos .c, se compilan con el nombre del ejecutable del comando</span></label>
    <label class="share-field"><span>Procesos</span><input id="job-processes" class="share-select" type="number" min="1" step="1" value="4" required>
      <span id="job-slots" class="job-help">Slots disponibles en el clúster: consultando…</span></label>
    <div id="job-upload-progress" class="hidden"><progress class="job-progress" max="100" value="0" aria-label="Progreso total de subida"></progress><p class="job-help" aria-live="polite"></p></div>
    <p id="job-submit-error" class="share-error" role="alert"></p>
    <div class="modal-foot"><button type="button" class="btn-text" id="job-submit-cancel">Cancelar</button><button type="submit" class="btn-primary">Enviar trabajo</button></div>`;
  const field = (id) => $('#' + id, modal);
  let controller = null;
  let phase = '';
  let alive = true;
  let folder = null;
  let browseVersion = 0;
  let opening = 0;
  const error = field('job-submit-error');
  const origin = field('job-origin');
  const files = field('job-files');
  const command = field('job-command');
  const cancel = field('job-submit-cancel');
  const suggest = () => {
    if (command.value.trim()) return;
    const selected = Array.from(files.files);
    const source = selected.find((f) => /\.c$/i.test(f.name));
    const data = selected.find((f) => !/\.(c|cpp|cc|cxx|h|hpp)$/i.test(f.name) && !/^makefile$/i.test(f.name));
    // Solo proponer tokens simples; nombres con espacios requieren un comando explícito.
    if (source && /^[\w.-]+$/.test(source.name) && (!data || /^[\w.-]+$/.test(data.name))) {
      command.value = `./${source.name.replace(/\.c$/i, '')}${data ? ' ' + data.name : ''}`;
    }
  };
  files.addEventListener('change', suggest);
  async function browse(path) {
    const version = ++browseVersion;
    folder = null;
    field('job-folder-path').textContent = path;
    const list = field('job-folder-list');
    list.textContent = 'Cargando…';
    try {
      const items = await listItems({ parentId: path });
      if (!alive || version !== browseVersion) return;
      folder = path;
      list.replaceChildren();
      for (const item of items.folders) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn-text job-folder-option';
        button.textContent = `Carpeta: ${item.name}`;
        button.addEventListener('click', () => browse(item.id));
        list.appendChild(button);
      }
      const contents = document.createElement('p');
      contents.className = 'job-help';
      contents.textContent = items.files.length ? `Archivos: ${items.files.map((f) => f.name).join(', ')}` : 'Esta carpeta no contiene archivos directos.';
      list.appendChild(contents);
    } catch (err) {
      if (alive && version === browseVersion) list.textContent = `No se pudo abrir la carpeta: ${err.message}`;
    }
  }
  origin.addEventListener('change', () => {
    field('job-upload-fields').classList.toggle('hidden', origin.value !== 'upload');
    field('job-folder-fields').classList.toggle('hidden', origin.value !== 'folder');
    if (origin.value === 'folder') browse('/');
  });
  field('job-folder-root').addEventListener('click', () => browse('/'));
  field('job-folder-up').addEventListener('click', () => {
    const current = field('job-folder-path').textContent;
    browse(current.slice(0, current.lastIndexOf('/')) || '/');
  });
  function dismiss() {
    if (phase === 'submit') return;
    if (controller) { controller.abort(); return; }
    opening += 1;
    closeModal('modal-job-submit');
  }
  field('job-submit-close').addEventListener('click', dismiss);
  cancel.addEventListener('click', dismiss);
  modal.addEventListener('click', (event) => { if (event.target === modal) dismiss(); });
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); dismiss(); }
  });
  $('#btn-new-job', root).addEventListener('click', async () => {
    const version = ++opening;
    form.reset(); error.textContent = ''; folder = null;
    field('job-upload-fields').classList.remove('hidden');
    field('job-folder-fields').classList.add('hidden');
    field('job-upload-progress').classList.add('hidden');
    field('job-slots').textContent = 'Slots disponibles en el clúster: consultando…';
    openModal('modal-job-submit');
    try {
      const nodes = await getSlots();
      if (!alive || version !== opening) return;
      const n = Number(nodes.slotsDisponibles);
      field('job-slots').textContent = `Slots disponibles en el clúster: ${Number.isFinite(n) ? n : 'sin datos'}`;
      if (!controller && field('job-processes').value === '4') field('job-processes').value = Number.isInteger(n) && n > 0 ? n : 4;
    } catch {
      if (alive && version === opening) field('job-slots').textContent = 'Slots disponibles en el clúster: sin datos';
    }
  });
  async function ensureFolder(parent, name) {
    const existing = (await listItems({ parentId: parent })).folders.find((f) => f.name === name);
    if (existing) return existing.id;
    try { return (await createFolder({ parentId: parent, name })).id; }
    catch (err) {
      // Otra sesión puede haber creado la carpeta entre el listado y el POST.
      const found = (await listItems({ parentId: parent })).folders.find((f) => f.name === name);
      if (found) return found.id;
      throw err;
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (controller) return;
    error.textContent = '';
    const name = field('job-name').value.trim();
    const selected = Array.from(files.files);
    const uploading = origin.value === 'upload';
    const processes = Number(field('job-processes').value);
    suggest();
    const cmd = command.value.trim();
    if (!name || !cmd || !Number.isInteger(processes) || processes < 1 || (uploading ? !selected.length : !folder)) {
      error.textContent = 'Indica nombre, comando, procesos válidos y archivos o una carpeta accesible.';
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    phase = 'upload';
    const controls = $$('input, select, button', form).filter((el) => el !== cancel);
    controls.forEach((el) => { el.disabled = true; });
    const checkAbort = () => { if (signal.aborted) throw new Error('Subida cancelada. Los archivos ya guardados permanecen en Mi unidad.'); };
    try {
      let destination = folder;
      if (uploading) {
        const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'trabajo';
        const hpc = await ensureFolder('/', 'HPC');
        checkAbort();
        destination = await ensureFolder(hpc, slug);
        checkAbort();
        const progress = field('job-upload-progress');
        progress.classList.remove('hidden');
        const total = selected.reduce((sum, file) => sum + file.size, 0);
        let completed = 0;
        const start = performance.now();
        for (const file of selected) {
          checkAbort();
          const update = ({ loaded }) => {
            const bytes = completed + Math.min(loaded, file.size);
            const percent = total ? bytes / total * 100 : 100;
            const speed = bytes / 1024 ** 2 / Math.max((performance.now() - start) / 1000, 0.001);
            $('progress', progress).value = percent;
            $('p', progress).textContent = `${(bytes / 1024 ** 2).toFixed(1)} / ${(total / 1024 ** 2).toFixed(1)} MB · ${percent.toFixed(0)}% · ${speed.toFixed(1)} MB/s · ${file.name}${loaded >= file.size ? ' · Guardando…' : ''}`;
          };
          update({ loaded: 0 });
          await uploadFile({ file, parentId: destination, signal, onProgress: update });
          update({ loaded: file.size });
          completed += file.size;
        }
      }
      checkAbort();
      phase = 'submit'; cancel.disabled = true;
      error.textContent = 'Enviando trabajo al clúster…';
      // Token recién emitido: el clúster lo usa hasta guardar los resultados.
      await renovarSesion().catch((err) => console.warn('No se pudo renovar la sesión antes de enviar:', err.message));
      await submitJob({ name, processes, command: cmd, folder: destination });
      if (!alive) return;
      showToast('Trabajo enviado', 'success');
      closeModal('modal-job-submit');
      statusFilter = 'all';
      $$('#job-filters .filter-chip', root).forEach((chip) => chip.classList.toggle('active', chip.dataset.status === 'all'));
      await refreshQueue();
    } catch (err) {
      if (alive) error.textContent = signal.aborted ? 'Subida cancelada. Los archivos ya guardados permanecen en Mi unidad.' : `No se pudo enviar el trabajo: ${err.message}`;
    } finally {
      controller = null; phase = '';
      controls.forEach((el) => { el.disabled = false; });
      cancel.disabled = false;
    }
  });
  return () => { alive = false; opening += 1; browseVersion += 1; controller?.abort(); closeModal('modal-job-submit'); };
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
  const unbindModal = USE_MOCKS ? initSubmitModal() : initRealSubmitModal();
  await refreshQueue();

  refreshTimer = setInterval(() => { refreshQueue(); refreshDetailFacts(); }, 3000);

  return function unmount() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    if (logUnsubscribe) { logUnsubscribe(); logUnsubscribe = null; }
    if (unbindModal) unbindModal();
    detailVersion += 1;
    selectedJobId = null;
    root = null;
  };
}
