import { esc } from '../utils/dom.js';
import { openModal } from './modal.js';
import { USE_MOCKS } from '../config.js';
import { downloadBlob } from '../api/files.js';

// El Shared File Server entrega todo como application/octet-stream; el tipo se
// deduce de la extensión para que el navegador sepa cómo mostrarlo.
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/plain', csv: 'text/plain', json: 'text/plain', log: 'text/plain',
  c: 'text/plain', h: 'text/plain', py: 'text/plain', java: 'text/plain', js: 'text/plain',
  sh: 'text/plain', xml: 'text/plain', yml: 'text/plain', yaml: 'text/plain',
};
const TEXTO_MAX = 200 * 1024;

let urlActual = null;
let turno = 0;

function liberar() {
  if (urlActual) URL.revokeObjectURL(urlActual);
  urlActual = null;
}

function placeholder(icono, texto, cls = '') {
  return `<div class="preview-placeholder">
    <span class="material-icons ${cls}">${icono}</span>
    <p>${esc(texto)}</p>
  </div>`;
}

// item: { id, name, type, meta, date, owner }. typeMeta: { icon, cls } para el ícono genérico.
export async function openPreview(item, typeMeta) {
  if (!item) return;
  const modal = document.getElementById('modal-preview');
  const title = document.getElementById('preview-title');
  const body = document.getElementById('preview-body');
  if (!modal || !title || !body) return;

  title.textContent = item.name;
  liberar();
  const miTurno = ++turno;

  const ext = (item.name.split('.').pop() || '').toLowerCase();
  const mime = MIME[ext] || '';
  const generico = placeholder(typeMeta.icon, `${item.meta || '—'} · ${item.date}`, typeMeta.cls);

  if (USE_MOCKS || !mime) {
    body.innerHTML = generico;
    openModal('modal-preview');
    return;
  }

  body.innerHTML = placeholder('hourglass_empty', 'Cargando vista previa…');
  openModal('modal-preview');

  try {
    const bytes = await downloadBlob(item);
    if (miTurno !== turno) return;   // se abrió otro archivo mientras tanto

    if (mime === 'text/plain') {
      const texto = await bytes.slice(0, TEXTO_MAX).text();
      body.innerHTML = `<pre class="preview-text"></pre>`;
      body.firstElementChild.textContent = texto + (bytes.size > TEXTO_MAX ? '\n…' : '');
      return;
    }

    urlActual = URL.createObjectURL(new Blob([bytes], { type: mime }));
    if (mime.startsWith('image/')) {
      body.innerHTML = `<img alt="${esc(item.name)}" src="${urlActual}">`;
    } else if (mime.startsWith('video/')) {
      body.innerHTML = `<video controls src="${urlActual}"></video>`;
    } else if (mime.startsWith('audio/')) {
      body.innerHTML = `<audio controls src="${urlActual}"></audio>`;
    } else if (mime === 'application/pdf') {
      body.innerHTML = `<iframe class="preview-pdf" title="${esc(item.name)}" src="${urlActual}"></iframe>`;
    } else {
      body.innerHTML = generico;
    }
  } catch (e) {
    if (miTurno !== turno) return;
    body.innerHTML = placeholder('error_outline', `No se pudo cargar la vista previa: ${e.message}`);
  }
}
