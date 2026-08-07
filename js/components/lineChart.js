// Gráfica de líneas minimalista dibujada en <canvas> puro (sin librerías
// externas). Reutilizada por el monitoreo en vivo y los reportes históricos.
//
// series: [{ label, color, values: number[] }]
// labels: string[] (eje X, mismo largo que values)

export function drawLineChart(canvas, { series, labels = [], max = 100, min = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 400;
  const cssHeight = canvas.clientHeight || 200;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 10, right: 12, bottom: 20, left: 32 };
  const w = cssWidth - padding.left - padding.right;
  const h = cssHeight - padding.top - padding.bottom;

  const styles = getComputedStyle(document.documentElement);
  const gridColor = styles.getPropertyValue('--border').trim() || '#e5e7eb';
  const textColor = styles.getPropertyValue('--text-3').trim() || '#5f6368';

  // Ejes / grilla horizontal
  ctx.strokeStyle = gridColor;
  ctx.fillStyle = textColor;
  ctx.font = '11px sans-serif';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i += 1) {
    const y = padding.top + (h / gridLines) * i;
    const value = Math.round(max - ((max - min) / gridLines) * i);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + w, y);
    ctx.stroke();
    ctx.fillText(String(value), 2, y + 3);
  }

  const maxPoints = Math.max(...series.map((s) => s.values.length), 1);
  const stepX = maxPoints > 1 ? w / (maxPoints - 1) : 0;

  series.forEach((s) => {
    if (!s.values.length) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = padding.left + stepX * i;
      const ratio = (v - min) / (max - min || 1);
      const y = padding.top + h - ratio * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // Etiquetas del eje X: primera, media, última
  if (labels.length) {
    ctx.fillStyle = textColor;
    const idxs = [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
    idxs.forEach((i) => {
      if (i < 0 || i >= labels.length) return;
      const x = padding.left + stepX * i;
      ctx.fillText(labels[i], Math.min(Math.max(x - 14, padding.left), padding.left + w - 30), cssHeight - 4);
    });
  }
}
