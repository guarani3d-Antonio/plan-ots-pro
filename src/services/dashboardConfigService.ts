// src/services/dashboardConfigService.ts
import { supabase } from '../db/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type WidgetId = 'kpis' | 'por_estado' | 'por_rubro' | 'ultimas_ots';

export interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
  orden: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpis',        label: '📊 KPIs Principales',        visible: true, orden: 0 },
  { id: 'por_estado',  label: '🎯 Por Estado',              visible: true, orden: 1 },
  { id: 'por_rubro',   label: '🔧 Por Rubro',               visible: true, orden: 2 },
  { id: 'ultimas_ots', label: '🕐 Últimas OTs Modificadas', visible: true, orden: 3 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LS_KEY = 'plan_ots_dashboard_widgets';

function saveLS(w: WidgetConfig[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(w)); } catch { /* noop */ }
}

function loadLS(): WidgetConfig[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return mergeWithDefaults(JSON.parse(raw) as WidgetConfig[]);
  } catch { return null; }
}

/** Combina config guardada con defaults para asegurar que widgets nuevos aparezcan */
function mergeWithDefaults(saved: WidgetConfig[]): WidgetConfig[] {
  const map = new Map(saved.map(w => [w.id, w]));
  return DEFAULT_WIDGETS
    .map(def => map.get(def.id) ?? def)
    .sort((a, b) => a.orden - b.orden)
    .map((w, i) => ({ ...w, orden: i }));
}

// ─── API ─────────────────────────────────────────────────────────────────────

export async function getWidgetConfig(userId: string): Promise<WidgetConfig[]> {
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('dashboard_configs')
      .select('widgets')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data?.widgets) {
      const merged = mergeWithDefaults(data.widgets as WidgetConfig[]);
      saveLS(merged);
      return merged;
    }
  }

  return loadLS() ?? [...DEFAULT_WIDGETS];
}

export async function saveWidgetConfig(
  userId: string,
  widgets: WidgetConfig[],
): Promise<void> {
  saveLS(widgets);

  if (!navigator.onLine) return;

  const { error } = await supabase
    .from('dashboard_configs')
    .upsert(
      { user_id: userId, widgets, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[dashboardConfigService] upsert:', error.message);
  }
}