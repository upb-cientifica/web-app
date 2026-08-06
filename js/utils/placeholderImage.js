// Genera imágenes de muestra 100% locales (SVG como data URI) para el
// álbum de fotos, ya que no hay archivos reales ni se permite ningún
// servicio externo de imágenes. Una sola imagen vectorial sirve tanto
// para la miniatura como para el visor a pantalla completa.

const PALETTE = [
  ['#4a90e2', '#357abd'], ['#7e57c2', '#5e35c1'], ['#ec407a', '#c2185b'],
  ['#26a69a', '#00796b'], ['#ec8e3e', '#d97706'], ['#6a8caf', '#4a6885'],
  ['#43a047', '#2e7d32'], ['#8d6e63', '#5d4037'],
];

function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function photoDataUri(seed, label = '') {
  const h = hashSeed(seed);
  const [c1, c2] = PALETTE[h % PALETTE.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${c1}"/>
          <stop offset="1" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#g)"/>
      <circle cx="${80 + (h % 60)}" cy="${60 + (h % 40)}" r="34" fill="rgba(255,255,255,.18)"/>
      <path d="M60 230 L150 150 L210 200 L260 140 L340 230 Z" fill="rgba(255,255,255,.16)"/>
      <text x="200" y="285" font-family="sans-serif" font-size="14" fill="rgba(255,255,255,.85)" text-anchor="middle">${label.replace(/[<>&]/g, '')}</text>
    </svg>
  `.trim();
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
