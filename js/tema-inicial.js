// Aplica el tema guardado antes de que se pinte nada, para que la página no
// aparezca un instante en el tema equivocado. Va como script clásico en el
// <head> (no como módulo, que se ejecutan después) y en archivo aparte porque
// la política de seguridad de la página no admite scripts en línea.
(function () {
  try {
    var t = localStorage.getItem('upb.tema');
    if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light');
    else if (t === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) { /* almacenamiento bloqueado: se sigue al sistema */ }
})();
