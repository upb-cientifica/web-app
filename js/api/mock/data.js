// Datos de ejemplo en memoria para el modo mock de js/api/files.js.
// Misma semilla que tenía el prototipo original, con los campos de
// propiedad/permisos/versiones que necesita el panel de detalles (fase 2.3).

export const STORAGE = { used: 21, total: 1.98 * 1024 }; // 1,98 TB en GB

export const quickAccess = [
  { id: 'f1', name: 'Proyecto Final', icon: 'folder', color: 'c1' },
  { id: 'f2', name: 'Fotos Viaje',    icon: 'image',   color: 'c2' },
  { id: 'f3', name: 'Videos Upb',     icon: 'movie',   color: 'c3' },
  { id: 'f4', name: 'Apuntes',        icon: 'description', color: 'c4' },
  { id: 'f5', name: 'Tesis',          icon: 'school',  color: 'c5' },
  { id: 'f6', name: 'Diseños',        icon: 'palette', color: 'c6' },
];

// Directorio interno de usuarios y grupos (lo expone js/api/users.js).
// Se usa como propietario/grupo de cada item y como destinatarios al compartir.
export const principals = [
  { id: 'u1', type: 'user',  name: 'Yolanda Sánchez', email: 'ysanchez@upb-cientifica.edu' },
  { id: 'u2', type: 'user',  name: 'Carlos Restrepo', email: 'crestrepo@upb-cientifica.edu' },
  { id: 'u3', type: 'user',  name: 'Mariana Gómez',   email: 'mgomez@upb-cientifica.edu' },
  { id: 'u4', type: 'user',  name: 'Julián Torres',   email: 'jtorres@upb-cientifica.edu' },
  { id: 'g1', type: 'group', name: 'Investigadores HPC' },
  { id: 'g2', type: 'group', name: 'Administración' },
  { id: 'g3', type: 'group', name: 'Estudiantes' },
];

export const folders = [
  { id: 'f1', name: 'Proyecto Final',          type: 'folder', meta: '12 elementos',  date: '23 jul 2026', starred: true,  parentId: null, owner: 'u1', group: 'g1', mode: '750' },
  { id: 'f2', name: 'Apuntes Semestre 8',      type: 'folder', meta: '34 elementos',  date: '21 jul 2026', starred: false, parentId: null, owner: 'u1', group: 'g3', mode: '750' },
  { id: 'f3', name: 'Tesis - Drive Upb',       type: 'folder', meta: '8 elementos',   date: '15 jul 2026', starred: true,  parentId: null, owner: 'u1', group: 'g1', mode: '740' },
  { id: 'f4', name: 'Trabajos entregados',     type: 'folder', meta: '21 elementos',  date: '10 jul 2026', starred: false, parentId: null, owner: 'u2', group: 'g3', mode: '770' },
  // Subcarpetas de "Proyecto Final" (f1)
  { id: 'f1a', name: 'Documentación',   type: 'folder', meta: '5 elementos',  date: '22 jul 2026', starred: false, parentId: 'f1', owner: 'u1', group: 'g1', mode: '750' },
  { id: 'f1b', name: 'Código fuente',   type: 'folder', meta: '18 elementos', date: '20 jul 2026', starred: true,  parentId: 'f1', owner: 'u1', group: 'g1', mode: '770' },
  // Subcarpetas de "Apuntes Semestre 8" (f2)
  { id: 'f2a', name: 'Cálculo',         type: 'folder', meta: '9 elementos',  date: '19 jul 2026', starred: false, parentId: 'f2', owner: 'u1', group: 'g3', mode: '750' },
  { id: 'f2b', name: 'Ing. de Software', type: 'folder', meta: '12 elementos', date: '18 jul 2026', starred: false, parentId: 'f2', owner: 'u1', group: 'g3', mode: '750' },
];

export const files = [
  { id: 'a1', name: 'Diagrama ARQUITECTURA.png', type: 'image',  meta: '1.2 MB', date: '23 jul 2026', starred: true,  parentId: null, owner: 'u1', group: 'g1', mode: '644', sizeBytes: 1258291,
    versions: [
      { id: 'a1-v2', label: 'Actual', date: '23 jul 2026', sizeMeta: '1.2 MB', modifiedBy: 'u1' },
      { id: 'a1-v1', label: 'Anterior', date: '10 jul 2026', sizeMeta: '1.1 MB', modifiedBy: 'u3' },
    ] },
  { id: 'a2', name: 'Presentacion DEFENSA.pptx',  type: 'slides', meta: '4.8 MB', date: '23 jul 2026', starred: false, parentId: 'f1', owner: 'u1', group: 'g1', mode: '640', sizeBytes: 5033164,
    versions: [
      { id: 'a2-v1', label: 'Actual', date: '23 jul 2026', sizeMeta: '4.8 MB' },
    ] },
  { id: 'a3', name: 'Plan PROYECTO.xlsx',          type: 'sheet',  meta: '320 KB', date: '22 jul 2026', starred: false, parentId: 'f1', owner: 'u2', group: 'g1', mode: '660', sizeBytes: 327680,
    versions: [
      { id: 'a3-v1', label: 'Actual', date: '22 jul 2026', sizeMeta: '320 KB' },
    ] },
  { id: 'a4', name: 'Documento TESIS.docx',        type: 'doc',    meta: '780 KB', date: '22 jul 2026', starred: true,  parentId: null, owner: 'u1', group: 'g1', mode: '600', sizeBytes: 798720,
    versions: [
      { id: 'a4-v3', label: 'Actual', date: '22 jul 2026', sizeMeta: '780 KB', modifiedBy: 'u1' },
      { id: 'a4-v2', label: 'Anterior', date: '15 jul 2026', sizeMeta: '760 KB', modifiedBy: 'u2' },
      { id: 'a4-v1', label: 'Anterior', date: '2 jul 2026', sizeMeta: '540 KB', modifiedBy: 'u1' },
    ] },
  { id: 'a5', name: 'Video DEMO.mp4',               type: 'video',  meta: '128 MB', date: '20 jul 2026', starred: false, parentId: 'f1', owner: 'u3', group: 'g1', mode: '640', sizeBytes: 134217728,
    versions: [
      { id: 'a5-v1', label: 'Actual', date: '20 jul 2026', sizeMeta: '128 MB' },
    ] },
  { id: 'a6', name: 'Foto Equipo.jpg',              type: 'image',  meta: '2.1 MB', date: '19 jul 2026', starred: false, parentId: 'f1b', owner: 'u4', group: 'g1', mode: '644', sizeBytes: 2202009,
    versions: [
      { id: 'a6-v1', label: 'Actual', date: '19 jul 2026', sizeMeta: '2.1 MB' },
    ] },
  { id: 'a7', name: 'Resultados PRUEBAS.xlsx',     type: 'sheet',  meta: '180 KB', date: '18 jul 2026', starred: false, parentId: 'f2a', owner: 'u1', group: 'g3', mode: '664', sizeBytes: 184320,
    versions: [
      { id: 'a7-v1', label: 'Actual', date: '18 jul 2026', sizeMeta: '180 KB' },
    ] },
];

// Comparticiones puntuales por item: { [itemId]: [{ id, principalId, role }] }
export const shares = {
  a4: [{ id: 'sh1', principalId: 'u2', role: 'viewer' }],
  f1: [{ id: 'sh2', principalId: 'g3', role: 'viewer' }],
};

// Enlaces externos por item: { [itemId]: [{ id, role, expiresAt, token }] }
export const externalLinks = {};
