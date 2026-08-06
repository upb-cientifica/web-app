// Atajos DOM + escape de texto para render seguro con innerHTML.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESCAPE_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
