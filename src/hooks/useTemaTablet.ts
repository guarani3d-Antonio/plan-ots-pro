// src/hooks/useTemaTablet.ts
//
// S37-T F2 · Tema Vidrio / Campo. Exclusivo de modo tablet.
//
// CAMPO no es un tema nuevo: es literalmente el tema actual de la app. Significa
// "no aplicar la clase de vidrio". Por eso el default es 'campo' y por eso este
// sprint no toca una sola variable CSS de index.css.
//
// VIDRIO agrega la clase `tema-vidrio`, que en styles/tablet.css siempre va
// combinada como `body.modo-tablet.tema-vidrio` — nunca sola.

import { useCallback, useState } from 'react';

export type TemaTablet = 'campo' | 'vidrio';

const LS_KEY = 'planots_tema_tablet';

export function leerTema(): TemaTablet {
  try {
    return localStorage.getItem(LS_KEY) === 'vidrio' ? 'vidrio' : 'campo';
  } catch {
    return 'campo';
  }
}

export function useTemaTablet() {
  const [tema, setTemaState] = useState<TemaTablet>(leerTema);

  const setTema = useCallback((t: TemaTablet) => {
    setTemaState(t);
    try {
      localStorage.setItem(LS_KEY, t);
    } catch (e) {
      console.error('[useTemaTablet] localStorage:', e);
    }
  }, []);

  return { tema, setTema };
}
