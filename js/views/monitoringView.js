import { $, $$, esc } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { drawLineChart } from '../components/lineChart.js';
import {
  getSummary, getSeries, getNodes, getServiceStatus,
  listAlertRules, createAlertRule, deleteAlertRule, getTriggeredAlerts, getHistoricalReport,
} from '../api/metrics.js';

const METRIC_LABELS = { cpu: 'CPU', mem: 'Memoria', storage: 'Almacenamiento' };
const CHANNEL_LABELS = { email: 'Correo', slack: 'Slack', sms: 'SMS' };
const SERVICE_LABELS = { web: 'Web', 'autenticación': 'Autenticación', sync: 'Sincronización', 'clúster': 'Clúster', almacenamiento: 'Almacenamiento' };

let root = null;
let refreshTimer = null;

const TEMPLATE = `
  <div class="main-header">
    <div class="main-title-wrap"><h1 class="main-title">Monitoreo del clúster</h1></div>
  </div>

  <div class="monitor-cards" id="monitor-cards">
    <div class="monitor-card"><span class="monitor-card-label">CPU</span><span class="monitor-card-value" id="card-cpu">—</span></div>
    <div class="monitor-card"><span class="monitor-card-label">Memoria</span><span class="monitor-card-value" id="card-mem">—</span></div>
    <div class="monitor-card"><span class="monitor-card-label">Almacenamiento</span><span class="monitor-card-value" id="card-storage">—</span></div>
    <div class="monitor-card"><span class="monitor-card-label">Trabajos activos</span><span class="monitor-card-value" id="card-jobs">—</span></div>
  </div>

  <section class="block">
    <h2 class="block-title">Uso en vivo</h2>
    <div class="monitor-legend">
      <span class="legend-item"><span class="legend-dot legend-dot-cpu"></span>CPU</span>
      <span class="legend-item"><span class="legend-dot legend-dot-mem"></span>Memoria</span>
    </div>
    <div class="monitor-chart-wrap"><canvas id="live-chart"></canvas></div>
  </section>

  <section class="block">
    <h2 class="block-title">Disponibilidad de servicios</h2>
    <div class="service-semaphore" id="service-semaphore"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Nodos del clúster</h2>
    <div id="nodes-table-wrap"></div>
  </section>

  <section class="block">
    <h2 class="block-title">Reportes históricos</h2>
    <div class="report-controls">
      <label class="share-field"><span>Desde</span><input type="date" class="share-select" id="report-from"></label>
      <label class="share-field"><span>Hasta</span><input type="date" class="share-select" id="report-to"></label>
      <button class="btn-primary" id="report-run">Consultar</button>
    </div>
    <div class="monitor-legend">
      <span class="legend-item"><span class="legend-dot legend-dot-cpu"></span>CPU promedio</span>
      <span class="legend-item"><span class="legend-dot legend-dot-mem"></span>Memoria promedio</span>
      <span class="legend-item"><span class="legend-dot legend-dot-storage"></span>Almacenamiento promedio</span>
    </div>
    <div class="monitor-chart-wrap"><canvas id="report-chart"></canvas></div>
    <p class="details-loading" id="report-empty">Elige un rango de fechas y presiona "Consultar".</p>
  </section>

  <section class="block">
    <h2 class="block-title">Alertas</h2>
    <div class="alert-form">
      <label class="share-field">
        <span>Métrica</span>
        <select class="share-select" id="alert-metric">
          <option value="cpu">CPU</option>
          <option value="mem">Memoria</option>
          <option value="storage">Almacenamiento</option>
        </select>
      </label>
      <label class="share-field">
        <span>Umbral (%)</span>
        <input type="number" class="share-select" id="alert-threshold" min="1" max="100" value="80">
      </label>
      <label class="share-field">
        <span>Canal</span>
        <select class="share-select" id="alert-channel">
          <option value="email">Correo</option>
          <option value="slack">Slack</option>
          <option value="sms">SMS</option>
        </select>
      </label>
      <button class="btn-primary" id="alert-add">Crear alerta</button>
    </div>
    <h4 class="details-subtitle">Reglas configuradas</h4>
    <ul class="alert-rules" id="alert-rules"></ul>
    <h4 class="details-subtitle">Alertas activas</h4>
    <ul class="alert-triggered" id="alert-triggered"></ul>
  </section>
`;

function serviceDotClass(status) {
  if (status === 'up') return 'service-dot-up';
  if (status === 'degraded') return 'service-dot-degraded';
  return 'service-dot-down';
}

async function refreshSummaryAndChart() {
  try {
    const summary = await getSummary();
    $('#card-cpu', root).textContent = summary.cpuPct + '%';
    $('#card-mem', root).textContent = summary.memPct + '%';
    $('#card-storage', root).textContent = summary.storagePct + '%';
    $('#card-jobs', root).textContent = summary.activeJobs;

    const points = await getSeries();
    const canvas = $('#live-chart', root);
    if (canvas) {
      drawLineChart(canvas, {
        series: [
          { label: 'CPU', color: '#1a73e8', values: points.map((p) => p.cpuPct) },
          { label: 'Memoria', color: '#ec407a', values: points.map((p) => p.memPct) },
        ],
        labels: points.map((p) => new Date(p.t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
        max: 100, min: 0,
      });
    }
  } catch (err) {
    console.error('No se pudieron actualizar las métricas', err);
  }
}

async function refreshNodes() {
  const wrap = $('#nodes-table-wrap', root);
  try {
    const nodes = await getNodes();
    if (!nodes.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="material-icons">dns</span><p>No hay nodos reportados</p></div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="table-scroll">
        <table class="jobs-table">
          <thead><tr><th>Nodo</th><th>Estado</th><th>CPU</th><th>Memoria</th><th>Trabajos asignados</th></tr></thead>
          <tbody>
            ${nodes.map((n) => `
              <tr>
                <td>${esc(n.name)}</td>
                <td><span class="job-status ${n.status === 'ocupado' ? 'job-status-running' : 'job-status-completed'}">${esc(n.status)}</span></td>
                <td>${n.cpuPct}%</td>
                <td>${n.memPct}%</td>
                <td>${n.jobs.length ? esc(n.jobs.join(', ')) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudo cargar la tabla de nodos.</p>`;
  }
}

async function refreshServices() {
  const wrap = $('#service-semaphore', root);
  try {
    const services = await getServiceStatus();
    wrap.innerHTML = services.map((s) => `
      <div class="service-item">
        <span class="service-dot ${serviceDotClass(s.status)}"></span>
        <span>${esc(SERVICE_LABELS[s.name] || s.name)}</span>
      </div>
    `).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="share-error">No se pudo cargar el estado de servicios.</p>`;
  }
}

async function refreshAlerts() {
  const rulesEl = $('#alert-rules', root);
  const triggeredEl = $('#alert-triggered', root);
  try {
    const [rules, triggered] = await Promise.all([listAlertRules(), getTriggeredAlerts()]);
    rulesEl.innerHTML = rules.length ? rules.map((r) => `
      <li class="alert-rule-item" data-id="${esc(r.id)}">
        <span>${esc(METRIC_LABELS[r.metric] || r.metric)} ≥ ${r.threshold}% → ${esc(CHANNEL_LABELS[r.channel] || r.channel)}</span>
        <button class="icon-btn alert-rule-remove" data-id="${esc(r.id)}" aria-label="Eliminar regla"><span class="material-icons">close</span></button>
      </li>
    `).join('') : '<li class="share-empty">No hay reglas configuradas.</li>';

    triggeredEl.innerHTML = triggered.length ? triggered.map((a) => `
      <li class="alert-triggered-item">
        <span class="material-icons">warning</span>
        <span>${esc(METRIC_LABELS[a.metric] || a.metric)} en ${a.value}% (umbral ${a.threshold}%) — notificando por ${esc(CHANNEL_LABELS[a.channel] || a.channel)}</span>
      </li>
    `).join('') : '<li class="share-empty">Sin alertas activas.</li>';

    $$('.alert-rule-remove', rulesEl).forEach((btn) => {
      btn.addEventListener('click', async () => {
        await deleteAlertRule({ id: btn.dataset.id });
        refreshAlerts();
      });
    });
  } catch (err) {
    rulesEl.innerHTML = `<li class="share-error">No se pudieron cargar las alertas.</li>`;
  }
}

function initAlertForm() {
  $('#alert-add', root).addEventListener('click', async () => {
    const metric = $('#alert-metric', root).value;
    const threshold = $('#alert-threshold', root).value;
    const channel = $('#alert-channel', root).value;
    if (!threshold) { showToast('Ingresa un umbral', 'error'); return; }
    try {
      await createAlertRule({ metric, threshold, channel });
      showToast('Alerta creada', 'success');
      refreshAlerts();
    } catch (err) {
      showToast(err.message || 'No se pudo crear la alerta', 'error');
    }
  });
}

function initReportForm() {
  const runBtn = $('#report-run', root);
  runBtn.addEventListener('click', async () => {
    const from = $('#report-from', root).value;
    const to = $('#report-to', root).value;
    if (!from || !to) { showToast('Selecciona ambas fechas', 'error'); return; }
    if (from > to) { showToast('El rango de fechas es inválido', 'error'); return; }
    runBtn.disabled = true;
    try {
      const rows = await getHistoricalReport({ from, to });
      const empty = $('#report-empty', root);
      const canvas = $('#report-chart', root);
      if (!rows.length) {
        empty.textContent = 'No hay datos para ese rango.';
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');
      drawLineChart(canvas, {
        series: [
          { label: 'CPU', color: '#1a73e8', values: rows.map((r) => r.cpuAvg) },
          { label: 'Memoria', color: '#ec407a', values: rows.map((r) => r.memAvg) },
          { label: 'Almacenamiento', color: '#2e7d32', values: rows.map((r) => r.storageAvg) },
        ],
        labels: rows.map((r) => r.date.slice(5)),
        max: 100, min: 0,
      });
    } catch (err) {
      showToast(err.message || 'No se pudo generar el reporte', 'error');
    } finally {
      runBtn.disabled = false;
    }
  });
}

export async function mount(rootEl) {
  root = rootEl;
  root.innerHTML = TEMPLATE;

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  $('#report-from', root).value = weekAgo.toISOString().slice(0, 10);
  $('#report-to', root).value = today.toISOString().slice(0, 10);

  initAlertForm();
  initReportForm();

  await Promise.all([refreshSummaryAndChart(), refreshNodes(), refreshServices(), refreshAlerts()]);

  refreshTimer = setInterval(() => {
    refreshSummaryAndChart();
    refreshNodes();
    refreshAlerts();
  }, 3000);

  return function unmount() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    root = null;
  };
}
