// Interruptor global: mientras los backends de los compañeros (PHP/SOAP,
// Go/gRPC, Java/RMI) no estén disponibles, cada módulo de js/api/ usa datos
// simulados con esta misma firma de funciones. Cambiar a false cuando haya
// un gateway HTTP real detrás de cada API_BASE.
export const USE_MOCKS = true;

// Rutas base de cada servicio backend, vistas desde este servidor web.
// Ver docs/api-contract.md (fase 3) para el contrato completo.
export const API_BASE = {
  users:   '/api/users',    // gateway REST sobre el servicio SOAP de usuarios (PHP)
  files:   '/api/files',    // Home / permisos / compartición
  photos:  '/api/photos',   // álbum de fotos
  videos:  '/api/videos',   // catálogo y streaming de video
  sync:    '/api/sync',     // gateway REST sobre el servicio gRPC de sincronización (Go)
  jobs:    '/api/jobs',     // gateway REST sobre el servicio RMI del clúster MPI (Java)
  metrics: '/api/metrics',  // monitoreo
};

// Latencia simulada para que los estados de carga sean visibles en modo mock.
export const MOCK_LATENCY_MS = 250;
