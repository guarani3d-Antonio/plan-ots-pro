import { useEffect, useState } from 'react';
import {
  DEFAULT_WIDGETS, getManagedWidgetConfig, listarUsuariosDashboard, saveManagedWidgetConfig,
  type UsuarioDashboard, type WidgetConfig,
} from '../../services/dashboardConfigService';

const panel: React.CSSProperties = { border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, background: 'var(--bg-surface)' };

export function ConfiguracionDashboardCreador() {
  const [usuarios, setUsuarios] = useState<UsuarioDashboard[]>([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let active = true;
    void listarUsuariosDashboard().then(rows => {
      if (!active) return;
      setUsuarios(rows);
      setUsuarioId(id => id || rows[0]?.user_id || '');
    }).catch(e => { if (active) setMensaje(e instanceof Error ? e.message : 'No se pudieron cargar las cuentas.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!usuarioId) return;
    let active = true;
    void getManagedWidgetConfig(usuarioId).then(config => {
      if (active) setWidgets([...config].sort((a, b) => a.orden - b.orden));
    }).catch(e => { if (active) setMensaje(e instanceof Error ? e.message : 'No se pudo cargar el tablero.'); })
      .finally(() => { if (active) setCargando(false); });
    return () => { active = false; };
  }, [usuarioId]);

  function mover(id: string, desplazamiento: -1 | 1) {
    setWidgets(prev => {
      const next = [...prev];
      const actual = next.findIndex(w => w.id === id);
      const destino = actual + desplazamiento;
      if (destino < 0 || destino >= next.length) return prev;
      [next[actual], next[destino]] = [next[destino], next[actual]];
      return next.map((w, orden) => ({ ...w, orden }));
    });
  }

  async function guardar() {
    if (!usuarioId || guardando) return;
    setGuardando(true);
    setMensaje('');
    try {
      await saveManagedWidgetConfig(usuarioId, widgets);
      setMensaje('Dashboard guardado. El usuario verá los cambios al volver a entrar.');
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo guardar el dashboard.'); }
    finally { setGuardando(false); }
  }

  return <section style={panel}>
    <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Dashboard por usuario</h2>
    <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)' }}>Elegí qué indicadores ve cada cuenta y en qué orden. Los costos siguen sujetos al permiso de cada obra, aunque el indicador esté activado.</p>
    <label style={{ display: 'grid', gap: 6, maxWidth: 480, marginBottom: 16 }}>Cuenta
      <select className="app-select" value={usuarioId} onChange={e => { setUsuarioId(e.target.value); setCargando(true); setMensaje(''); }} disabled={cargando}>
        {usuarios.length === 0 && <option value="">No hay cuentas disponibles</option>}
        {usuarios.map(u => <option key={u.user_id} value={u.user_id}>{u.nombre} · {u.email}</option>)}
      </select>
    </label>
    {usuarioId && <div aria-busy={cargando} style={{ display: 'grid', gap: 8, maxWidth: 680 }}>
      {widgets.map((w, index) => <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><input type="checkbox" checked={w.visible} disabled={cargando} onChange={() => setWidgets(prev => prev.map(item => item.id === w.id ? { ...item, visible: !item.visible } : item))} />{w.label}</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" aria-label={`Subir ${w.label}`} disabled={cargando || index === 0} onClick={() => mover(w.id, -1)}>↑</button>
          <button type="button" aria-label={`Bajar ${w.label}`} disabled={cargando || index === widgets.length - 1} onClick={() => mover(w.id, 1)}>↓</button>
        </div>
      </div>)}
      <button type="button" style={{ justifySelf: 'start', padding: '10px 16px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontWeight: 600 }} disabled={cargando || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar dashboard'}</button>
    </div>}
    {mensaje && <p role="status" style={{ marginBottom: 0 }}>{mensaje}</p>}
  </section>;
}
