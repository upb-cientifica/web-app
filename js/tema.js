// Tema claro/oscuro de la aplicación web.
//
// Tres opciones, las mismas que en móvil y escritorio: seguir al sistema, o
// fijar claro u oscuro. La elección se guarda en este navegador; es una
// preferencia de quien mira, no un dato de la cuenta.

const CLAVE = 'upb.tema';
export const TEMAS = [
  { valor: 'sistema', nombre: 'Como el sistema', icono: 'brightness_auto' },
  { valor: 'claro',   nombre: 'Claro',           icono: 'light_mode' },
  { valor: 'oscuro',  nombre: 'Oscuro',          icono: 'dark_mode' },
];

export function temaActual() {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.setAttribute('data-theme', 'light');
  else if (tema === 'oscuro') raiz.setAttribute('data-theme', 'dark');
  else raiz.removeAttribute('data-theme');
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, tema);
  } catch { /* sin almacenamiento: dura hasta recargar */ }
}
