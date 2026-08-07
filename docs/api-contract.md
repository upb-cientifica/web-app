# Contrato de API — Drive Upb (frontend)

Este documento describe **todos los endpoints que el frontend consume**, con el método HTTP, los parámetros esperados y la forma de la respuesta. Es el contrato que cada equipo de backend (PHP/SOAP, Go/gRPC, Java/RMI) debe implementar detrás de su gateway REST para que `USE_MOCKS = false` funcione sin cambiar el código del frontend.

Convenciones generales:
- Todas las rutas son relativas al origen del servidor web (`API_BASE` en [`js/config.js`](../js/config.js)).
- Cuerpos de petición y respuesta son JSON (`Content-Type: application/json`), salvo que se indique otra cosa.
- Los errores deben responder con un código HTTP de error (4xx/5xx) y, si es posible, un cuerpo `{ "message": "..." }` — el cliente (`js/api/client.js`) lo usa para mostrar el error al usuario.
- `204 No Content` es válido para operaciones sin cuerpo de respuesta (el cliente lo trata como éxito con `null`).
- Los campos marcados como *(mock)* documentan la forma actual del dato simulado; el backend real debe respetar esa misma forma para que la UI no necesite cambios.

---

## 1. Usuarios y sesión — `js/api/users.js`

Base: `API_BASE.users` = `/api/users`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Iniciar sesión (paso 1) | POST | `/api/users/login` | `{ username, password }` | `{ mfaRequired: true, challengeId }` |
| Verificar TOTP (paso 2) | POST | `/api/users/mfa/verify` | `{ challengeId, code }` | `{ token, expiresInSeconds, user }` — `user`: `{ id, name, email, role, quotaUsedGB, quotaTotalGB }` |
| Refrescar token | POST | `/api/users/token/refresh` | — (requiere header de auth) | `{ token, expiresInSeconds }` |
| Usuario actual | GET | `/api/users/me` | — | mismo objeto `user` de arriba |
| Cerrar sesión | POST | `/api/users/logout` | — | `204` |
| Enrolar MFA | POST | `/api/users/mfa/enroll` | — | `{ secret, otpauthUrl, backupCodes: string[] }` |
| Directorio de usuarios/grupos | GET | `/api/users/principals?q=` | query `q` (búsqueda opcional) | `[{ id, type: 'user'\|'group', name, email? }]` |

`role` es `'admin'` o `'user'`; la ruta `/admin` del frontend exige `role === 'admin'`.

---

## 2. Archivos, permisos y compartición — `js/api/files.js`

Base: `API_BASE.files` = `/api/files`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Listar items | GET | `/api/files/items` | query: `section`, `parentId`, `type`, `q` | `{ folders: Item[], files: Item[] }` |
| Acceso rápido | GET | `/api/files/quick-access` | — | `[{ id, name, icon, color }]` |
| Uso de almacenamiento | GET | `/api/files/storage` | — | `{ used: number, total: number }` (GB) |
| Crear carpeta | POST | `/api/files/folders` | `{ name, parentId }` | `Item` (carpeta creada) |
| Crear archivo (uso interno, p. ej. resultados de un trabajo MPI) | POST | `/api/files/items` | `{ name, parentId, type, meta }` | `Item` |
| Renombrar | PATCH | `/api/files/items/:id` | `{ name }` | `Item` |
| Alternar destacado | POST | `/api/files/items/:id/star` | — | `Item` |
| Eliminar | DELETE | `/api/files/items/:id` | — | `204` |
| Detalles de un item | GET | `/api/files/items/:id/details` | — | `Item & { ownerPrincipal, groupPrincipal, effectivePermission: {read,write,execute}, versions: Version[] }` |
| Actualizar permisos | PATCH | `/api/files/items/:id/permissions` | `{ owner?, group?, mode }` (mode: octal de 3 dígitos, p. ej. `"750"`) | `Item` |
| Listar comparticiones | GET | `/api/files/items/:id/shares` | — | `[{ id, principalId, role: 'viewer'\|'editor', principal }]` |
| Compartir con usuario/grupo | POST | `/api/files/items/:id/shares` | `{ principalId, role }` | share creado/actualizado |
| Revocar compartición | DELETE | `/api/files/items/:id/shares/:shareId` | — | `204` |
| Listar enlaces externos | GET | `/api/files/items/:id/links` | — | `[{ id, role, expiresAt, token }]` |
| Crear enlace externo | POST | `/api/files/items/:id/links` | `{ role, expiresAt }` | enlace creado |
| Revocar enlace externo | DELETE | `/api/files/items/:id/links/:linkId` | — | `204` |

`Item`: `{ id, name, type: 'folder'|'image'|'video'|'doc'|'sheet'|'slides', meta, date, starred, parentId, owner, group, mode, sizeBytes? }`.
`Version`: `{ id, label, date, sizeMeta, modifiedBy }`.

---

## 3. Sincronización de dispositivos — `js/api/sync.js`

Base: `API_BASE.sync` = `/api/sync`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Listar dispositivos vinculados | GET | `/api/sync/devices` | — | `[{ id, name, platform, lastSyncAt, status: 'synced'\|'pending'\|'offline' }]` |
| Archivos con historial de versiones | GET | `/api/sync/files` | — | `[{ id, name }]` |
| Historial de versiones de un archivo | GET | `/api/sync/files/:fileId/versions` | — | `Version[]` (ver arriba, + `modifiedByName`) |
| Restaurar una versión | POST | `/api/sync/files/:fileId/versions/:versionId/restore` | — | `Item` actualizado |
| Listar conflictos | GET | `/api/sync/conflicts` | — | `[{ id, fileId, fileName, deviceId, local, server }]` (`local`/`server`: `{ date, sizeMeta, modifiedBy }`) |
| Resolver conflicto | POST | `/api/sync/conflicts/resolve` | `{ conflictId, resolution: 'local'\|'server' }` | `{ conflictId, resolution }` |
| Registro de actividad | GET | `/api/sync/activity` | — | `[{ id, deviceId, action, fileName, timestamp, status: 'ok'\|'conflicto'\|'error' }]` |

---

## 4. Trabajos MPI — `js/api/jobs.js`

Base: `API_BASE.jobs` = `/api/jobs`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Listar trabajos | GET | `/api/jobs?status=` | query `status` opcional (`queued`\|`running`\|`completed`\|`failed`\|`cancelled`) | `Job[]` |
| Detalle de un trabajo | GET | `/api/jobs/:id` | — | `Job` |
| Enviar trabajo | POST | `/api/jobs` | `{ name, processes, nodes, timeLimitMinutes, envVars: [{key,value}], sourceFileName, datasetFileName }` | `Job` (estado inicial `queued`) |
| Cancelar trabajo | POST | `/api/jobs/:id/cancel` | — | `Job` actualizado |
| Log en vivo | — | `/api/jobs/:id/log/stream` | — | `EventSource` (Server-Sent Events); cada evento `message` trae una línea de log como `data`. En modo mock se simula con `setInterval` local. |

`Job`: `{ id, name, status, processes, nodes, timeLimitMinutes, envVars, sourceFileName, datasetFileName, submittedAt, startedAt, completedAt, assignedNodes: string[], log: string[] }`.

---

## 5. Monitoreo — `js/api/metrics.js`

Base: `API_BASE.metrics` = `/api/metrics`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Resumen actual | GET | `/api/metrics/summary` | — | `{ cpuPct, memPct, storagePct, activeJobs }` |
| Serie reciente (gráfica en vivo) | GET | `/api/metrics/series` | — | `[{ t: epochMs, cpuPct, memPct }]` (ventana móvil) |
| Nodos del clúster | GET | `/api/metrics/nodes` | — | `[{ name, status: 'ocupado'\|'disponible', cpuPct, memPct, jobs: string[] }]` — **la cantidad de nodos la define el backend**, el frontend no la fija |
| Estado de servicios | GET | `/api/metrics/services` | — | `[{ name, status: 'up'\|'degraded'\|'down' }]` |
| Listar reglas de alerta | GET | `/api/metrics/alert-rules` | — | `[{ id, metric: 'cpu'\|'mem'\|'storage', threshold, channel: 'email'\|'slack'\|'sms' }]` |
| Crear regla de alerta | POST | `/api/metrics/alert-rules` | `{ metric, threshold, channel }` | regla creada |
| Eliminar regla de alerta | DELETE | `/api/metrics/alert-rules/:id` | — | `204` |
| Alertas activas | GET | `/api/metrics/alerts/triggered` | — | `[{ id, metric, threshold, channel, value, triggeredAt }]` |
| Reporte histórico | GET | `/api/metrics/reports?from=&to=` | query `from`, `to` (`YYYY-MM-DD`) | `[{ date, cpuAvg, memAvg, storageAvg }]` (un punto por día) |

---

## 6. Álbum de fotos — `js/api/photos.js`

Base: `API_BASE.photos` = `/api/photos`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Colecciones | GET | `/api/photos/collections` | — | `[{ id, name }]` |
| Etiquetas disponibles | GET | `/api/photos/tags` | — | `string[]` |
| Listar fotos | GET | `/api/photos` | query: `collectionId`, `tag`, `from`, `to` | `[{ id, name, collectionId, tags: string[], dateTaken, url? }]` |
| Detalle de una foto | GET | `/api/photos/:id` | — | mismo objeto de arriba |

`url` (URL real de la imagen) es opcional en el mock actual (se genera un SVG local); el backend real debe devolver una URL servible desde el mismo origen (o `data:`) para respetar la `Content-Security-Policy`.

---

## 7. Streaming de video — `js/api/videos.js`

Base: `API_BASE.videos` = `/api/videos`

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Catálogo | GET | `/api/videos?sortBy=` | query `sortBy` (`recent`\|`title`\|`duration`) | `[{ id, title, durationSeconds, uploadedAt, requiredGroup, hasAccess }]` |
| Detalle + fuente de reproducción | GET | `/api/videos/:id` | — | `{ ...catálogo, stream: { type: 'hls', manifestUrl } \| { type: 'native', url } }` |

Si `hasAccess` es `false`, el frontend muestra el mensaje de acceso denegado y **no** solicita `stream`. Cuando `stream.type === 'hls'`, el frontend usa `hls.js` contra `manifestUrl` (un `.m3u8` real sobre el mismo origen); si falla, cae a un reproductor nativo de respaldo.

---

## 8. Administración — `js/api/admin.js`

Bases: `API_BASE.users` (usuarios/auditoría) y `API_BASE.metrics` (mapa de servicios).

| Acción | Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|---|
| Listar usuarios | GET | `/api/users/admin/users` | — | `[{ id, name, email, role, groupId, quotaGB, status: 'active'\|'inactive' }]` |
| Dar de alta usuario | POST | `/api/users/admin/users` | `{ name, email, role, groupId, quotaGB }` | usuario creado |
| Cambiar estado (baja/reactivar) | PATCH | `/api/users/admin/users/:id/status` | `{ status: 'active'\|'inactive' }` | usuario actualizado |
| Cambiar cuota | PATCH | `/api/users/admin/users/:id/quota` | `{ quotaGB }` | usuario actualizado |
| Mapa de servicios | GET | `/api/metrics/services/map` | — | `[{ name, url, status }]` |
| Bitácora de auditoría | GET | `/api/users/admin/audit?userId=&action=&dateFrom=&dateTo=` | query opcionales | `[{ id, userId, userName, action, target, timestamp }]`, orden descendente por fecha |

Solo accesible para usuarios con `role: 'admin'` (verificado también en el frontend vía guarda de ruta, pero **debe** validarse también en el backend).

---

## Notas para quien implemente el backend real

- Todas las fechas son cadenas ISO 8601 (`Date.toISOString()`).
- `USE_MOCKS = false` en `js/config.js` activa automáticamente todas las rutas `*Real` descritas aquí; no hace falta tocar ninguna vista.
- Si el backend real vive en un origen distinto a este servidor web, hay que actualizar `API_BASE` en `js/config.js` y relajar `connect-src` en el `<meta http-equiv="Content-Security-Policy">` de `index.html` para incluir ese origen.
