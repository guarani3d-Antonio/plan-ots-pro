import { forwardRef,useImperativeHandle,useCallback, useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import styles from './AdministracionCreador.module.css';
import { DialogDirectorioOT } from '../plano/DialogDirectorioOT';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import { FotoDirectorio } from '../plano/FotoDirectorio';
import { guardarFotoDirectorio } from '../../services/directoryPhotoService';
import { assertSession,sessionTicket } from '../../security/sessionScope';
import fichaStyles from '../plano/FichaDirectorio.module.css';

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
const field: React.CSSProperties = { display: 'grid', gap: 6, minWidth: 0 };
const control: React.CSSProperties = { minHeight: 34, padding: '6px 32px 6px 9px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', width: '100%', minWidth: 0 };
const selectControl: React.CSSProperties = { ...control, background: undefined };
const button: React.CSSProperties = { ...control, width: 'fit-content', cursor: 'pointer', background: 'var(--accent)', color: 'white', fontWeight: 600 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 };

export interface DirectoriosCreadorHandle { nuevoCliente:()=>void;nuevoContratista:()=>void }
export const DirectoriosCreador=forwardRef<DirectoriosCreadorHandle,{tenantId:string;obras:Obra[]}>(function DirectoriosCreador({ tenantId, obras },ref) {
  const [modal,setModal]=useState<'cliente'|'contratista'|null>(null);
  const [buscarCliente,setBuscarCliente]=useState(''),[buscarContratista,setBuscarContratista]=useState('');
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
  const [fotoCliente,setFotoCliente]=useState<File|null>(null),[fotoContratista,setFotoContratista]=useState<File|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useImperativeHandle(ref,()=>({nuevoCliente:()=>{setClienteId('');setCliente(emptyFicha());setFotoCliente(null);setUbicacionId('');setSitio(emptySitio());setMessage('');setModal('cliente')},nuevoContratista:()=>{setContratistaId('');setContratista(emptyFicha());setFotoContratista(null);setMessage('');setModal('contratista')}}));
  const coincide=(nombre:string,texto:string)=>nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
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
    setFotoCliente(null);
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
    setFotoContratista(null);
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
      const ticket=sessionTicket();
      const result = await operation();
      assertSession(ticket);
      if (result.error) throw new Error(result.error.message);
      await reload(); after(result.data); setMessage(success);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  const selectedLocations = ubicaciones.filter(u => u.cliente_id === clienteId);
  const works = obras.filter(p => p.tenant_id === tenantId);

  async function guardarPersona(kind:'cliente'|'contratista') {
    const value=kind==='cliente'?cliente:contratista;
    if(value.correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.correo))throw new Error('Revisá el correo.');
    const ticket=sessionTicket();
    const result=await supabase.rpc(kind==='cliente'?'plan_guardar_cliente':'plan_guardar_contratista_ficha',{
      p_tenant:tenantId,p_id:(kind==='cliente'?clienteId:contratistaId)||null,p_nombre:value.nombre,
      p_identificacion:value.identificacion,p_contacto:value.contacto,p_telefono:value.telefono,
      p_correo:value.correo,p_direccion:value.direccion,p_activo:value.activo});
    assertSession(ticket);if(result.error)return result;
    const id=kind==='cliente'?(result.data as Cliente).id:String(result.data);
    // Conservar el ID incluso si la foto falla evita duplicar un alta al reintentar.
    if(kind==='cliente')setClienteId(id);else setContratistaId(id);
    const photo=kind==='cliente'?fotoCliente:fotoContratista;
    if(photo){try{await guardarFotoDirectorio(kind,id,photo)}catch(e){throw new Error('La ficha se guardó, pero la foto no: '+(e instanceof Error?e.message:'Reintentá.'),{cause:e});}}
    if(kind==='cliente')setFotoCliente(null);else setFotoContratista(null);
    return result;
  }

  function fichaInputs(value: Ficha, update: (next: Ficha) => void, kind: 'cliente' | 'contratista') {
    const entries: { key: keyof Ficha; label: string; max: number }[] = [
      { key: 'nombre', label: kind === 'cliente' ? 'Nombre o razón social' : 'Nombre o razón social', max: 160 },
      { key: 'identificacion', label: 'RUC o documento', max: 80 },
      { key: 'contacto', label: 'Persona de contacto', max: 160 },
      { key: 'telefono', label: 'Teléfono', max: 80 },
      { key: 'correo', label: 'Correo', max: 254 },
      { key: 'direccion', label: kind === 'cliente' ? 'Domicilio del cliente' : 'Dirección del contratista', max: 500 },
    ];
    return <div style={grid}>{entries.map(({ key, label, max }) => <label key={key} style={field}><span style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>{label}<VoiceInputButton compact value={String(value[key])} maxLength={max} onChange={v=>update({...value,[key]:v})}/></span><input style={control} type={key === 'correo' ? 'email' : 'text'} maxLength={max} value={String(value[key])} onChange={e => update({ ...value, [key]: e.target.value })} /></label>)}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={value.activo} onChange={e => update({ ...value, activo: e.target.checked })} />Ficha activa</label></div>;
  }

  return <>
    <details className={styles.seccion}>
      <summary className={styles.titulo}>Clientes</summary>
      <div className={styles.contenido}>
    <label style={field}>Buscar cliente<input style={control} type="search" placeholder="Nombre o documento…" value={buscarCliente} onChange={e=>setBuscarCliente(e.target.value)}/></label>
    <button style={button} type="button" onClick={()=>{setClienteId('');setCliente(emptyFicha());setFotoCliente(null);setUbicacionId('');setSitio(emptySitio());setModal('cliente')}}>+ Crear cliente</button>
    {clientes.filter(c=>coincide(`${c.nombre} ${c.identificacion??''}`,buscarCliente)).map(c=><button key={c.id} style={{...control,textAlign:'left'}} type="button" onClick={()=>{chooseClient(c.id);setModal('cliente')}}>{c.nombre}{c.identificacion?` · ${c.identificacion}`:''}</button>)}
    {modal==='cliente'&&<DialogDirectorioOT titulo={clienteId?'Ficha del cliente':'Crear cliente'} busy={busy} onCerrar={()=>setModal(null)}>    <section>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Clientes y sus ubicaciones</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px' }}>Una ficha identifica al cliente. Cada departamento, oficina o planta se registra como ubicación y puede acumular varias OTs.</p>
      <label style={field}>Ficha existente
        <select className="app-select" style={selectControl} disabled={busy} value={clienteId} onChange={e => chooseClient(e.target.value)}><option value="">+ Nuevo cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.identificacion ? ` · ${c.identificacion}` : ''}</option>)}</select>
      </label>
      <div className={fichaStyles.editorPhoto}><FotoDirectorio tipo="cliente" id={clienteId||undefined} nombre={cliente.nombre||'Nuevo cliente'} archivo={fotoCliente} onArchivo={setFotoCliente} disabled={busy}/></div>
      <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div style={{ marginTop: 8 }}>{fichaInputs(cliente, setCliente, 'cliente')}</div></fieldset>
      <button style={{ ...button, marginTop: 12 }} disabled={busy || !cliente.nombre.trim()} onClick={() => void run(
        () => guardarPersona('cliente'),
        data => { const saved = data as Cliente; setClienteId(saved.id); }, 'Cliente guardado.')}>Guardar cliente</button>
      {clienteId && <div style={{ marginTop: 22, borderTop: '1px solid var(--border-default)', paddingTop: 18 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Ubicaciones de {cliente.nombre}</h3>
        <label style={field}>Ubicación existente
          <select className="app-select" style={selectControl} value={ubicacionId} onChange={e => chooseLocation(e.target.value)}><option value="">+ Nueva ubicación</option>{selectedLocations.map(u => <option key={u.id} value={u.id}>{u.nombre_obra}{u.unidad ? ` · ${u.unidad}` : ''}{!u.activo ? ' (inactiva)' : ''}</option>)}</select>
        </label>
        <div style={{ ...grid, marginTop: 12 }}>
          <label style={field}>Obra vinculada<select className="app-select" style={selectControl} value={sitio.proyecto_id} onChange={e => setSitio({ ...sitio, proyecto_id: e.target.value, nombre_obra: works.find(w => w.id === e.target.value)?.nombre ?? sitio.nombre_obra })}><option value="">Sin obra vinculada</option>{works.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}</select></label>
          <label style={field}>Tipo de inmueble<select className="app-select" style={selectControl} value={sitio.tipo_inmueble} onChange={e => setSitio({ ...sitio, tipo_inmueble: e.target.value })}><option value="residencial_altura">Residencial en altura</option><option value="oficina_altura">Oficinas en altura</option><option value="industrial">Industrial / fábrica</option><option value="otro">Otro</option></select></label>
          {([['nombre_obra', 'Nombre de obra o ubicación', 160], ['direccion', 'Dirección de la obra', 500], ['piso', 'Piso', 40], ['unidad', 'Unidad o departamento', 80], ['sector', 'Sector', 120]] as const).map(([key, label, max]) => <label key={key} style={field}><span style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>{label}<VoiceInputButton compact value={sitio[key]} maxLength={max} onChange={v=>setSitio({...sitio,[key]:v})}/></span><input style={control} maxLength={max} value={sitio[key]} onChange={e => setSitio({ ...sitio, [key]: e.target.value })} /></label>)}
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
    </section>{message&&<p role="status">{message}</p>}</DialogDirectorioOT>}

      </div>
    </details>
    <details className={styles.seccion}>
      <summary className={styles.titulo}>Contratistas</summary>
      <div className={styles.contenido}>
    <label style={field}>Buscar contratista<input style={control} type="search" placeholder="Nombre o razón social…" value={buscarContratista} onChange={e=>setBuscarContratista(e.target.value)}/></label>
    <button style={button} type="button" onClick={()=>{setContratistaId('');setContratista(emptyFicha());setFotoContratista(null);setModal('contratista')}}>+ Crear contratista</button>
    {contratistas.filter(c=>coincide(c.nombre,buscarContratista)).map(c=><button key={c.id} style={{...control,textAlign:'left'}} type="button" onClick={()=>{chooseContractor(c.id);setModal('contratista')}}>{c.nombre}</button>)}
    {modal==='contratista'&&<DialogDirectorioOT titulo={contratistaId?'Ficha del contratista':'Crear contratista'} busy={busy} onCerrar={()=>setModal(null)}>    <section>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Directorio de contratistas</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px' }}>Los usuarios eligen contratistas ya cargados al editar una OT.</p>
      <label style={field}>Contratista existente<select className="app-select" style={selectControl} disabled={busy} value={contratistaId} onChange={e => chooseContractor(e.target.value)}><option value="">+ Nuevo contratista</option>{contratistas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <div className={fichaStyles.editorPhoto}><FotoDirectorio tipo="contratista" id={contratistaId||undefined} nombre={contratista.nombre||'Nuevo contratista'} archivo={fotoContratista} onArchivo={setFotoContratista} disabled={busy}/></div>
      <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div style={{ marginTop: 8 }}>{fichaInputs(contratista, setContratista, 'contratista')}</div></fieldset>
      <button style={{ ...button, marginTop: 12 }} disabled={busy || !contratista.nombre.trim()} onClick={() => void run(
        () => guardarPersona('contratista'),
        data => setContratistaId(String(data)), 'Contratista guardado.')}>Guardar contratista</button>
    </section>{message&&<p role="status">{message}</p>}</DialogDirectorioOT>}

      </div>
    </details>
    <p role="status" aria-live="polite" style={{ margin: 0 }}>{message}</p>
  </>;
});
