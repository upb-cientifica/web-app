// Trampa de foco reutilizable para modales y overlays a pantalla completa:
// mantiene el Tab dentro del contenedor y devuelve el foco a quien lo tenía
// antes de abrir, al cerrar.

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => el.offsetParent !== null);
}

export function trapFocus(container) {
  const previouslyFocused = document.activeElement;
  const focusables = getFocusable(container);
  (focusables[0] || container).focus();

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = getFocusable(container);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);

  return function releaseFocus() {
    container.removeEventListener('keydown', onKeydown);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };
}
