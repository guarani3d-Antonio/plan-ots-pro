import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from '../db/supabase';
import { useAuthStore } from '../stores/authStore';
import { useProyectosStore } from '../stores/proyectosStore';

// P0-6: único rol que ve montos en Gs. en toda la app.
const ROLES_CON_COSTOS = new Set(['supervisor']);

interface RolesProyectoState {
  userId:      string | null;
  roles:       Record<string, string>; // proyecto_id -> rol
  cargando:    boolean;
  cargado:     boolean; // true solo tras un fetch exitoso para `userId`
  fetchRoles:  (userId: string) => Promise<void>;
}

// Una sola query trae el rol del usuario en TODOS sus proyectos (sin
// .eq('proyecto_id')) — evita N idas a Supabase cuando varios componentes
// (grilla, panel, dashboard) necesitan el mismo dato a la vez.
const useRolesProyectoStore = create<RolesProyectoState>((set, get) => ({
  userId:     null,
  roles:      {},
  cargando:   false,
  cargado:    false,
  fetchRoles: async (userId) => {
    const actual = get();
    if (actual.cargando || (actual.cargado && actual.userId === userId)) return;
    set({ cargando: true });
    const { data, error } = await supabase
      .from('proyecto_miembros')
      .select('proyecto_id, rol')
      .eq('user_id', userId);
    if (error) {
      set({ cargando: false });
      return;
    }
    const roles: Record<string, string> = {};
    (data ?? []).forEach(row => {
      roles[row.proyecto_id as string] = row.rol as string;
    });
    set({ userId, roles, cargando: false, cargado: true });
  },
}));

function useRolesUsuario() {
  const user       = useAuthStore(s => s.user);
  const userId     = useRolesProyectoStore(s => s.userId);
  const roles      = useRolesProyectoStore(s => s.roles);
  const cargado    = useRolesProyectoStore(s => s.cargado);
  const fetchRoles = useRolesProyectoStore(s => s.fetchRoles);

  useEffect(() => {
    if (!user?.id) return;
    if (cargado && userId === user.id) return;
    void fetchRoles(user.id);
  }, [user?.id, userId, cargado, fetchRoles]);

  // Fail-closed: mientras no se confirmó el rol para el usuario actual, no
  // se considera resuelto (los hooks de más abajo devuelven "no puede ver").
  const resuelto = !!user?.id && cargado && userId === user.id;
  return { roles, resuelto };
}

/**
 * Puede ver costos en un único proyecto (grilla, panel de OT, modal de
 * detalle). Si no se pasa `proyectoId`, usa el proyecto activo global.
 */
export function usePuedeVerCostos(proyectoId?: string | null): boolean {
  const proyectoActivo = useProyectosStore(s => s.proyectoActivo);
  const idEfectivo = proyectoId ?? proyectoActivo?.id ?? null;
  const { roles, resuelto } = useRolesUsuario();

  if (!idEfectivo || !resuelto) return false;
  const rol = roles[idEfectivo];
  return !!rol && ROLES_CON_COSTOS.has(rol);
}

/**
 * Puede ver costos en una vista que agrega OTs de varios proyectos
 * (Dashboard). Fail-closed: solo true si es supervisor en TODOS los
 * proyectos de la lista — nunca se muestra un total parcial sin avisar.
 */
export function usePuedeVerCostosMultiple(proyectoIds: string[]): boolean {
  const { roles, resuelto } = useRolesUsuario();
  if (!resuelto) return false;
  return proyectoIds.every(id => {
    const rol = roles[id];
    return !!rol && ROLES_CON_COSTOS.has(rol);
  });
}
