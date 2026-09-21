import { useEffect, useState } from 'react';
import { resolverArchivo } from '../services/storageService';
import { useAuthStore } from '../stores/authStore';

export function useArchivoPrivadoEstado(ref: string | null | undefined): { url: string | null; error: string | null } {
  const userId = useAuthStore(s => s.user?.id);
  const [resolved, setResolved] = useState<{ ref: string; userId: string; url: string } | null>(null);
  const [failure, setFailure] = useState<{ ref: string; userId: string; message: string } | null>(null);
  useEffect(() => {
    if (!ref || !userId) return;
    let cancelled = false;
    const refresh = () => resolverArchivo(ref).then(url => {
      if (!cancelled) { setResolved({ ref, userId, url }); setFailure(null); }
    }).catch((e: unknown) => { if (!cancelled) {
      setResolved(null); setFailure({ ref, userId, message: e instanceof Error ? e.message : 'No se pudo cargar el archivo' });
    } });
    void refresh();
    const timer = window.setInterval(refresh, 240_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [ref, userId]);
  return {
    url: resolved && resolved.ref === ref && resolved.userId === userId ? resolved.url : null,
    error: failure && failure.ref === ref && failure.userId === userId ? failure.message : null,
  };
}

export function useArchivoPrivado(ref: string | null | undefined): string | null {
  return useArchivoPrivadoEstado(ref).url;
}
