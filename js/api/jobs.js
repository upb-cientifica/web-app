// API de trabajos MPI, contra el gateway del servicio RMI de Java.
// En modo mock, simula el ciclo de vida real de un trabajo (encolado ->
// ejecutando -> completado/fallido) con temporizadores locales, y expone
// subscribeJobLog() con el mismo contrato que tendría una versión real
// basada en EventSource: recibe líneas nuevas por callback y devuelve
// una función para cancelar la suscripción.

import { USE_MOCKS, API_BASE } from '../config.js';
import { request, qs } from './client.js';
import { delay, genId, clone } from './mock/helpers.js';
import { jobs, NODE_POOL } from './mock/jobsData.js';

const logListeners = new Map(); // jobId -> Set<fn>
const runningTimers = new Map(); // jobId -> { queueTimer, logTimer, finishTimer }

function notifyLog(jobId, line) {
  const set = logListeners.get(jobId);
  if (set) set.forEach((fn) => fn(line));
}

function clearJobTimers(jobId) {
  const t = runningTimers.get(jobId);
  if (!t) return;
  clearTimeout(t.queueTimer);
  clearInterval(t.logTimer);
  clearTimeout(t.finishTimer);
  runningTimers.delete(jobId);
}

function pickNodes(count) {
  const shuffled = [...NODE_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, NODE_POOL.length));
}

const PROGRESS_MESSAGES = [
  'Sincronizando datos entre nodos...',
  'Iteración en curso, residual descendiendo.',
  'Checkpoint guardado.',
  'Balanceando carga entre procesos.',
  'Comunicación MPI: intercambio de fronteras completado.',
];

function beginRunning(job) {
  if (job.assignedNodes.length === 0) {
    job.assignedNodes = pickNodes(job.nodes);
    const line = `[${new Date().toLocaleTimeString('es-CO')}] Asignando ${job.nodes} nodos: ${job.assignedNodes.join(', ')}`;
    job.log.push(line);
    notifyLog(job.id, line);
  }

  const logTimer = setInterval(() => {
    const msg = PROGRESS_MESSAGES[Math.floor(Math.random() * PROGRESS_MESSAGES.length)];
    const l = `[${new Date().toLocaleTimeString('es-CO')}] ${msg}`;
    job.log.push(l);
    notifyLog(job.id, l);
  }, 3000);

  const finishTimer = setTimeout(() => {
    clearInterval(logTimer);
    const failed = job.processes > 96; // regla simple para variar el demo
    job.status = failed ? 'failed' : 'completed';
    job.completedAt = new Date().toISOString();
    const l = failed
      ? `[${new Date().toLocaleTimeString('es-CO')}] ERROR: el trabajo terminó con fallas.`
      : `[${new Date().toLocaleTimeString('es-CO')}] Trabajo finalizado con éxito.`;
    job.log.push(l);
    notifyLog(job.id, l);
    runningTimers.delete(job.id);
  }, 18000);

  runningTimers.set(job.id, { queueTimer: null, logTimer, finishTimer });
}

function startSimulation(job) {
  clearJobTimers(job.id);

  if (job.status === 'running') {
    beginRunning(job);
    return;
  }

  const queueTimer = setTimeout(() => {
    if (job.status !== 'queued') return;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    beginRunning(job);
  }, 4000);

  runningTimers.set(job.id, { queueTimer, logTimer: null, finishTimer: null });
}

// Reanuda la simulación de los trabajos semilla que ya estaban "en cola"/"ejecutando".
jobs.filter((j) => j.status === 'queued' || j.status === 'running').forEach((j) => startSimulation(j));

// ---------- Modo mock ----------

async function listJobsMock({ status } = {}) {
  await delay();
  const items = status && status !== 'all' ? jobs.filter((j) => j.status === status) : jobs;
  return clone([...items].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
}

async function getJobMock({ id }) {
  await delay();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error('Trabajo no encontrado');
  return clone(job);
}

async function submitJobMock(payload) {
  await delay();
  const job = {
    id: genId('j'),
    name: payload.name || 'Trabajo sin título',
    status: 'queued',
    processes: Number(payload.processes) || 1,
    nodes: Number(payload.nodes) || 1,
    timeLimitMinutes: Number(payload.timeLimitMinutes) || 60,
    envVars: payload.envVars || [],
    sourceFileName: payload.sourceFileName || '—',
    datasetFileName: payload.datasetFileName || '—',
    submittedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    assignedNodes: [],
    log: [`[${new Date().toLocaleTimeString('es-CO')}] Trabajo encolado, esperando nodos disponibles...`],
  };
  jobs.unshift(job);
  startSimulation(job);
  return clone(job);
}

async function cancelJobMock({ id }) {
  await delay();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error('Trabajo no encontrado');
  if (job.status !== 'queued' && job.status !== 'running') return clone(job);
  clearJobTimers(id);
  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  const line = `[${new Date().toLocaleTimeString('es-CO')}] Trabajo cancelado por el usuario.`;
  job.log.push(line);
  notifyLog(id, line);
  return clone(job);
}

function subscribeJobLogMock({ id, onLine }) {
  if (!logListeners.has(id)) logListeners.set(id, new Set());
  logListeners.get(id).add(onLine);
  return () => {
    const set = logListeners.get(id);
    if (set) set.delete(onLine);
  };
}

// ---------- Modo real: contra el Service Bus → clúster HPC (Java RMI) ----------
//
// El bus convierte estas llamadas REST en invocaciones sobre el objeto remoto
// ClusterHpc. La interfaz no sabe que al otro lado hay RMI.

const ESTADOS = {
  ENCOLADO: 'queued',
  EJECUTANDO: 'running',
  COMPLETADO: 'completed',
  FALLIDO: 'failed',
  CANCELADO: 'cancelled',
};

/** TrabajoInfo del clúster → Job de la interfaz. */
function aJob(t, log = []) {
  return {
    id: t.id,
    name: t.nombre,
    status: ESTADOS[t.estado] || 'queued',
    processes: t.procesos,
    nodes: 0,
    timeLimitMinutes: 0,
    envVars: [],
    sourceFileName: t.comando || '',
    datasetFileName: t.rutaHome || '',
    submittedAt: t.creadoEn,
    startedAt: t.estado === 'ENCOLADO' ? null : t.creadoEn,
    // El clúster reporta la duración en segundos; la vista la deduce de las
    // marcas de inicio y fin, así que se reconstruye el fin a partir de ella.
    completedAt: ['COMPLETADO', 'FALLIDO', 'CANCELADO'].includes(t.estado) && t.creadoEn
      ? new Date(new Date(t.creadoEn).getTime() + (t.duracionSeg || 0) * 1000).toISOString()
      : null,
    assignedNodes: [],
    log,
    // Extras del clúster que la interfaz puede aprovechar.
    progress: t.progreso,
    exitCode: t.codigoSalida,
    message: t.mensaje,
    durationSeconds: t.duracionSeg,
    owner: t.propietario,
  };
}

async function listJobsReal({ status } = {}) {
  const ts = await request(`${API_BASE.jobs}/trabajos`);
  const jobs = (ts || []).map((t) => aJob(t));
  return !status || status === 'all' ? jobs : jobs.filter((j) => j.status === status);
}

const getJobReal = async ({ id }) => {
  const [t, s] = await Promise.all([
    request(`${API_BASE.jobs}/trabajos/${encodeURIComponent(id)}`),
    request(`${API_BASE.jobs}/trabajos/${encodeURIComponent(id)}/salida`).catch(() => ({ salida: '' })),
  ]);
  return aJob(t, (s?.salida || '').split('\n').filter(Boolean));
};

/**
 * El clúster recibe un ejecutable con sus argumentos, como espera `mpirun`, y
 * la ruta del Home de donde traer el código y los datasets.
 */
async function submitJobReal({ name, processes = 1, sourceFileName, datasetFileName } = {}) {
  if (!sourceFileName) throw new Error('Indica el programa a ejecutar');
  const { id } = await request(`${API_BASE.jobs}/trabajos${qs({
    nombre: name, comando: sourceFileName, procesos: processes, rutaHome: datasetFileName,
  })}`, { method: 'POST' });
  return getJobReal({ id });
}

const cancelJobReal = async ({ id }) => {
  await request(`${API_BASE.jobs}/trabajos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return getJobReal({ id });
};

/**
 * El clúster no publica el log por SSE: se consulta su salida acumulada. Aquí
 * se sondea y sólo se emiten las líneas nuevas, de modo que la vista recibe el
 * mismo goteo que esperaba del EventSource.
 */
function subscribeJobLogReal({ id, onLine }) {
  let vistas = 0;
  let vivo = true;
  const tick = async () => {
    if (!vivo) return;
    try {
      const s = await request(`${API_BASE.jobs}/trabajos/${encodeURIComponent(id)}/salida`);
      const lineas = (s?.salida || '').split('\n').filter(Boolean);
      for (let i = vistas; i < lineas.length; i += 1) onLine(lineas[i]);
      vistas = lineas.length;
    } catch { /* el trabajo puede haber desaparecido */ }
  };
  tick();
  const timer = setInterval(tick, 2000);
  return () => { vivo = false; clearInterval(timer); };
}

/** Inventario de nodos del clúster, por RMI. */
const listNodesReal = () => request(`${API_BASE.jobs}/nodos`);

export const listJobs = USE_MOCKS ? listJobsMock : listJobsReal;
export const getJob = USE_MOCKS ? getJobMock : getJobReal;
export const submitJob = USE_MOCKS ? submitJobMock : submitJobReal;
export const cancelJob = USE_MOCKS ? cancelJobMock : cancelJobReal;
export const subscribeJobLog = USE_MOCKS ? subscribeJobLogMock : subscribeJobLogReal;
export const listNodes = USE_MOCKS ? (async () => []) : listNodesReal;
