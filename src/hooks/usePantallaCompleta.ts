// src/hooks/usePantallaCompleta.ts
//
// S37-T · Pantalla completa real (equivalente a F11) vía Fullscreen API.
//
// OJO — no confundir con el `fullscreen` que ya existe en App.tsx/VistaPlano:
// aquel es un modo de LAYOUT (oculta el Sidebar y el ToolPanel dentro de la
// app). Este pone al navegador en pantalla completa a nivel sistema operativo.
// Son ortogonales y pueden convivir.
//
// Compatibilidad: funciona en Chrome/Android, que es el navegador real de la
// Tab S7 FE. Safari no soporta fullscreen de elementos arbitrarios, pero iPad
// no está en el alcance de este sprint — no se sobre-construye para ese caso.

import { useCallback, useEffect, useState } from 'react';

export function usePantallaCompleta() {
  const [activa, setActiva] = useState<boolean>(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  // Escuchamos el evento del navegador en vez de confiar en nuestro propio
  // toggle: el usuario puede salir con Esc o con un gesto del sistema, y el
  // ícono tiene que reflejar el estado real.
  useEffect(() => {
    const onChange = () => setActiva(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const alternar = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      // requestFullscreen rechaza si no viene de un gesto del usuario o si el
      // navegador lo bloquea. No es fatal: se loguea y la app sigue igual.
      console.error('[usePantallaCompleta]', e);
    }
  }, []);

  const soportada =
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function';

  return { activa, alternar, soportada };
}
