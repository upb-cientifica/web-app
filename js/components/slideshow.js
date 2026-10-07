import { $, $$ } from '../utils/dom.js';
import { trapFocus } from '../utils/focusTrap.js';
import { photoDataUri } from '../utils/placeholderImage.js';

let cerrarActual = null;

export function closeSlideshow() { cerrarActual?.(); }

export function openSlideshow(photos, inicio = 0) {
  closeSlideshow();
  if (!photos.length) return;
  const fotos = [...photos];
  const overlay = document.createElement('div');
  overlay.className = 'photo-slideshow';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Presentación de fotos');
  overlay.innerHTML = `
    <div class="slideshow-stage"><img class="slideshow-image" alt=""><img class="slideshow-image" alt=""></div>
    <div class="slideshow-bar">
      <div class="slideshow-caption"><span class="slideshow-title"></span><span class="slideshow-count"></span></div>
      <div class="slideshow-controls">
        <button class="icon-btn" data-accion="anterior" aria-label="Foto anterior"><span class="material-icons">chevron_left</span></button>
        <button class="icon-btn" data-accion="pausa" aria-label="Pausar presentación"><span class="material-icons">pause</span></button>
        <button class="icon-btn" data-accion="siguiente" aria-label="Foto siguiente"><span class="material-icons">chevron_right</span></button>
        <button class="icon-btn" data-accion="cerrar" aria-label="Cerrar presentación"><span class="material-icons">close</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const imagenes = $$('.slideshow-image', overlay);
  let indice = Math.min(Math.max(0, inicio), photos.length - 1);
  let capa = 1;
  let version = 0;
  let cerrado = false;
  let reproduciendo = true;
  let pantallaCompleta = false;
  let temporizador;
  let precarga = new Image();
  const liberarFoco = trapFocus(overlay);

  function programar() {
    clearTimeout(temporizador);
    if (reproduciendo && fotos.length > 1) temporizador = setTimeout(() => avanzar(1), 5000);
  }
  function pintar() {
    const turno = ++version;
    const foto = fotos[indice];
    const siguienteCapa = 1 - capa;
    const imagen = imagenes[siguienteCapa];
    clearTimeout(temporizador);
    imagen.onload = () => {
      if (cerrado || turno !== version) return;
      imagenes[capa].classList.remove('visible');
      imagenes[capa].setAttribute('aria-hidden', 'true');
      imagen.classList.add('visible');
      imagen.removeAttribute('aria-hidden');
      capa = siguienteCapa;
      $('.slideshow-title', overlay).textContent = foto.name;
      $('.slideshow-count', overlay).textContent = `${indice + 1} / ${fotos.length}`;
      programar();
    };
    imagen.onerror = () => {
      imagen.onerror = null;
      imagen.src = photoDataUri(foto.id, foto.name);
    };
    imagen.alt = foto.name;
    imagen.src = foto.url || photoDataUri(foto.id, foto.name);
    const siguiente = fotos[(indice + 1) % fotos.length];
    precarga.src = siguiente.url || photoDataUri(siguiente.id, siguiente.name);
  }
  function avanzar(paso) { indice = (indice + paso + fotos.length) % fotos.length; pintar(); }
  function alternar() {
    reproduciendo = !reproduciendo;
    const boton = $('[data-accion="pausa"]', overlay);
    boton.setAttribute('aria-label', reproduciendo ? 'Pausar presentación' : 'Reanudar presentación');
    $('.material-icons', boton).textContent = reproduciendo ? 'pause' : 'play_arrow';
    programar();
  }
  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    document.removeEventListener('keydown', teclado, true);
    document.removeEventListener('fullscreenchange', cambioPantalla);
    imagenes.forEach((imagen) => { imagen.onload = null; imagen.onerror = null; });
    precarga = null;
    if (document.fullscreenElement === overlay) document.exitFullscreen?.().catch(() => {});
    overlay.remove();
    liberarFoco();
    if (cerrarActual === cerrar) cerrarActual = null;
  }
  function teclado(e) {
    if (!['ArrowLeft', 'ArrowRight', ' ', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') cerrar();
    else if (e.key === ' ') alternar();
    else avanzar(e.key === 'ArrowRight' ? 1 : -1);
  }
  function cambioPantalla() {
    if (document.fullscreenElement === overlay) pantallaCompleta = true;
    else if (pantallaCompleta) cerrar();
  }
  $('[data-accion="anterior"]', overlay).addEventListener('click', () => avanzar(-1));
  $('[data-accion="siguiente"]', overlay).addEventListener('click', () => avanzar(1));
  $('[data-accion="pausa"]', overlay).addEventListener('click', alternar);
  $('[data-accion="cerrar"]', overlay).addEventListener('click', cerrar);
  document.addEventListener('keydown', teclado, true);
  document.addEventListener('fullscreenchange', cambioPantalla);
  cerrarActual = cerrar;
  pintar();
  // La superposición fija también funciona si el navegador rechaza pantalla completa.
  try {
    overlay.requestFullscreen?.().then(() => {
      if (cerrado && document.fullscreenElement === overlay) document.exitFullscreen?.().catch(() => {});
    }).catch(() => {});
  } catch { /* Navegador sin soporte de pantalla completa. */ }
}
