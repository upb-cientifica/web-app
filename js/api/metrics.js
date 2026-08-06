// API del dashboard de monitoreo del clúster.
// En modo mock, las métricas fluctúan con el tiempo y los nodos/trabajos
// activos se calculan a partir de los mismos datos de js/api/jobs.js, para
// que monitoreo y la consola MPI cuenten una historia coherente.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request } from './client.js';
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

// ---------- Modo real (backend HTTP aún no disponible) ----------

const getSummaryReal = () => request(`${API_BASE.metrics}/summary`);
const getSeriesReal = () => request(`${API_BASE.metrics}/series`);
const getNodesReal = () => request(`${API_BASE.metrics}/nodes`);
const getServiceStatusReal = () => request(`${API_BASE.metrics}/services`);
const listAlertRulesReal = () => request(`${API_BASE.metrics}/alert-rules`);
const createAlertRuleReal = (payload) => request(`${API_BASE.metrics}/alert-rules`, { method: 'POST', body: payload });
const deleteAlertRuleReal = ({ id }) => request(`${API_BASE.metrics}/alert-rules/${id}`, { method: 'DELETE' });
const getTriggeredAlertsReal = () => request(`${API_BASE.metrics}/alerts/triggered`);
const getHistoricalReportReal = ({ from, to }) => request(`${API_BASE.metrics}/reports?from=${from}&to=${to}`);

export const getSummary = USE_MOCKS ? getSummaryMock : getSummaryReal;
export const getSeries = USE_MOCKS ? getSeriesMock : getSeriesReal;
export const getNodes = USE_MOCKS ? getNodesMock : getNodesReal;
export const getServiceStatus = USE_MOCKS ? getServiceStatusMock : getServiceStatusReal;
export const listAlertRules = USE_MOCKS ? listAlertRulesMock : listAlertRulesReal;
export const createAlertRule = USE_MOCKS ? createAlertRuleMock : createAlertRuleReal;
export const deleteAlertRule = USE_MOCKS ? deleteAlertRuleMock : deleteAlertRuleReal;
export const getTriggeredAlerts = USE_MOCKS ? getTriggeredAlertsMock : getTriggeredAlertsReal;
export const getHistoricalReport = USE_MOCKS ? getHistoricalReportMock : getHistoricalReportReal;
