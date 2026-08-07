// Conversión entre modo octal ('750') y triadas rwx, estilo Unix.
// Usado por el panel de detalles (editor de permisos) y por js/api/files.js
// para calcular el permiso efectivo del usuario actual.

const BIT_LABELS = ['read', 'write', 'execute'];

export function digitToTriad(digit) {
  const n = Number(digit) || 0;
  return {
    read: !!(n & 4),
    write: !!(n & 2),
    execute: !!(n & 1),
  };
}

export function triadToDigit(triad) {
  return (triad.read ? 4 : 0) | (triad.write ? 2 : 0) | (triad.execute ? 1 : 0);
}

export function triadToRwxString(triad) {
  return (triad.read ? 'r' : '-') + (triad.write ? 'w' : '-') + (triad.execute ? 'x' : '-');
}

// mode: string octal de 3 dígitos, p. ej. '750'
export function modeToTriads(mode) {
  const digits = String(mode).padStart(3, '0').split('').slice(-3);
  return {
    owner: digitToTriad(digits[0]),
    group: digitToTriad(digits[1]),
    others: digitToTriad(digits[2]),
  };
}

export function triadsToMode({ owner, group, others }) {
  return `${triadToDigit(owner)}${triadToDigit(group)}${triadToDigit(others)}`;
}

export function modeToRwxString(mode) {
  const t = modeToTriads(mode);
  return triadToRwxString(t.owner) + triadToRwxString(t.group) + triadToRwxString(t.others);
}

export { BIT_LABELS };
