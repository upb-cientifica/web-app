// Configuración de la capa de datos.
//
// La SPA no habla con cada servicio por separado: todo su tránsito entra por el
// **Service Bus**, que resuelve dónde vive cada servicio, autoriza con el claim
// del JWT y media el protocolo (SOAP, Java RMI o REST). Es la columna
// "Service bus" de la Figura 1 del enunciado.

// true  → datos simulados en memoria (js/api/mock/*), para trabajar sin backend
// false → llamadas reales contra el bus
export const USE_MOCKS = false;

// Dirección del bus. Se toma de <meta name="bus-url"> en index.html para poder
// cambiarla al desplegar sin tocar el código; si no está, se asume que el bus
// corre en el mismo host que sirve la SPA, en el puerto 8099.
const metaBus = document.querySelector('meta[name="bus-url"]')?.content?.trim();
export const BUS_URL = metaBus || `${location.protocol}//${location.hostname}:8099/bus`;

// Cada entrada es el **código de servicio** tal como está registrado en el bus
// y como viaja en el claim `servicios` del JWT.
export const API_BASE = {
  users:   `${BUS_URL}/usuarios`,     // SOAP (PHP) — el bus arma el sobre y traduce a JSON
  files:   `${BUS_URL}/shared_file`,  // REST — Home, cuotas, permisos Unix, versiones
  photos:  `${BUS_URL}/photo_album`,  // REST — álbumes e imágenes del Home
  videos:  `${BUS_URL}/streaming`,    // REST + HLS — difusión de video
  sync:    `${BUS_URL}/file_sync`,    // gRPC — el bus lo publica, no lo media
  jobs:    `${BUS_URL}/hpc`,          // Java RMI — el bus invoca el objeto remoto
  metrics: `${BUS_URL}/monitoreo`,    // REST — disponibilidad, métricas y alertas
};

// Dominio que se añade cuando el usuario escribe sólo su nombre de cuenta.
export const DOMINIO_CORREO = 'upb.edu.co';

// Latencia simulada para que los estados de carga sean visibles en modo mock.
export const MOCK_LATENCY_MS = 250;
