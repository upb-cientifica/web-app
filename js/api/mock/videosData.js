// Catálogo de videos de ejemplo (modo mock).
// requiredGroup: si está presente, solo los usuarios de ese grupo pueden
// reproducir el video (para probar el mensaje de acceso denegado).

const D = (days) => new Date(Date.now() - days * 86400000).toISOString();

export const videos = [
  { id: 'v1', title: 'Recorrido por el centro de datos', durationSeconds: 245, uploadedAt: D(30), requiredGroup: null },
  { id: 'v2', title: 'Demo: envío de un trabajo MPI',     durationSeconds: 180, uploadedAt: D(25), requiredGroup: null },
  { id: 'v3', title: 'Charla: arquitectura del clúster',  durationSeconds: 1520, uploadedAt: D(20), requiredGroup: null },
  { id: 'v4', title: 'Sesión de onboarding — equipo',     durationSeconds: 640, uploadedAt: D(15), requiredGroup: null },
  { id: 'v5', title: 'Informe financiero trimestral',     durationSeconds: 410, uploadedAt: D(10), requiredGroup: 'g2' },
  { id: 'v6', title: 'Auditoría de seguridad interna',    durationSeconds: 300, uploadedAt: D(6),  requiredGroup: 'g2' },
  { id: 'v7', title: 'Resultados: análisis genómico batch-07', durationSeconds: 95, uploadedAt: D(3), requiredGroup: null },
  { id: 'v8', title: 'Tutorial: compilar con MPI',        durationSeconds: 520, uploadedAt: D(1),  requiredGroup: null },
];
