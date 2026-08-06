// Cliente HTTP compartido para el modo "real" de todos los módulos de api/.
// Nadie fuera de js/api/ debe llamar fetch() directamente.

export class ApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.cause = cause;
  }
}

export async function request(path, { method = 'GET', body, headers = {}, retries = 1, signal } = {}) {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });

      if (!res.ok) {
        let detail = null;
        try { detail = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
        throw new ApiError(detail?.message || `Error ${res.status} en ${path}`, { status: res.status });
      }
      if (res.status === 204) return null;
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') break;
      attempt += 1;
    }
  }

  throw lastError instanceof ApiError ? lastError : new ApiError(lastError.message, { cause: lastError });
}
