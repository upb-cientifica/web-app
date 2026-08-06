// Store genérico con suscriptores. Cada vista puede crear su propia
// instancia local (p. ej. filesView) o usar appStore para estado
// verdaderamente global (sesión, ruta activa).

export function createStore(initialState = {}) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(partial) {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// Store global de aplicación. `user` lo llena el módulo de autenticación (fase 2.1).
export const appStore = createStore({
  user: null,
  route: null,
});
