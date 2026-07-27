// src/hooks/useModoTablet.ts
//
// S37-T · Detección de modo tablet + orientación.
//
// Aislado a propósito: el resto de la app solo consume el booleano y la
// orientación. Toda regla visual del sprint vive en src/styles/tablet.css bajo
// el prefijo `body.modo-tablet` — ese prefijo es el mecanismo que garantiza que
// la versión notebook quede intacta.

import { useCallback, useEffect, useState } from 'react';

export type OverrideTablet = 'auto' | 'on' | 'off';
export type Orientacion    = 'h' | 'v';

/** Override por dispositivo/navegador, no por cuenta de usuario: el mismo
 *  usuario puede tener modo distinto en su notebook y en su tablet. */
const LS_KEY = 'planots_modo_tablet';

/** Solo se usa como desempate cuando ya sabemos que el puntero es grueso. */
const ANCHO_MAX_TABLET = 1400;

export function leerOverride(): OverrideTablet {
  try {
    const v = localStorage.getItem(LS_KEY);
    return (v === 'on' || v === 'off' || v === 'auto') ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * ORDEN CRÍTICO — no invertir:
 *   1. El tipo de puntero decide. Un dedo siempre reporta `coarse`, un mouse
 *      o trackpad siempre `fine`. Si el puntero es fino es notebook, sin
 *      importar el ancho.
 *   2. El ancho solo desempata una vez que sabemos que es táctil (cubre el caso
 *      raro del monitor de escritorio táctil grande).
 *
 * Motivo: la Tab S7 FE en horizontal reporta ~1280px de viewport CSS, el mismo
 * piso que la app usa para notebook. Si el ancho decidiera primero, la tablet en
 * horizontal se confundiría con una notebook. El puntero no tiene ese problema.
 */
function detectarAuto(): boolean {
  if (typeof window === 'undefined') return false;
  const punteroGrueso = window.matchMedia('(pointer: coarse)').matches;
  if (!punteroGrueso) return false;
  return window.innerWidth < ANCHO_MAX_TABLET;
}

function detectarOrientacion(): Orientacion {
  if (typeof window === 'undefined') return 'h';
  return window.innerHeight > window.innerWidth ? 'v' : 'h';
}

export function useModoTablet() {
  const [override,    setOverrideState] = useState<OverrideTablet>(leerOverride);
  const [auto,        setAuto]          = useState<boolean>(detectarAuto);
  const [orientacion, setOrientacion]   = useState<Orientacion>(detectarOrientacion);

  const recalcular = useCallback(() => {
    setAuto(detectarAuto());
    setOrientacion(detectarOrientacion());
  }, []);

  // `orientationchange` dispara ANTES de que el navegador actualice las medidas
  // del viewport: leer en ese instante devuelve los valores viejos. Dos frames
  // de margen y recién ahí medimos.
  const recalcularDiferido = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(recalcular));
  }, [recalcular]);

  useEffect(() => {
    window.addEventListener('resize', recalcular);
    window.addEventListener('orientationchange', recalcularDiferido);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('orientationchange', recalcularDiferido);
    };
  }, [recalcular, recalcularDiferido]);

  const setOverride = useCallback((v: OverrideTablet) => {
    setOverrideState(v);
    try {
      localStorage.setItem(LS_KEY, v);
    } catch (e) {
      console.error('[useModoTablet] localStorage:', e);
    }
  }, []);

  const modoTablet =
    override === 'on'  ? true  :
    override === 'off' ? false :
    auto;

  return { modoTablet, orientacion, override, setOverride };
}
