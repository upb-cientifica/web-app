// Servidor estático mínimo para Drive Upb — solo Node.js nativo, sin
// dependencias externas ni contenedores. Sirve los archivos estáticos de
// este directorio (index.html, css/, js/, assets/) y existe porque los
// módulos ES (<script type="module">) no cargan por file:// en el
// navegador: requieren un origen http(s), aunque sea local.
//
// Uso:  node server.js  [puerto]   (por defecto 8080)

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl',
};

function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const target = path.join(ROOT, cleaned === '/' ? 'index.html' : cleaned);
  if (!target.startsWith(ROOT)) return null; // fuera del proyecto: no permitido
  return target;
}

const server = http.createServer(async (req, res) => {
  try {
    let filePath = resolveSafePath(req.url === '/' ? '/index.html' : req.url);
    if (!filePath) { res.writeHead(403); res.end('Prohibido'); return; }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      // Rutas de la aplicación (/archivos/Tesis, /fotos…): no son archivos,
      // las resuelve el enrutador del navegador. Lo que sí tiene extensión y
      // no existe es un 404 de verdad.
      if (path.extname(req.url.split('?')[0])) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 - No encontrado');
        return;
      }
      filePath = path.join(ROOT, 'index.html');
      stat = await fs.stat(filePath);
    }

    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 - Error interno: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`Drive Upb sirviendo en http://localhost:${PORT}`);
});
