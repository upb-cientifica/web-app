# Drive Upb

SPA de Drive corporativo para **UPB-Científica** (empresa ficticia de servicios de cómputo de alto rendimiento). Este repositorio es la capa **Web Server JavaScript**: la SPA del navegador (HTML/CSS/JS vanilla, sin frameworks) más el servidor Node estático que la sirve.

Los demás servicios (usuarios/SOAP en PHP, sincronización/gRPC en Go, clúster MPI/RMI en Java) son responsabilidad de otros equipos y todavía no existen; este frontend habla con ellos a través de una capa de API con **modo mock** para poder desarrollarse y demostrarse de forma independiente. El contrato exacto que cada backend deberá implementar está en [`docs/api-contract.md`](docs/api-contract.md).

## Requisitos

- Node.js (cualquier versión reciente con soporte de ES modules; se probó con Node 24). No se usan dependencias de npm.
- Sin build step, sin contenedores, sin servicios de terceros. Todo corre en local.

## Cómo correr el proyecto

```bash
node server.js
```

o

```bash
npm start
```

Esto levanta un servidor estático mínimo (`server.js`, solo con módulos nativos de Node: `http`, `fs`, `path`) en `http://localhost:8080`. **Es necesario usar este servidor** (no abrir `index.html` con doble clic): los módulos ES (`<script type="module">`) no cargan sobre `file://` en los navegadores basados en Chromium por política de CORS.

Para cambiar el puerto: `node server.js 3000`.

## Estructura del proyecto

```
index.html              Cáscara de la app: topbar, sidebar, #view-root vacío, modales compartidos
server.js                Servidor estático (sin dependencias)
package.json

assets/
  fonts/                 Roboto (OFL) y Material Icons (Apache 2.0), autohospedadas
  icons/                 Favicon propio (SVG)

css/
  tokens.css             Variables de color/espaciado, tema claro y oscuro
  base.css                Reset, tipografía base, foco visible
  components.css         Botones, modales, menú contextual, toast, diálogos propios
  layout.css              Topbar, sidebar, estructura general, modo autenticación
  components/sharing.css  Modal de compartir + panel de detalles (permisos estilo Unix)
  views/*.css             Una hoja de estilos por vista

js/
  main.js                 Arranque: registra rutas, guardas de sesión/rol, chrome de la app
  router.js                Enrutador por hash con rutas públicas/protegidas y por rol
  state.js                 Store genérico con suscriptores (createStore) + appStore global
  session.js                Sesión en memoria (token, refresco silencioso) — nunca en localStorage
  config.js                 USE_MOCKS y API_BASE por servicio

  api/                     Capa de datos. Ningún componente de vista llama fetch() directo.
    client.js                Cliente HTTP compartido para el modo real (fetch + reintentos)
    users.js, files.js, sync.js, jobs.js, metrics.js, photos.js, videos.js, admin.js
    mock/                    Datos y lógica de simulación en memoria para cada módulo

  utils/                   Funciones puras compartidas (formato, escape HTML, trampa de foco...)
  components/              Piezas de UI reutilizables entre vistas (modal, toast, visor de fotos...)
  views/                   Una vista por módulo/ruta
  vendor/                  Librerías de terceros autohospedadas (hls.js, generador de QR)

docs/
  api-contract.md          Contrato de endpoints que el frontend espera de cada backend
```

## El interruptor `USE_MOCKS`

En [`js/config.js`](js/config.js):

```js
export const USE_MOCKS = true;
```

- **`true`** (valor por defecto): cada módulo de `js/api/` usa datos simulados en memoria (`js/api/mock/*.js`), con latencia artificial para que los estados de carga sean visibles. Así es como corre la demo hoy, sin backend real.
- **`false`**: cada módulo cambia a su implementación "real", que hace `fetch()` contra la ruta relativa definida en `API_BASE` (también en `config.js`) usando `js/api/client.js`. Ningún otro archivo necesita cambiar — las vistas siempre importan la misma función (p. ej. `listItems` de `js/api/files.js`) sin saber si está en modo mock o real.

Cuando los backends de los compañeros estén disponibles, hay que:
1. Poner `USE_MOCKS = false`.
2. Ajustar las rutas de `API_BASE` si el gateway no vive bajo el mismo origen que este servidor (en ese caso también hay que revisar la `Content-Security-Policy` de `index.html`, ya que `connect-src` está restringido a `'self'`).
3. Verificar que cada endpoint responda con la forma descrita en `docs/api-contract.md`.

## Qué endpoint espera cada módulo de `js/api/`

Resumen rápido (ver el contrato completo con parámetros y forma de respuesta en [`docs/api-contract.md`](docs/api-contract.md)):

| Módulo | Backend real (futuro) | Base URL (mock) |
|---|---|---|
| `users.js` | SOAP de usuarios (PHP), vía gateway REST | `/api/users` |
| `files.js` | Home / permisos / compartición | `/api/files` |
| `sync.js` | gRPC de sincronización (Go), vía gateway REST | `/api/sync` |
| `jobs.js` | RMI del clúster MPI (Java), vía gateway REST | `/api/jobs` |
| `metrics.js` | Monitoreo del clúster | `/api/metrics` |
| `photos.js` | Álbum de fotos | `/api/photos` |
| `videos.js` | Catálogo y streaming de video | `/api/videos` |
| `admin.js` | Gestión de usuarios y auditoría (bajo el gateway de usuarios) | `/api/users/admin/*` |

## Notas de arquitectura

- **Router por hash** (`js/router.js`): rutas públicas (`/login`, `/mfa-enroll`, sin chrome de la app) vs. protegidas (exigen sesión) vs. con rol (`/admin`, exige `role: 'admin'`). Las guardas se registran desde `js/main.js`.
- **Sesión en memoria** (`js/session.js`): el token nunca se persiste; una recarga de página cierra la sesión. Incluye refresco silencioso antes de expirar.
- **Reproductor de video**: intenta `hls.js` (vendorizado) contra un manifiesto real; si falla (porque el backend aún no lo publica), cae automáticamente a un reproductor nativo con un clip de prueba generado 100% en el cliente (Canvas + MediaRecorder), sin ningún archivo de video real ni servicio externo.
- **Seguridad de cliente**: `Content-Security-Policy` estricta en `index.html` (sin scripts/estilos inline, sin `eval`), todo el HTML dinámico pasa por `esc()` antes de insertarse, no hay `alert`/`prompt`/`confirm` nativos (se reemplazaron por `js/components/dialogs.js`), y los modales tienen `role="dialog"` + trampa de foco (`js/utils/focusTrap.js`).
