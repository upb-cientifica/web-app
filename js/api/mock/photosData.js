// Datos de ejemplo del álbum de fotos (modo mock).

export const collections = [
  { id: 'c1', name: 'Viaje de campo HPC' },
  { id: 'c2', name: 'Equipo de investigación' },
  { id: 'c3', name: 'Laboratorio' },
];

const T = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

export const photos = [
  { id: 'p1',  name: 'Llegada al centro de datos', collectionId: 'c1', tags: ['viaje', 'campus'], dateTaken: T(40) },
  { id: 'p2',  name: 'Sala de servidores',          collectionId: 'c1', tags: ['viaje', 'infraestructura'], dateTaken: T(40) },
  { id: 'p3',  name: 'Cableado de red',              collectionId: 'c1', tags: ['infraestructura'], dateTaken: T(39) },
  { id: 'p4',  name: 'Panorámica del campus',       collectionId: 'c1', tags: ['viaje', 'paisaje'], dateTaken: T(38) },
  { id: 'p5',  name: 'Reunión de equipo',            collectionId: 'c2', tags: ['equipo', 'evento'], dateTaken: T(30) },
  { id: 'p6',  name: 'Retrato — Yolanda',            collectionId: 'c2', tags: ['equipo', 'retrato'], dateTaken: T(30) },
  { id: 'p7',  name: 'Retrato — Carlos',             collectionId: 'c2', tags: ['equipo', 'retrato'], dateTaken: T(29) },
  { id: 'p8',  name: 'Retrato — Mariana',            collectionId: 'c2', tags: ['equipo', 'retrato'], dateTaken: T(29) },
  { id: 'p9',  name: 'Almuerzo de equipo',           collectionId: 'c2', tags: ['equipo', 'evento'], dateTaken: T(28) },
  { id: 'p10', name: 'Pizarra de arquitectura',      collectionId: 'c3', tags: ['laboratorio', 'trabajo'], dateTaken: T(20) },
  { id: 'p11', name: 'Clúster de pruebas',           collectionId: 'c3', tags: ['laboratorio', 'infraestructura'], dateTaken: T(20) },
  { id: 'p12', name: 'Sesión de depuración',         collectionId: 'c3', tags: ['laboratorio', 'trabajo'], dateTaken: T(19) },
  { id: 'p13', name: 'Nodo desarmado',                collectionId: 'c3', tags: ['laboratorio', 'infraestructura'], dateTaken: T(18) },
  { id: 'p14', name: 'Presentación de avances',      collectionId: 'c3', tags: ['laboratorio', 'evento'], dateTaken: T(15) },
  { id: 'p15', name: 'Atardecer en el laboratorio',  collectionId: 'c3', tags: ['paisaje'], dateTaken: T(14) },
  { id: 'p16', name: 'Diagrama de red en pizarra',   collectionId: 'c3', tags: ['laboratorio', 'trabajo'], dateTaken: T(10) },
  { id: 'p17', name: 'Café de equipo',                collectionId: 'c2', tags: ['equipo', 'evento'], dateTaken: T(8) },
  { id: 'p18', name: 'Prueba de estrés en vivo',     collectionId: 'c3', tags: ['laboratorio', 'trabajo'], dateTaken: T(5) },
  { id: 'p19', name: 'Vista del datacenter de noche', collectionId: 'c1', tags: ['viaje', 'paisaje'], dateTaken: T(3) },
  { id: 'p20', name: 'Cierre de sprint',             collectionId: 'c2', tags: ['equipo', 'evento'], dateTaken: T(1) },
];
