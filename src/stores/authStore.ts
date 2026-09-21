import { create } from 'zustand';
import { supabase } from '../db/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { bindIdentity } from '../security/sessionScope';
import { useAccessStore } from './accessStore';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

let initialization: Promise<void> | null = null;
let documentUser: string | null | undefined;
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  initialize: async () => {
    if (initialization) return initialization;
    initialization = (async () => {
      supabase.auth.onAuthStateChange((_event, session) => {
        if (documentUser === undefined) return;
        if ((session?.user.id ?? null) !== documentUser) {
          bindIdentity(null);
          useAccessStore.setState({ disponible: false, contexto: null });
          set({ user: null, session: null, loading: true });
          window.location.reload();
        } else set({ session, user: session?.user ?? null });
      });
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
          const verified = await supabase.auth.getUser();
          if (verified.error || verified.data.user?.id !== session.user.id) throw new Error('No se pudo verificar la sesión.');
        }
        documentUser = session?.user.id ?? null; bindIdentity(documentUser);
        set({ session, user: session?.user ?? null, loading: false });
        if (session) await useAccessStore.getState().refresh();
      } catch (e) {
        documentUser = null; bindIdentity(null);
        set({ user: null, session: null, loading: false, error: e instanceof Error ? e.message : 'Error de sesión' });
      }
    })();
    return initialization;
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) set({ error: error.message, loading: false });
    else window.location.reload();
  },

  signUp: async () => { throw new Error('Solicita tu cuenta al administrador de la plataforma.'); },

  signOut: async () => {
    bindIdentity(null); useAccessStore.setState({ disponible: false, contexto: null });
    set({ user: null, session: null, loading: true });
    try { await supabase.auth.signOut({ scope: 'local' }); } finally { window.location.reload(); }
  },
}));
