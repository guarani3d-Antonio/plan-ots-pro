import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';

type Obra = { id: string; nombre: string; tenant_id: string | null };
type Cliente = { id: string; nombre: string; identificacion: string | null; contacto: string | null;
  telefono: string | null; correo: string | null; direccion: string | null; activo: boolean };
type Ubicacion = { id: string; cliente_id: string; proyecto_id: string | null; tipo_inmueble: string;
  nombre_obra: string; direccion: string | null; piso: string | null; unidad: string | null;
  sector: string | null; activo: boolean };
type DetalleContratista = {
  identificacion: string | null; contacto: string | null; telefono: string | null;
  correo: string | null; direccion: string | null; activo: boolean };
type Contratista = { id: string; nombre: string;
  plan_contratista_fichas?: DetalleContratista | DetalleContratista[] | null };
type Reclamo = { id: string; ot: string; estado: string; proyecto_id: string;
  cliente_ubicacion_id: string | null; created_at: string; descripcion: string | null };
type Ficha = { nombre: string; identificacion: string; contacto: string; telefono: string;
  correo: string; direccion: string; activo: boolean };
type Sitio = { proyecto_id: string; tipo_inmueble: string; nombre_obra: string;
  direccion: string; piso: string; unidad: string; sector: string; activo: boolean };

const emptyFicha = (): Ficha => ({ nombre: '', identificacion: '', contacto: '', telefono: '', correo: '', direccion: '', activo: true });
const emptySitio = (): Sitio => ({ proyecto_id: '', tipo_inmueble: 'residencial_altura', nombre_obra: '', direccion: '', piso: '', unidad: '', sector: '', activo: true });
const card: React.CSSProperties = { border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, background: 'var(--bg-surface)' };
const field: React.CSSProperties = { display: 'grid', gap: 6, minWidth: 0 };
const control: React.CSSProperties = { minHeight: 42, padding: '8px 36px 8px 12px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', width: '100%', minWidth: 0 };
const selectControl: React.CSSProperties = { ...control, background: undefined };
const button: React.CSSProperties = { ...control, width: 'fit-content', cursor: 'pointer', background: 'var(--accent)', color: 'white', fontWeight: 600 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 };

export function DirectoriosCreador({ tenantId, obras }: { tenantId: string; obras: Obra[] }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [historial, setHistorial] = useState<Reclamo[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [contratistaId, setContratistaId] = useState('');
  const [cliente, setCliente] = useState<Ficha>(emptyFicha);
  const [sitio, setSitio] = useState<Sitio>(emptySitio);
  const [contratista, setContratista] = useState<Ficha>(emptyFicha);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const reload = useCallback(async (active: () => boolean = () => true) => {
    const [c, u, k] = await Promise.all([
      supabase.from('plan_clientes').select('id,nombre,identificacion,contacto,telefono,correo,direccion,activo').eq('tenant_id', tenantId).order('nombre'),
      supabase.from('plan_cliente_ubicaciones').select('id,cliente_id,proyecto_id,tipo_inmueble,nombre_obra,direccion,piso,unidad,sector,activo').eq('tenant_id', tenantId).order('nombre_obra'),
      supabase.from('plan_contratistas').select('id,nombre,plan_contratista_fichas(identificacion,contacto,telefono,correo,direccion,activo)').eq('tenant_id', tenantId).order('nombre'),
    ]);
    if (c.error || u.error || k.error) throw new Error(c.error?.message || u.error?.message || k.error?.message);
    if (active()) { setClientes((c.data ?? []) as Cliente[]); setUbicaciones((u.data ?? []) as Ubicacion[]); setContratistas((k.data ?? []) as Contratista[]); }
  }, [tenantId]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => reload(() => active))
      .catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => {
    if (!clienteId) return;
    let active = true;
    void supabase.from('ordenes').select('id,ot,estado,proyecto_id,cliente_ubicacion_id,created_at,descripcion')
      .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(error.message);
        else setHistorial((data ?? []) as Reclamo[]);
      });
    return () => { active = false; };
  }, [clienteId]);

  function chooseClient(id: string) {
    setClienteId(id); setUbicacionId(''); setSitio(emptySitio()); setHistorial([]);
    const found = clientes.find(c => c.id === id);
    setCliente(found ? { nombre: found.nombre, identificacion: found.identificacion ?? '', contacto: found.contacto ?? '', telefono: found.telefono ?? '', correo: found.correo ?? '', direccion: found.direccion ?? '', activo: found.activo } : emptyFicha());
  }
  function chooseLocation(id: string) {
    setUbicacionId(id);
    const found = ubicaciones.find(u => u.id === id);
    setSitio(found ? { proyecto_id: found.proyecto_id ?? '', tipo_inmueble: found.tipo_inmueble, nombre_obra: found.nombre_obra, direccion: found.direccion ?? '', piso: found.piso ?? '', unidad: found.unidad ?? '', sector: found.sector ?? '', activo: found.activo } : emptySitio());
  }
  function chooseContractor(id: string) {
    setContratistaId(id);
    const found = contratistas.find(c => c.id === id);
    const related = found?.plan_contratista_fichas;
    const detail = Array.isArray(related) ? related[0] : related;
    setContratista(found ? { nombre: found.nombre, identificacion: detail?.identificacion ?? '', contacto: detail?.contacto ?? '', telefono: detail?.telefono ?? '', correo: detail?.correo ?? '', direccion: detail?.direccion ?? '', activo: detail?.activo ?? true } : emptyFicha());
  }
  async function run(operation: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>, after: (data: unknown) => void, success: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await operation();
      if (result.error) throw new Error(result.error.message);
      await reload(); after(result.data); setMessage(success);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  const selectedLocations = ubicaciones.filter(u => u.cliente_id === clienteId);
  const works = obras.filter(p => p.tenant_id === tenantId);

  function fichaInputs(value: Ficha, update: (next: Ficha) => void, kind: 'cliente' | 'contratista') {
    const entries: { key: keyof Ficha; label: string; max: number }[] = [
      { key: 'nombre', label: kind === 'cliente' ? 'Nombre o razón social' : 'Nombre o razón social', max: 160 },
      { key: 'identificacion', label: 'RUC o documento', max: 80 },
      { key: 'contacto', label: 'Persona de contacto', max: 160 },
      { key: 'telefono', label: 'Teléfono', max: 80 },
      { key: 'correo', label: 'Correo', max: 254 },
      { key: 'direccion', label: kind === 'cliente' ? 'Domicilio del cliente' : 'Dirección del contratista', max: 500 },
    ];
    return <div style={grid}>{entries.map(({ key, label, max }) => <label key={key} style={field}>{label}<input style={control} type={key === 'correo' ? 'email' : 'text'} maxLength={max} value={String(value[key])} onChange={e => update({ ...value, [key]: e.target.value })} /></label>)}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={value.activo} onChange={e => update({ ...value, activo: e.target.checked })} />Ficha activa</label></div>;
  }

  return <>
    <section style={card}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Clientes y sus ubicaciones</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px' }}>Una ficha identifica al cliente. Cada departamento, oficina o planta se registra como ubicación y puede acumular varias OTs.</p>
      <label style={field}>Ficha existente
        <select className="app-select" style={selectControl} value={clienteId} onChange={e => chooseClient(e.target.value)}><option value="">+ Nuevo cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.identificacion ? ` · ${c.identificacion}` : ''}</option>)}</select>
      </label>
      <div style={{ marginTop: 12 }}>{fichaInputs(cliente, setCliente, 'cliente')}</div>
      <button style={{ ...button, marginTop: 12 }} disabled={busy || !cliente.nombre.trim()} onClick={() => void run(
        () => supabase.rpc('plan_guardar_cliente', { p_tenant: tenantId, p_id: clienteId || null, p_nombre: cliente.nombre, p_identificacion: cliente.identificacion, p_contacto: cliente.contacto, p_telefono: cliente.telefono, p_correo: cliente.correo, p_direccion: cliente.direccion, p_activo: cliente.activo }),
        data => { const saved = data as Cliente; setClienteId(saved.id); }, 'Cliente guardado.')}>Guardar cliente</button>
      {clienteId && <div style={{ marginTop: 22, borderTop: '1px solid var(--border-default)', paddingTop: 18 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Ubicaciones de {cliente.nombre}</h3>
        <label style={field}>Ubicación existente
          <select className="app-select" style={selectControl} value={ubicacionId} onChange={e => chooseLocation(e.target.value)}><option value="">+ Nueva ubicación</option>{selectedLocations.map(u => <option key={u.id} value={u.id}>{u.nombre_obra}{u.unidad ? ` · ${u.unidad}` : ''}{!u.activo ? ' (inactiva)' : ''}</option>)}</select>
        </label>
        <div style={{ ...grid, marginTop: 12 }}>
          <label style={field}>Obra vinculada<select className="app-select" style={selectControl} value={sitio.proyecto_id} onChange={e => setSitio({ ...sitio, proyecto_id: e.target.value, nombre_obra: works.find(w => w.id === e.target.value)?.nombre ?? sitio.nombre_obra })}><option value="">Sin obra vinculada</option>{works.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}</select></label>
          <label style={field}>Tipo de inmueble<select className="app-select" style={selectControl} value={sitio.tipo_inmueble} onChange={e => setSitio({ ...sitio, tipo_inmueble: e.target.value })}><option value="residencial_altura">Residencial en altura</option><option value="oficina_altura">Oficinas en altura</option><option value="industrial">Industrial / fábrica</option><option value="otro">Otro</option></select></label>
          {([['nombre_obra', 'Nombre de obra o ubicación', 160], ['direccion', 'Dirección de la obra', 500], ['piso', 'Piso', 40], ['unidad', 'Unidad o departamento', 80], ['sector', 'Sector', 120]] as const).map(([key, label, max]) => <label key={key} style={field}>{label}<input style={control} maxLength={max} value={sitio[key]} onChange={e => setSitio({ ...sitio, [key]: e.target.value })} /></label>)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={sitio.activo} onChange={e => setSitio({ ...sitio, activo: e.target.checked })} />Ubicación activa</label>
        </div>
        <button style={{ ...button, marginTop: 12 }} disabled={busy || !sitio.nombre_obra.trim()} onClick={() => void run(
          () => supabase.rpc('plan_guardar_cliente_ubicacion', { p_tenant: tenantId, p_id: ubicacionId || null, p_cliente: clienteId, p_proyecto: sitio.proyecto_id || null, p_tipo: sitio.tipo_inmueble, p_nombre_obra: sitio.nombre_obra, p_direccion: sitio.direccion, p_piso: sitio.piso, p_unidad: sitio.unidad, p_sector: sitio.sector, p_activo: sitio.activo }),
          data => { const saved = data as Ubicacion; setUbicacionId(saved.id); }, 'Ubicación guardada.')}>Guardar ubicación</button>
        {!selectedLocations.length && <p style={{ color: 'var(--text-secondary)' }}>Este cliente aún no tiene ubicaciones.</p>}
      </div>}
      {clienteId && <div style={{ marginTop: 20, borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Historial de reclamos</h3>
        {historial.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr><th>OT</th><th>Obra y ubicación</th><th>Estado</th><th>Ingreso</th></tr></thead>
          <tbody>{historial.map(o => {
            const location = ubicaciones.find(u => u.id === o.cliente_ubicacion_id);
            const work = works.find(w => w.id === o.proyecto_id);
            return <tr key={o.id}><td style={{ padding: '8px 6px' }}>{o.ot}</td><td>{work?.nombre ?? 'Obra anterior'}{location?.unidad ? ` · ${location.unidad}` : ''}</td><td>{o.estado}</td><td>{new Date(o.created_at).toLocaleDateString('es-PY')}</td></tr>;
          })}</tbody>
        </table></div> : <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Todavía no hay reclamos vinculados a este cliente.</p>}
      </div>}
    </section>
    <section style={card}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Directorio de contratistas</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px' }}>Los usuarios eligen contratistas ya cargados al editar una OT.</p>
      <label style={field}>Contratista existente<select className="app-select" style={selectControl} value={contratistaId} onChange={e => chooseContractor(e.target.value)}><option value="">+ Nuevo contratista</option>{contratistas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <div style={{ marginTop: 12 }}>{fichaInputs(contratista, setContratista, 'contratista')}</div>
      <button style={{ ...button, marginTop: 12 }} disabled={busy || !contratista.nombre.trim()} onClick={() => void run(
        () => supabase.rpc('plan_guardar_contratista_ficha', { p_tenant: tenantId, p_id: contratistaId || null, p_nombre: contratista.nombre, p_identificacion: contratista.identificacion, p_contacto: contratista.contacto, p_telefono: contratista.telefono, p_correo: contratista.correo, p_direccion: contratista.direccion, p_activo: contratista.activo }),
        data => setContratistaId(String(data)), 'Contratista guardado.')}>Guardar contratista</button>
    </section>
    <p role="status" aria-live="polite" style={{ margin: 0 }}>{message}</p>
  </>;
}
