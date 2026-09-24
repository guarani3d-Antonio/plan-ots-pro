import { useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { useAccessStore } from '../../stores/accessStore';
import { agregarContratistaCompartido, cargarContratistas } from '../../services/trustService';
import { PoliticasDocumentales } from './PoliticasDocumentales';

const panel: React.CSSProperties = { border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, background: 'var(--bg-surface)' };
const field: React.CSSProperties = { display: 'grid', gap: 6, minWidth: 0 };
const control: React.CSSProperties = { minHeight: 42, padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit' };
const button: React.CSSProperties = { ...control, width: 'fit-content', cursor: 'pointer', background: 'var(--accent)', color: 'white', fontWeight: 600 };
const tiposNotificacion = [
  ['nueva_ot', 'OT nuevas'], ['estado', 'Cambios de estado'], ['riesgo', 'Riesgo alto o extremo'],
] as const;
const roles = [['administrador', 'Administrador'], ['supervisor', 'Supervisor'], ['tecnico', 'Técnico'], ['viewer', 'Lector']] as const;

export function AdministracionCreador() {
  const { contexto, empresaId, refresh } = useAccessStore();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('viewer');
  const [activo, setActivo] = useState(true);
  const [obra, setObra] = useState('');
  const [rolObra, setRolObra] = useState('viewer');
  const [nuevoContratista, setNuevoContratista] = useState('');
  const [contratistas, setContratistas] = useState<string[]>([]);
  const [notificaciones, setNotificaciones] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!contexto?.creador || !empresaId) { setContratistas([]); return; }
    let active = true;
    Promise.all([
      cargarContratistas(empresaId),
      supabase.rpc('plan_notificaciones_config', { p_tenant: empresaId }),
    ]).then(([rows, config]) => {
      if (!active) return;
      if (config.error) throw new Error(config.error.message);
      setContratistas(rows.map(r => r.nombre));
      setNotificaciones(Object.fromEntries((config.data ?? []).map((r: { rol: string; tipos: string[] }) => [r.rol, r.tipos])));
    }).catch(e => { if (active) setMensaje(e instanceof Error ? e.message : 'No se pudo cargar la configuración.'); });
    return () => { active = false; };
  }, [contexto?.creador, empresaId]);

  if (!contexto?.creador) return null;

  async function ejecutar(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setMensaje('');
    try {
      const r = await action();
      if (r.error) throw new Error(r.error.message);
      setMensaje('Cambio guardado.');
      await refresh();
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo completar el cambio.'); }
    finally { setBusy(false); }
  }

  async function guardarContratista() {
    const value = nuevoContratista.trim();
    if (!empresaId || !value || busy) return;
    setBusy(true); setMensaje('');
    try {
      const saved = await agregarContratistaCompartido(empresaId, value);
      setContratistas(prev => [...new Set([...prev, saved.nombre])].sort((a, b) => a.localeCompare(b)));
      setNuevoContratista(''); setMensaje('Contratista agregado al directorio.');
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo guardar el contratista.'); }
    finally { setBusy(false); }
  }

  async function guardarNotificaciones() {
    if (!empresaId || busy) return;
    setBusy(true); setMensaje('');
    try {
      for (const [rolKey] of roles) {
        const { error } = await supabase.rpc('plan_configurar_notificaciones', {
          p_tenant: empresaId, p_rol: rolKey, p_tipos: notificaciones[rolKey] ?? [],
        });
        if (error) throw new Error(error.message);
      }
      setMensaje('Preferencias de notificación guardadas.');
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo guardar la configuración.'); }
    finally { setBusy(false); }
  }

  const empresa = contexto.empresas.find(e => e.id === empresaId);
  return <div style={{ padding: '24px clamp(16px, 3vw, 36px)', display: 'grid', gap: 18, color: 'var(--text-primary)' }}>
    <header>
      <h1 style={{ margin: 0, fontSize: 26 }}>Espacio del Creador</h1>
      <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Administrá las empresas, las cuentas, los responsables y los directorios compartidos.</p>
    </header>
    <label style={{ ...field, maxWidth: 480 }}>Empresa activa
      <select style={control} value={empresaId} onChange={e => useAccessStore.setState({ empresaId: e.target.value })}>
        <option value="">Seleccionar empresa</option>
        {contexto.empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select>
    </label>
    <section style={panel}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Cuentas, roles y responsables</h2>
      <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)' }}>El correo debe pertenecer a una cuenta ya creada. El rol de supervisor o técnico habilita su asignación como responsable en las OTs.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
        <div style={{ display: 'grid', alignContent: 'start', gap: 10 }}>
          <label style={field}>Nombre de la nueva empresa<input style={control} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
          <button style={button} disabled={busy || !nombre.trim()} onClick={() => void ejecutar(() => supabase.rpc('plan_admin_empresa', { p_nombre: nombre }))}>Crear empresa</button>
        </div>
        <div style={{ display: 'grid', alignContent: 'start', gap: 10 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{empresa ? `Empresa seleccionada: ${empresa.nombre}` : 'Elegí una empresa para administrar las cuentas.'}</p>
          <label style={field}>Correo de una cuenta existente<input style={control} type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label style={field}>Rol en la empresa<select style={control} value={rol} onChange={e => setRol(e.target.value)}><option value="administrador">Administrador</option><option value="supervisor">Supervisor</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option></select></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Membresía activa</label>
          <button style={button} disabled={busy || !empresaId || !email.trim()} onClick={() => void ejecutar(() => supabase.rpc('plan_admin_miembro', { p_tenant: empresaId, p_email: email, p_rol: rol, p_activo: activo }))}>Guardar cuenta y rol</button>
          <label style={field}>Obra<select style={control} value={obra} onChange={e => setObra(e.target.value)}><option value="">Seleccionar obra</option>{contexto.obras.filter(p => p.tenant_id === empresaId).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label style={field}>Permiso en la obra<select style={control} value={rolObra} onChange={e => setRolObra(e.target.value)}><option value="supervisor">Supervisor</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option><option value="sin_acceso">Retirar acceso</option></select></label>
          <button style={button} disabled={busy || !email.trim() || !contexto.obras.some(p => p.id === obra && p.tenant_id === empresaId)} onClick={() => void ejecutar(() => supabase.rpc('plan_admin_obra_miembro', { p_proyecto: obra, p_email: email, p_rol: rolObra }))}>Guardar acceso a obra</button>
        </div>
      </div>
    </section>
    {empresaId && <section style={panel}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Directorio de contratistas</h2>
      <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>Los usuarios asignan contratistas a las OTs desde este directorio.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><input style={{ ...control, flex: '1 1 260px' }} maxLength={160} placeholder="Nombre del contratista" value={nuevoContratista} onChange={e => setNuevoContratista(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void guardarContratista(); }} /><button style={button} disabled={busy || !nuevoContratista.trim()} onClick={() => void guardarContratista()}>Agregar contratista</button></div>
      <ul style={{ margin: '14px 0 0', paddingLeft: 20 }}>{contratistas.map(c => <li key={c}>{c}</li>)}</ul>
      {!contratistas.length && <p style={{ color: 'var(--text-secondary)' }}>Todavía no hay contratistas registrados.</p>}
    </section>}
    {empresaId && <section style={panel}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Notificaciones por rol</h2>
      <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)' }}>Elegí qué avisos básicos recibe cada rol. Los cambios completos siguen disponibles en el historial de cada OT.</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr><th style={{ padding: 10 }}>Rol</th>{tiposNotificacion.map(([, label]) => <th key={label} style={{ padding: 10 }}>{label}</th>)}</tr></thead>
        <tbody>{roles.map(([role, label]) => <tr key={role}>
          <th style={{ padding: 10, borderTop: '1px solid var(--border-default)' }}>{label}</th>
          {tiposNotificacion.map(([type]) => <td key={type} style={{ padding: 10, borderTop: '1px solid var(--border-default)' }}><input aria-label={`${label}: ${type}`} type="checkbox" checked={(notificaciones[role] ?? ['nueva_ot', 'estado']).includes(type)} onChange={e => setNotificaciones(prev => ({ ...prev, [role]: e.target.checked ? [...new Set([...(prev[role] ?? ['nueva_ot', 'estado']), type])] : (prev[role] ?? ['nueva_ot', 'estado']).filter(t => t !== type) }))} /></td>)}
        </tr>)}</tbody>
      </table></div>
      <button style={{ ...button, marginTop: 14 }} disabled={busy} onClick={() => void guardarNotificaciones()}>Guardar notificaciones</button>
    </section>}
    {empresaId && <section style={panel}><h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Documentos de la empresa</h2><PoliticasDocumentales tenantId={empresaId} /></section>}
    <p role="status" aria-live="polite" style={{ margin: 0 }}>{mensaje}</p>
  </div>;
}
