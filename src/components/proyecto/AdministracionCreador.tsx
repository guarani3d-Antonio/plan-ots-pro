import { useEffect,useState } from 'react';
import { supabase } from '../../db/supabase';
import { useAccessStore } from '../../stores/accessStore';
import { PoliticasDocumentales } from './PoliticasDocumentales';
import { DirectoriosCreador } from './DirectoriosCreador';
import { PanelAdministracion as DialogDirectorioOT } from './PanelAdministracion';
import {PanelAdministracionContext} from './panelAdministracionContext';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import { ObrasCreador } from './ObrasCreador';
import { EmpresasCreador } from './EmpresasCreador';
import { assertSession,sessionTicket } from '../../security/sessionScope';
import { ConfiguracionDashboardCreador } from './ConfiguracionDashboardCreador';
import { MapaAccesosCreador } from './MapaAccesosCreador';
import styles from './AdministracionCreador.module.css';

const panel: React.CSSProperties = { border: '1px solid var(--border-default)', borderRadius: 8, padding: 12, background: 'var(--bg-surface)' };
const field: React.CSSProperties = { display: 'grid', gap: 6, minWidth: 0 };
const control: React.CSSProperties = { minHeight: 34, padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit' };
const button: React.CSSProperties = { ...control, width: 'fit-content', cursor: 'pointer', background: 'var(--accent)', color: 'white', fontWeight: 600 };
const tiposNotificacion = [
  ['nueva_ot', 'OT nuevas'], ['estado', 'Cambios de estado'], ['riesgo', 'Riesgo alto o extremo'],
] as const;
const roles = [['administrador', 'Administrador'], ['supervisor', 'Supervisor'], ['tecnico', 'Técnico'], ['viewer', 'Lector']] as const;
const empresaPiloto = '9159153b-eac0-49df-80d5-649ced2c7887';
const secciones = [['empresas','Empresas'],['obras','Obras'],['clientes','Clientes'],['contratistas','Contratistas'],['usuarios','Usuarios y permisos'],['informes','Configuración de informes'],['dashboard','Dashboard']] as const;
type Seccion = typeof secciones[number][0];

export function AdministracionCreador() {
  const { contexto, empresaId, refresh } = useAccessStore();
  const [seccion,setSeccion]=useState<Seccion>('empresas');
  const [crearEmpresa,setCrearEmpresa]=useState(false);
  const [email, setEmail] = useState('');
  const [nombreInvitado, setNombreInvitado] = useState('');
  const [apellidosInvitado, setApellidosInvitado] = useState('');
  const [rol, setRol] = useState('viewer');
  const [activo, setActivo] = useState(true);
  const [obra, setObra] = useState('');
  const [rolObra, setRolObra] = useState('viewer');
  const [notificaciones, setNotificaciones] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [crearObra, setCrearObra] = useState(false);
  const [editorDestino,setEditorDestino]=useState<HTMLDivElement|null>(null);
  const [accesosCuenta,setAccesosCuenta]=useState<Record<string,string>>({});
  const [cuentaAbierta,setCuentaAbierta]=useState(false);
  function abrirCuenta(esSupervisor=false){setAccesosCuenta({});setEmail('');setNombreInvitado('');setApellidosInvitado('');setObra('');setActivo(true);setRol(esSupervisor?'supervisor':'viewer');setRolObra(esSupervisor?'supervisor':'viewer');setMensaje('');setCuentaAbierta(true)}
  const [versionAccesos, setVersionAccesos] = useState(0);

  useEffect(() => {
    if (!contexto?.creador || !empresaId) return;
    let active = true;
    Promise.resolve(supabase.rpc('plan_notificaciones_config', { p_tenant: empresaId })).then(config => {
      if (!active) return;
      if (config.error) throw new Error(config.error.message);
      setNotificaciones(Object.fromEntries((config.data ?? []).map((r: { rol: string; tipos: string[] }) => [r.rol, r.tipos])));
    }).catch(e => { if (active) setMensaje(e instanceof Error ? e.message : 'No se pudo cargar la configuración.'); });
    return () => { active = false; };
  }, [contexto?.creador, empresaId]);

  if (!contexto?.creador) return null;

  async function ejecutar(action: () => PromiseLike<{ error: { message: string } | null }>) {
    if(busy)return false;
    setBusy(true); setMensaje('');
    try {
      const ticket=sessionTicket();
      const r = await action();
      assertSession(ticket);
      if (r.error) throw new Error(r.error.message);
      setMensaje('Cambio guardado.');
      setVersionAccesos(version => version + 1);
      await refresh();
      return true;
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo completar el cambio.');return false; }
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

  async function invitarUsuario() {
    if (!empresaId || !email.trim() || busy) return;
    setBusy(true); setMensaje('');
    try {
      const { error } = await supabase.functions.invoke('invitar-usuario', {
        body: { tenantId: empresaId, email: email.trim(), rol, nombre: nombreInvitado.trim(), apellidos: apellidosInvitado.trim() },
      });
      if (error) throw new Error(error.message);
      setMensaje(`Invitación enviada a ${email.trim()}. Su rol en la empresa quedó asignado.`);
      await refresh();
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo enviar la invitación.'); }
    finally { setBusy(false); }
  }

  const empresa = contexto.empresas.find(e => e.id === empresaId);
  const limiteInvitaciones = empresaId === empresaPiloto ? 2 : 4;
  return <PanelAdministracionContext.Provider value={editorDestino}><div className={styles.creator}>
    <header className={styles.pageHeader}><div>
      <h1 style={{ margin: 0, fontSize: 26 }}>Administración</h1>
      <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Administrá las empresas, las cuentas, los responsables y los directorios compartidos.</p>
    </div><label className={styles.companyContext}>Empresa seleccionada
      <select className="app-select" value={empresaId} onChange={e => useAccessStore.setState({ empresaId: e.target.value })}>
        <option value="">Seleccionar empresa</option>
        {contexto.empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select>
    </label></header>
    <div className={styles.administrationLayout}>
    <nav className={styles.navigation} aria-label="Administrar registros y configuración">{secciones.map(([id,label])=><button key={id} type="button" aria-pressed={seccion===id} disabled={id!=='empresas'&&id!=='dashboard'&&!empresaId} onClick={()=>setSeccion(id)}>{label}</button>)}</nav>
    <div className={styles.catalogArea}><main className={styles.catalogContent}>
    {seccion==='empresas'&&<div><EmpresasCreador crear={crearEmpresa} onCerrarCrear={()=>setCrearEmpresa(false)}/></div>}
    {empresaId&&seccion==='obras'&&<div><ObrasCreador key={`obras-${empresaId}`} tenantId={empresaId} crearAbierto={crearObra} onCerrarCrear={()=>setCrearObra(false)}/></div>}
    {seccion==='usuarios'&&<section className={styles.workspace}>
      <div className={styles.sectionHeader}><div><h2>Usuarios y permisos</h2><p>Buscá una persona para administrar su cuenta y las obras asignadas.</p></div>
    <button style={button} type="button" disabled={!empresaId} onClick={()=>abrirCuenta()}>+ Crear usuario</button>
      </div>
    {empresaId && <MapaAccesosCreador key={`${empresaId}-${versionAccesos}`} empresaId={empresaId} onEditar={cuenta=>{setAccesosCuenta(cuenta.accesos);setEmail(cuenta.email);setRol(cuenta.rol);setActivo(cuenta.activo);setObra('');setRolObra('viewer');setNombreInvitado('');setApellidosInvitado('');setMensaje('');setCuentaAbierta(true)}} />}
    <details className={styles.seccion}><summary className={styles.titulo}>Opciones avanzadas: permisos y notificaciones</summary><div className={styles.contenido}><section style={panel}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Cómo se aplican los permisos</h2>
      <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text-secondary)' }}>El rol de empresa identifica a la persona. El acceso operativo se asigna obra por obra: Lector consulta, Técnico registra y actualiza OTs, y Supervisor además puede ver costos. Solo el Creador administra cuentas, directorios y notificaciones. Sin una obra asignada, la cuenta entra pero no ve OTs ni proyectos de campo.</p>
    </section>
    {empresaId && <section style={panel}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Notificaciones por rol</h2>
      <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)' }}>Elegí qué avisos básicos recibe cada rol en esta empresa. Cada persona recibe solamente eventos de las obras a las que tiene acceso; los cambios completos siguen disponibles en el historial de cada OT.</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr><th style={{ padding: 10 }}>Rol</th>{tiposNotificacion.map(([, label]) => <th key={label} style={{ padding: 10 }}>{label}</th>)}</tr></thead>
        <tbody>{roles.map(([role, label]) => <tr key={role}>
          <th style={{ padding: 10, borderTop: '1px solid var(--border-default)' }}>{label}</th>
          {tiposNotificacion.map(([type]) => <td key={type} style={{ padding: 10, borderTop: '1px solid var(--border-default)' }}><input aria-label={`${label}: ${type}`} type="checkbox" checked={(notificaciones[role] ?? ['nueva_ot', 'estado']).includes(type)} onChange={e => setNotificaciones(prev => ({ ...prev, [role]: e.target.checked ? [...new Set([...(prev[role] ?? ['nueva_ot', 'estado']), type])] : (prev[role] ?? ['nueva_ot', 'estado']).filter(t => t !== type) }))} /></td>)}
        </tr>)}</tbody>
      </table></div>
      <button style={{ ...button, marginTop: 14 }} disabled={busy} onClick={() => void guardarNotificaciones()}>Guardar notificaciones</button>
    </section>}
      </div></details>
    </section>}
    {empresaId && (seccion==='clientes'||seccion==='contratistas')&&<div><DirectoriosCreador key={`directorios-${empresaId}-${seccion}`} tenantId={empresaId} obras={contexto.obras} seccion={seccion==='contratistas'?'contratistas':'clientes'} /></div>}
    {empresaId&&seccion==='informes'&&<div><PoliticasDocumentales key={empresaId} tenantId={empresaId}/></div>}
    {seccion==='dashboard'&&<section className={styles.workspace}><ConfiguracionDashboardCreador /></section>}
    {seccion==='usuarios'&&cuentaAbierta&&<DialogDirectorioOT titulo="Cuenta, rol y acceso a obras" busy={busy} onCerrar={()=>setCuentaAbierta(false)}>    <section style={{display:"grid",gap:8}}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Cuentas, roles y responsables</h2>
      <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)' }}>Invitá cuentas nuevas por correo; para una cuenta existente, guardá su rol. Después asignale las obras correspondientes. Supervisor y técnico pueden figurar como responsables de OTs.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
        <div style={{ display: 'grid', alignContent: 'start', gap: 10 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{empresa ? `Empresa seleccionada: ${empresa.nombre}` : 'Elegí una empresa para administrar las cuentas.'}</p>
          <label style={field}><span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>Correo del usuario<VoiceInputButton compact value={email} onChange={setEmail}/></span><input style={control} type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <label style={field}><span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>Nombre para la invitación<VoiceInputButton compact value={nombreInvitado} onChange={setNombreInvitado}/></span><input style={control} value={nombreInvitado} onChange={e => setNombreInvitado(e.target.value)} /></label>
            <label style={field}><span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>Apellidos para la invitación<VoiceInputButton compact value={apellidosInvitado} onChange={setApellidosInvitado}/></span><input style={control} value={apellidosInvitado} onChange={e => setApellidosInvitado(e.target.value)} /></label>
          </div>
          <label style={field}>Rol en la empresa<select className="app-select" value={rol} onChange={e => setRol(e.target.value)}><option value="administrador">Administrador</option><option value="supervisor">Supervisor</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option></select></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Membresía activa</label>
          <button style={button} disabled={busy || !empresaId || !email.trim()} onClick={() => void ejecutar(() => supabase.rpc('plan_admin_miembro', { p_tenant: empresaId, p_email: email, p_rol: rol, p_activo: activo }))}>Guardar cuenta y rol</button>
          <button style={{ ...button, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} disabled={busy || !empresaId || !email.trim() || !activo} onClick={() => void invitarUsuario()}>Invitar cuenta nueva por correo</button>
          <label style={field}>Obra<select className="app-select" value={obra} onChange={e => {setObra(e.target.value);setRolObra(accesosCuenta[e.target.value]??'sin_acceso')}}><option value="">Seleccionar obra</option>{contexto.obras.filter(p => p.tenant_id === empresaId).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label style={field}>Permiso en la obra<select className="app-select" value={rolObra} onChange={e => setRolObra(e.target.value)}><option value="supervisor">Supervisor</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option><option value="sin_acceso">Retirar acceso</option></select></label>
          <button style={button} disabled={busy || !email.trim() || !contexto.obras.some(p => p.id === obra && p.tenant_id === empresaId)} onClick={() => void ejecutar(() => supabase.rpc('plan_admin_obra_miembro', { p_proyecto: obra, p_email: email, p_rol: rolObra })).then(ok=>{if(ok)setAccesosCuenta(a=>({...a,[obra]:rolObra}))})}>Guardar acceso a obra</button>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>Delegación de prueba: el supervisor podrá invitar hasta {limiteInvitaciones} Técnicos a las obras que supervisa.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button style={button} disabled={busy || !empresaId || !email.trim() || rol !== 'supervisor'} onClick={() => void ejecutar(() => supabase.rpc('plan_configurar_delegacion_invitacion', { p_tenant: empresaId, p_email: email.trim(), p_limite: limiteInvitaciones, p_activa: true }))}>Habilitar {limiteInvitaciones} invitaciones</button>
            <button style={{ ...button, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} disabled={busy || !empresaId || !email.trim()} onClick={() => void ejecutar(() => supabase.rpc('plan_configurar_delegacion_invitacion', { p_tenant: empresaId, p_email: email.trim(), p_limite: limiteInvitaciones, p_activa: false }))}>Desactivar invitaciones</button>
          </div>
        </div>
      </div>
    </section>
<p role="status" aria-live="polite">{mensaje}</p></DialogDirectorioOT>}
    <p role="status" aria-live="polite" style={{ margin: 0 }}>{mensaje}</p>
    </main><div className={styles.editorSlot} ref={setEditorDestino}/></div></div>
  </div></PanelAdministracionContext.Provider>;
}
