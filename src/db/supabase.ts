import { createClient } from '@supabase/supabase-js';
import { createSessionFetch } from '../security/sessionScope';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {global:{fetch:createSessionFetch(fetch.bind(globalThis))}});
