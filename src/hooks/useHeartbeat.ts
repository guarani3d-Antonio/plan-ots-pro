import { useEffect } from 'react';
import { supabase } from '../db/supabase';
import { useAuthStore } from '../stores/authStore';

const INTERVALO_MS = 5 * 60 * 1000;

function registrarHeartbeat(proyectoId: string | null): void {
  const session = useAuthStore.getState().session;
  if (!session) return;
  if (document.visibilityState !== 'visible') return;
  if (!navigator.onLine) return;

  supabase
    .from('eventos_uso')
    .insert({ user_id: session.user.id, proyecto_id: proyectoId, tipo: 'heartbeat' })
    .then(() => {}, () => {
      // Fire-and-forget a propósito: un heartbeat perdido es un heartbeat
      // perdido. No se reintenta ni se encola en syncQueue (contaminaría la
      // cola de sync real del técnico y quema batería contra la red cautiva
      // de la obra), y no se le muestra nada al usuario por un evento de uso.
    });
}

export function useHeartbeat(proyectoId: string | null): void {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const iniciar = () => {
      if (intervalId) return;
      intervalId = setInterval(() => registrarHeartbeat(proyectoId), INTERVALO_MS);
    };
    const detener = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') detener();
      else iniciar();
    };

    registrarHeartbeat(proyectoId);
    iniciar();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      detener();
    };
  }, [proyectoId]);
}
