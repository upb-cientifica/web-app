// Entrega un Blob al usuario como descarga del navegador (cuadro «Guardar como»
// o carpeta de descargas, según su configuración).

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  // El navegador necesita un instante para empezar a leer el Blob antes de soltarlo.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
