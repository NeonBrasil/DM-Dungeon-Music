import { useSyncExternalStore } from "react";

/** Store mínimo com seletores (useSyncExternalStore). Seletores devem devolver referências estáveis. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      for (const l of listeners) l();
    },
    subscribe,
    use<S>(sel: (s: T) => S): S {
      return useSyncExternalStore(subscribe, () => sel(state));
    },
  };
}
