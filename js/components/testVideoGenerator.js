// Genera clips de video cortos y reales 100% en el cliente (Canvas +
// MediaRecorder), sin depender de ningún archivo ni servicio externo.
// Sirve como contenido de respaldo del reproductor mientras no exista un
// backend de streaming real. Los clips se cachean por video + calidad.

const QUALITIES = {
  high:   { width: 960, height: 540, label: 'Alta (960×540)' },
  medium: { width: 640, height: 360, label: 'Media (640×360)' },
  low:    { width: 426, height: 240, label: 'Baja (426×240)' },
};

export const QUALITY_ORDER = ['high', 'medium', 'low'];
export function qualityLabel(q) { return (QUALITIES[q] || QUALITIES.medium).label; }

const cache = new Map(); // `${videoId}:${quality}` -> object URL

function pickSupportedMimeType() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((c) => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || '';
}

function drawFrame(ctx, w, h, t, title) {
  const hue = (t * 50) % 360;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue}, 65%, 42%)`);
  grad.addColorStop(1, `hsl(${(hue + 90) % 360}, 65%, 28%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2 + Math.sin(t * 2) * w * 0.22;
  const cy = h / 2 + Math.cos(t * 1.6) * h * 0.18;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.30)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(h * 0.09)}px sans-serif`;
  ctx.fillText(title.slice(0, 40), w / 2, h * 0.48);
  ctx.font = `${Math.round(h * 0.055)}px monospace`;
  ctx.fillText(`${w}×${h} · ${t.toFixed(1)}s`, w / 2, h * 0.62);
}

// Devuelve una URL de objeto reproducible. Genera un clip corto (loopeable
// por el <video>) la primera vez que se pide esa combinación video+calidad.
export function generateTestClip(videoId, quality = 'medium', { durationSeconds = 4, title = '' } = {}) {
  const key = `${videoId}:${quality}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));

  const { width, height } = QUALITIES[quality] || QUALITIES.medium;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const mimeType = pickSupportedMimeType();
  if (!mimeType || !canvas.captureStream) {
    return Promise.reject(new Error('Este navegador no soporta generar video de prueba (MediaRecorder/captureStream).'));
  }

  const stream = canvas.captureStream(25);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        cache.set(key, url);
        resolve(url);
      } catch (err) {
        reject(err);
      }
    };
    recorder.onerror = reject;
    recorder.start();

    const start = performance.now();
    const step = () => {
      const t = (performance.now() - start) / 1000;
      drawFrame(ctx, width, height, t, title);
      if (t < durationSeconds) requestAnimationFrame(step);
      else recorder.stop();
    };
    requestAnimationFrame(step);
  });
}
