// API del dashboard de monitoreo del clúster.
// En modo mock, las métricas fluctúan con el tiempo y los nodos/trabajos
// activos se calculan a partir de los mismos datos de js/api/jobs.js, para
// que monitoreo y la consola MPI cuenten una historia coherente.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, qs } from './client.js';
import { delay, genId, clone } from './mock/helpers.js';
import { alertRules, series, SERIES_MAX_POINTS, seededRandom } from './mock/metricsData.js';
import { jobs, NODE_POOL } from './mock/jobsData.js';

const MOCK_SERVICES_BASE = [
  { name: 'web', status: 'up' },
  { name: 'autenticación', status: 'up' },
  { name: 'sync', status: 'up' },
  { name: 'clúster', status: 'up' },
  { name: 'almacenamiento', status: 'up' },
];

const BASELINE = { cpuPct: 55, memPct: 45, storagePct: 35 };
let lastSummary = { ...BASELINE, activeJobs: 0 };

function jitter(base, spread) {
  const v = base + (Math.random() - 0.5) * spread;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function activeJobsCount() {
  return jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
}

async function getSummaryMock() {
  await delay();
  const runningLoad = jobs.filter((j) => j.status === 'running').length * 6;
  const summary = {
    cpuPct: jitter(BASELINE.cpuPct + runningLoad, 12),
    memPct: jitter(BASELINE.memPct + runningLoad, 10),
    storagePct: jitter(BASELINE.storagePct, 2),
    activeJobs: activeJobsCount(),
  };
  lastSummary = summary;

  series.push({ t: Date.now(), cpuPct: summary.cpuPct, memPct: summary.memPct });
  while (series.length > SERIES_MAX_POINTS) series.shift();

  return clone(summary);
}

async function getSeriesMock() {
  await delay();
  return clone(series);
}

async function getNodesMock() {
  await delay();
  const runningJobs = jobs.filter((j) => j.status === 'running');
  const nodes = NODE_POOL.map((name) => {
    const assignedJob = runningJobs.find((j) => j.assignedNodes.includes(name));
    const busy = !!assignedJob;
    return {
      name,
      status: busy ? 'ocupado' : 'disponible',
      cpuPct: busy ? jitter(75, 20) : jitter(8, 10),
      memPct: busy ? jitter(65, 20) : jitter(12, 10),
      jobs: assignedJob ? [assignedJob.name] : [],
    };
  });
  return clone(nodes);
}

async function getServiceStatusMock() {
  await delay();
  const anyNodeDown = false; // sin backend real que reporte caídas todavía
  const services = MOCK_SERVICES_BASE.map((s) => ({ ...s }));
  if (anyNodeDown) services.find((s) => s.name === 'clúster').status = 'degraded';
  return clone(services);
}

async function listAlertRulesMock() {
  await delay();
  return clone(alertRules);
}

async function createAlertRuleMock({ metric, threshold, channel }) {
  await delay();
  const rule = { id: genId('ar'), metric, threshold: Number(threshold), channel };
  alertRules.push(rule);
  return clone(rule);
}

async function deleteAlertRuleMock({ id }) {
  await delay();
  const idx = alertRules.findIndex((r) => r.id === id);
  if (idx >= 0) alertRules.splice(idx, 1);
}

async function getTriggeredAlertsMock() {
  await delay();
  const values = {
    cpu: lastSummary.cpuPct,
    mem: lastSummary.memPct,
    storage: lastSummary.storagePct,
  };
  return clone(
    alertRules
      .filter((r) => (values[r.metric] ?? 0) >= r.threshold)
      .map((r) => ({ ...r, value: values[r.metric], triggeredAt: new Date().toISOString() }))
  );
}

async function getHistoricalReportMock({ from, to }) {
  await delay();
  const start = new Date(from);
  const end = new Date(to);
  const report = [];
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return report;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const seed = d.getTime() / 86400000;
    report.push({
      date: d.toISOString().slice(0, 10),
      cpuAvg: Math.round(30 + seededRandom(seed) * 55),
      memAvg: Math.round(25 + seededRandom(seed + 0.33) * 50),
      storageAvg: Math.round(20 + seededRandom(seed + 0.66) * 40),
    });
  }
  return report;
}

// ---------- Modo real: contra el Service Bus → Monitoreo y clúster ----------
//
// El resumen mezcla dos servicios que hablan protocolos distintos: las métricas
// de máquina salen del Monitoreo por REST y los trabajos activos del clúster
// por Java RMI. La vista no distingue: para ella todo llega igual del bus.

/** Estado de un servicio vigilado → el vocabulario de la interfaz. */
function aEstado(e) {
  if (e === 'disponible') return 'up';
  if (e === 'caido') return 'down';
  return 'degraded';
}

async function getSummaryReal() {
  const [host, trabajos] = await Promise.all([
    request(`${API_BASE.metrics}/host`),
    request(`${API_BASE.jobs}/trabajos`).catch(() => []),
  ]);
  const activos = (trabajos || []).filter((t) => t.estado === 'EJECUTANDO' || t.estado === 'ENCOLADO').length;
  return {
    cpuPct: Math.max(0, Math.round(host.cpuPct)),
    memPct: Math.max(0, Math.round(host.memoriaPct)),
    storagePct: Math.max(0, Math.round(host.discoPct)),
    activeJobs: activos,
  };
}

// El Monitoreo guarda histórico de disponibilidad, no de CPU y memoria: la
// serie para la gráfica en vivo se acumula aquí, con cada resumen que se pide.
const serie = [];
const MAX_SERIE = 60;

async function getSeriesReal() {
  try {
    const s = await getSummaryReal();
    serie.push({ t: Date.now(), cpuPct: s.cpuPct, memPct: s.memPct });
    while (serie.length > MAX_SERIE) serie.shift();
  } catch { /* si falla una lectura se conserva lo acumulado */ }
  return [...serie];
}

/** Nodos del clúster: llegan del objeto remoto ClusterHpc por RMI. */
async function getNodesReal() {
  const ns = await request(`${API_BASE.jobs}/nodos`).catch(() => []);
  const trabajos = await request(`${API_BASE.jobs}/trabajos`).catch(() => []);
  const enCurso = (trabajos || []).filter((t) => t.estado === 'EJECUTANDO').map((t) => t.nombre);
  return (ns || []).map((n) => ({
    name: n.host,
    status: n.disponible ? (enCurso.length ? 'ocupado' : 'disponible') : 'disponible',
    cpuPct: 0,
    memPct: 0,
    jobs: n.disponible ? enCurso : [],
    slots: n.slots,
  }));
}

async function getServiceStatusReal() {
  const ss = await request(`${API_BASE.metrics}/servicios`);
  return (ss || []).map((s) => ({
    name: s.nombre,
    status: aEstado(s.estado),
    latencyMs: s.latenciaMs,
  }));
}

const METRICA_A_UI = { cpu: 'cpu', memoria: 'mem', disco: 'storage', latencia: 'latencia', disponibilidad: 'disponibilidad' };
const METRICA_A_SERVICIO = { cpu: 'cpu', mem: 'memoria', storage: 'disco' };

async function listAlertRulesReal() {
  const d = await request(`${API_BASE.metrics}/alertas`);
  return (d?.reglas || []).map((r) => ({
    id: r.id,
    metric: METRICA_A_UI[r.metrica] || r.metrica,
    threshold: r.umbral,
    channel: 'email',       // el Monitoreo notifica por su canal de eventos
    severity: r.severidad,
    firing: r.disparada,
  }));
}

const createAlertRuleReal = async ({ metric, threshold }) => {
  await request(`${API_BASE.metrics}/alertas${qs({
    metrica: METRICA_A_SERVICIO[metric] || metric, operador: '>', umbral: threshold,
  })}`, { method: 'POST' });
  return listAlertRulesReal();
};

const deleteAlertRuleReal = ({ id }) =>
  request(`${API_BASE.metrics}/alertas${qs({ id })}`, { method: 'DELETE' });

async function getTriggeredAlertsReal() {
  const d = await request(`${API_BASE.metrics}/alertas`);
  return (d?.eventos || []).filter((e) => e.disparada).map((e) => ({
    id: `${e.reglaId}-${e.instante}`,
    metric: METRICA_A_UI[e.metrica] || e.metrica,
    threshold: e.umbral,
    channel: 'email',
    value: e.valor,
    triggeredAt: new Date(e.instante).toISOString(),
    severity: e.severidad,
    service: e.servicio || null,
  }));
}

/**
 * Reporte histórico. El Monitoreo lo guarda por servicio (disponibilidad y
 * latencia media), no como promedios de CPU por día: se devuelve lo que
 * realmente hay, que es lo que sostiene el informe del proyecto.
 */
async function getHistoricalReportReal({ from, to } = {}) {
  const dias = (() => {
    if (!from || !to) return 7;
    const d = Math.ceil((new Date(to) - new Date(from)) / 86400000);
    return Number.isFinite(d) && d > 0 ? d : 7;
  })();
  const d = await request(`${API_BASE.metrics}/reportes${qs({ dias })}`);
  return (d?.servicios || []).map((s) => ({
    date: `últimos ${d.dias} días`,
    service: s.servicio,
    availabilityPct: s.disponibilidadPct,
    latencyAvgMs: s.latenciaMediaMs,
    samples: s.muestras,
  }));
}

export const getSummary = USE_MOCKS ? getSummaryMock : getSummaryReal;
export const getSeries = USE_MOCKS ? getSeriesMock : getSeriesReal;
export const getNodes = USE_MOCKS ? getNodesMock : getNodesReal;
export const getServiceStatus = USE_MOCKS ? getServiceStatusMock : getServiceStatusReal;
export const listAlertRules = USE_MOCKS ? listAlertRulesMock : listAlertRulesReal;
export const createAlertRule = USE_MOCKS ? createAlertRuleMock : createAlertRuleReal;
export const deleteAlertRule = USE_MOCKS ? deleteAlertRuleMock : deleteAlertRuleReal;
export const getTriggeredAlerts = USE_MOCKS ? getTriggeredAlertsMock : getTriggeredAlertsReal;
export const getHistoricalReport = USE_MOCKS ? getHistoricalReportMock : getHistoricalReportReal;
