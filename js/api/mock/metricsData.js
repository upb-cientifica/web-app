// Estado en memoria para el dashboard de monitoreo (modo mock).

export const alertRules = [
  { id: 'ar1', metric: 'cpu', threshold: 85, channel: 'email' },
];

// Ventana móvil de muestras para la gráfica en vivo (CPU/Memoria %).
export const series = [];
export const SERIES_MAX_POINTS = 30;

// Reproducibilidad simple para el reporte histórico (mismo rango -> mismos valores).
export function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
