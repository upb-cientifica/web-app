// Identidad del usuario "actual" en modo mock (coincide con MOCK_USER de
// api/users.js). Centralizado aquí porque tanto permisos de archivos
// (api/files.js) como de video (api/videos.js) necesitan calcular acceso
// efectivo contra el mismo usuario/grupos.
export const CURRENT_USER_ID = 'u1';
export const CURRENT_USER_GROUPS = ['g1'];
