// Cola de trabajos MPI en memoria (modo mock) + pool de nodos del clúster.

export const NODE_POOL = Array.from({ length: 8 }, (_, i) => `nodo${String(i + 1).padStart(2, '0')}`);

function pickNodes(count) {
  return NODE_POOL.slice(0, Math.min(count, NODE_POOL.length));
}

// j1 se muestra "en ejecución" desde el primer instante en que carga la app;
// su hora de inicio se calcula relativa al momento real de carga (y no a una
// fecha ficticia fija) para que el tiempo transcurrido tenga sentido cuando
// la simulación en vivo calcule su duración con el reloj real del sistema.
const J1_STARTED_AT = new Date(Date.now() - 90 * 1000).toISOString();

export const jobs = [
  {
    id: 'j1', name: 'Simulación CFD', status: 'running',
    processes: 32, nodes: 4, timeLimitMinutes: 60,
    envVars: [{ key: 'OMP_NUM_THREADS', value: '4' }],
    sourceFileName: 'cfd_solver.c', datasetFileName: 'malla_v3.dat',
    submittedAt: J1_STARTED_AT, startedAt: J1_STARTED_AT, completedAt: null,
    assignedNodes: pickNodes(4),
    log: [
      '[09:00:20] Asignando 4 nodos: ' + pickNodes(4).join(', '),
      '[09:00:21] Compilando cfd_solver.c...',
      '[09:00:24] Compilación exitosa.',
      '[09:00:25] mpirun -np 32 ./cfd_solver malla_v3.dat',
      '[09:00:26] Iteración 1/500 — residual 1.2e-2',
    ],
  },
  {
    id: 'j2', name: 'Entrenamiento red neuronal', status: 'queued',
    processes: 16, nodes: 2, timeLimitMinutes: 120,
    envVars: [],
    sourceFileName: 'train.py', datasetFileName: 'dataset_upb.csv',
    submittedAt: '2026-08-04T09:30:00', startedAt: null, completedAt: null,
    assignedNodes: [],
    log: ['[09:30:00] Trabajo encolado, esperando nodos disponibles...'],
  },
  {
    id: 'j3', name: 'Análisis genómico batch-07', status: 'completed',
    processes: 64, nodes: 8, timeLimitMinutes: 180,
    envVars: [{ key: 'GENOME_REF', value: 'grch38' }],
    sourceFileName: 'align.c', datasetFileName: 'reads_batch07.fastq',
    submittedAt: '2026-08-03T14:00:00', startedAt: '2026-08-03T14:00:30', completedAt: '2026-08-03T15:42:10',
    assignedNodes: pickNodes(8),
    log: [
      '[14:00:30] Asignando 8 nodos: ' + pickNodes(8).join(', '),
      '[14:00:35] mpirun -np 64 ./align reads_batch07.fastq',
      '[15:41:50] Alineamiento completado: 98.7% de lecturas mapeadas.',
      '[15:42:10] Trabajo finalizado con éxito.',
    ],
  },
  {
    id: 'j4', name: 'Prueba de estrés MPI', status: 'failed',
    processes: 128, nodes: 8, timeLimitMinutes: 10,
    envVars: [],
    sourceFileName: 'stress.c', datasetFileName: '—',
    submittedAt: '2026-08-02T11:00:00', startedAt: '2026-08-02T11:00:15', completedAt: '2026-08-02T11:03:40',
    assignedNodes: pickNodes(8),
    log: [
      '[11:00:15] Asignando 8 nodos: ' + pickNodes(8).join(', '),
      '[11:00:20] mpirun -np 128 ./stress',
      '[11:03:38] ERROR: se excedió la memoria disponible en nodo03.',
      '[11:03:40] Trabajo terminado con error (código 137).',
    ],
  },
];
