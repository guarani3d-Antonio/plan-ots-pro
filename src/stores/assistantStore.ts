import { create } from 'zustand';
import type { AssistantMessage } from '../services/assistantService';

interface Request<T> { id: number; value: T }
interface AssistantState {
  scope: string; name: string; open: boolean; messages: AssistantMessage[];
  position: { x: number; y: number }; readAloud: boolean;
  dashboardRequest: Request<{ estado?: string; rubro?: string; reset?: 'estado' | 'all' }> | null;
  projectRequest: Request<{ action: 'create' | 'plan'; query: string }> | null;
  resetScope: (scope: string, userId: string) => void;
  toggle: () => void; append: (message: AssistantMessage) => void;
  preferences: (userId: string, values: Partial<Pick<AssistantState, 'name' | 'position' | 'readAloud'>>) => void;
}
const initialMessages: AssistantMessage[] = [{ role: 'assistant', content: '¿Qué necesitás?' }];
function readPreferences(userId: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(`plan-assistant-preferences:${userId}`) || '{}');
    return { name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : 'Mi asistente',
      position: { x: Number.isFinite(raw.position?.x) ? Math.max(0, Math.min(1, raw.position.x)) : 1, y: Number.isFinite(raw.position?.y) ? Math.max(0, Math.min(1, raw.position.y)) : 1 }, readAloud: raw.readAloud === true };
  } catch { return { name: 'Mi asistente', position: { x: 1, y: 1 }, readAloud: false }; }
}
export const useAssistantStore = create<AssistantState>((set, get) => ({
  scope: '', name: 'Mi asistente', open: false, messages: initialMessages, position: { x: 1, y: 1 }, readAloud: false, dashboardRequest: null, projectRequest: null,
  resetScope: (scope, userId) => { if (get().scope === scope) return; set({ scope, ...readPreferences(userId), messages: initialMessages, open: false, dashboardRequest: null, projectRequest: null }); },
  toggle: () => set(s => ({ open: !s.open })),
  append: message => set(s => ({ messages: [...s.messages, message].slice(-40) })),
  preferences: (userId, values) => {
    const name = values.name?.trim().slice(0, 24) || get().name;
    set({ ...values, name });
    const s = get();
    try { localStorage.setItem(`plan-assistant-preferences:${userId}`, JSON.stringify({ name: s.name, position: s.position, readAloud: s.readAloud })); } catch { /* preferences only; no credentials or conversations */ }
  },
}));
