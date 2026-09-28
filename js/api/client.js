// Cliente HTTP compartido para el modo "real" de todos los módulos de api/.
// Nadie fuera de js/api/ debe llamar fetch() directamente.
//
// Habla con el Service Bus, que responde siempre con la misma envoltura:
//   éxito  {"data": …}
//   error  {"error": {"codigo": "...", "mensaje": "..."}}
// Aquí se desenvuelve `data` y se traduce el error, de modo que el resto de la
// aplicación siga viendo el mismo contrato de antes.

export class ApiError extends Error {
  constructor(message, { status = 0, codigo = '', cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.cause = cause;
  }
}

// El token vive aquí, no en un import de session.js: así client.js no depende
// de nada y se evita el ciclo session → users → client → session.
let authToken = null;

export function setAuthToken(t) {
  authToken = t || null;
}

export function getAuthToken() {
  return authToken;
}

export async function request(path, { method = 'GET', body, headers = {}, retries = 1, signal } = {}) {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      const cabeceras = { ...headers };
      // Un archivo viaja como sus propios bytes; cualquier otra cosa, como JSON.
      const binario = body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body);
      if (body !== undefined) {
        cabeceras['Content-Type'] ??= binario ? (body.type || 'application/octet-stream') : 'application/json';
      }
      if (authToken) cabeceras.Authorization = `Bearer ${authToken}`;

      const res = await fetch(path, {
        method,
        headers: cabeceras,
        body: body === undefined ? undefined : (binario ? body : JSON.stringify(body)),
        signal,
      });

      let payload = null;
      try { payload = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }

      if (!res.ok) {
        const err = payload?.error;
        throw new ApiError(err?.mensaje || payload?.message || `Error ${res.status} en ${path}`,
          { status: res.status, codigo: err?.codigo || '' });
      }
      if (res.status === 204 || payload === null) return null;
      // El bus envuelve en `data`; si algún día no lo hace, se devuelve tal cual.
      return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') break;
      // Un 4xx es una respuesta del servidor, no un fallo de red: no se reintenta.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) break;
      attempt += 1;
    }
  }

  throw lastError instanceof ApiError ? lastError : new ApiError(lastError.message, { cause: lastError });
}

/**
 * Descarga binaria (vista previa, descargas). A diferencia de request(), la
 * respuesta buena no es JSON sino los bytes del archivo; solo el error lo es.
 */
export async function requestBlob(path, { signal } = {}) {
  const res = await fetch(path, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    signal,
  });
  if (!res.ok) {
    let err = null;
    try { err = (await res.json())?.error; } catch { /* sin cuerpo JSON */ }
    throw new ApiError(err?.mensaje || `Error ${res.status} en ${path}`, { status: res.status, codigo: err?.codigo || '' });
  }
  return res.blob();
}

/** Construye una cadena de consulta descartando los valores vacíos. */
export function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
