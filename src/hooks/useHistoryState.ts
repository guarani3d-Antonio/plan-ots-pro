import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// El propietario permanece montado al cerrar sus diálogos: Atrás y Adelante
// pueden reconstruirlos sin guardar copias de OT ni documentos en el historial.
export function useHistoryState<T>(key: string, read: (value: unknown) => T, canLeave?: (next: T, current: T) => boolean) {
  const [entry, setEntry] = useState(() => ({ key, value: read(history.state?.[key]) }));
  const value = entry.key === key ? entry.value : read(history.state?.[key]);
  const current = useRef(value);
  const guard = useRef(canLeave);
  const readRef = useRef(read);
  const focusReturn = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    current.current = value; guard.current = canLeave; readRef.current = read;
    if (entry.key !== key) setEntry({key,value});
  });
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = readRef.current(event.state?.[key]);
      if (JSON.stringify(next) === JSON.stringify(current.current)) return;
      if (guard.current && !guard.current(next, current.current)) {
        event.stopImmediatePropagation();
        // Restaura el diálogo y su formulario sin desmontarlo ni descartar datos.
        history.pushState({ ...history.state, [key]: current.current }, '');
        return;
      }
      const trigger=focusReturn.current.get(JSON.stringify(current.current));
      current.current = next; setEntry({key,value:next});
      if(trigger)requestAnimationFrame(()=>{if(trigger.isConnected)trigger.focus({preventScroll:true});});
    };
    window.addEventListener('popstate', onPop, true);
    return () => window.removeEventListener('popstate', onPop, true);
  }, [key]);
  const open = useCallback((next: T) => {
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    if (guard.current && !guard.current(next, current.current)) return;
    if(document.activeElement instanceof HTMLElement)focusReturn.current.set(JSON.stringify(next),document.activeElement);
    history.pushState({ ...history.state, [key]: next }, '');
    current.current = next; setEntry({key,value:next});
  }, [key]);
  const back = useCallback(() => history.back(), []);
  return [value, open, back] as const;
}
