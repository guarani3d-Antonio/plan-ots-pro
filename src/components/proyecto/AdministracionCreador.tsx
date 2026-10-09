import {useContext,useState,useId,useEffect} from 'react';
import {supabase} from '../../db/supabase';
import {useAccessStore,tienePermiso} from '../../stores/accessStore';
import {PoliticasDocumentales} from './PoliticasDocumentales';
import {FichasAdministracion} from './FichasAdministracion';
import {GuardiaAdministracion} from './GuardiaAdministracion';
import {GuardiaAdministracionContext} from './guardiaAdministracionContext';
import type {TipoMaestro} from '../../services/masterDirectoryService';
import {PanelAdministracion} from './PanelAdministracion';
import {PanelAdministracionContext} from './panelAdministracionContext';
import {VoiceInputButton} from '../ui/VoiceInputButton';
import {assertSession,sessionTicket} from '../../security/sessionScope';
import {ConfiguracionDashboardCreador} from './ConfiguracionDashboardCreador';
import {JerarquiasEmpresa} from './JerarquiasEmpresa';
import {ReglasNotificacionesEmpresa} from './ReglasNotificacionesEmpresa';
import styles from './AdministracionCreador.module.css';

const sections=[['empresas','Empresas','empresa.ver'],['obras','Obras','obra.ver'],['clientes','Clientes','cliente.ver'],['contratistas','Contratistas','contratista.ver'],['contactos','Contactos','contacto.ver'],['usuarios','Usuarios','equipo.ver'],['permisos','Permisos','equipo.ver'],['jerarquias','Jerarquías','equipo.ver'],['informes','Configuración de informes','plataforma'],['dashboard','Dashboard','dashboard.configurar']] as const;
type Section=typeof sections[number][0];
export function AdministracionCreador(){const [target,setTarget]=useState<HTMLDivElement|null>(null);return <PanelAdministracionContext.Provider value={target}><GuardiaAdministracion><Administration setTarget={setTarget}/></GuardiaAdministracion></PanelAdministracionContext.Provider>}
function Administration({setTarget}:{setTarget:(element:HTMLDivElement|null)=>void}){
 const guard=useContext(GuardiaAdministracionContext),{contexto,empresaId}=useAccessStore();
 const [section,setSection]=useState<Section>(contexto?.creador?'empresas':'jerarquias'),[creating,setCreating]=useState(false),[version,setVersion]=useState(0);
 if(!contexto)return null;
 const company=contexto.empresas.find(e=>e.id===empresaId),creator=contexto.creador;
 const visible=sections.filter(([, ,permission])=>creator||tienePermiso(permission,undefined,empresaId));
 if(!creator&&!visible.length)return <p>No tenés acceso a Administración.</p>;
 const current=visible.some(([id])=>id===section)?section:visible[0][0];
 return <div className={styles.creator}><header className={styles.pageHeader}><div><h1 style={{margin:0,fontSize:24}}>{creator?'Administración':'Mi empresa'}</h1><p>Fichas, usuarios, permisos y jerarquías.</p></div><div className={styles.companyContext}><span>{creator?'Empresa seleccionada':'Mi empresa'}</span><strong>{company?.nombre??'Elegí una empresa en Empresas'}</strong>{creator&&<span>Para cambiarla: Empresas → Seleccionar</span>}</div></header>
 <div className={styles.administrationLayout}><nav className={styles.navigation} aria-label="Administración">{visible.map(([id,label])=><button key={id} disabled={id!=='empresas'&&id!=='dashboard'&&!empresaId} aria-pressed={current===id} onClick={()=>guard.solicitar(()=>{setCreating(false);setSection(id)})}>{id==='empresas'&&!creator?'Ficha de empresa':label}</button>)}</nav><div className={styles.catalogArea}><main className={styles.catalogContent}>
 {(['empresas','obras','clientes','contratistas','contactos'] as string[]).includes(current)&&(current==='empresas'||empresaId)&&<FichasAdministracion key={`${current}-${empresaId}`} tipo={current.slice(0,-1) as TipoMaestro} tenantId={empresaId} onSeleccionar={id=>useAccessStore.setState({empresaId:id})}/>}
 {empresaId&&(['usuarios','permisos','jerarquias'] as string[]).includes(current)&&<JerarquiasEmpresa key={`${empresaId}-${current}-${version}`} tenantId={empresaId} view={current as 'usuarios'|'permisos'|'jerarquias'} onNewAccount={creator?()=>setCreating(true):undefined}/>}
 {creator&&empresaId&&current==='informes'&&<PoliticasDocumentales key={empresaId} tenantId={empresaId}/>}
 {creator&&empresaId&&current==='permisos'&&<ReglasNotificacionesEmpresa key={empresaId} tenant={empresaId}/>}
 {creator&&current==='dashboard'&&<section className={styles.workspace}><ConfiguracionDashboardCreador/></section>}
 {creator&&creating&&empresaId&&<NewAccount tenant={empresaId} onClose={()=>setCreating(false)} onDone={()=>{setCreating(false);setVersion(v=>v+1)}}/>}
 </main><div className={styles.editorSlot} ref={setTarget}/></div></div></div>;
}
function NewAccount({tenant,onClose,onDone}:{tenant:string;onClose:()=>void;onDone:()=>void}){
 const guard=useContext(GuardiaAdministracionContext),guardId=useId();
 const [email,setEmail]=useState(''),[nombre,setNombre]=useState(''),[apellidos,setApellidos]=useState(''),[rol,setRol]=useState('supervisor'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>guard.registrar(guardId,!!(email||nombre||apellidos),busy),[guard,guardId,email,nombre,apellidos,busy]);
 async function create(invite:boolean){if(busy)return;setBusy(true);setError('');try{const ticket=sessionTicket();const r=invite?await supabase.functions.invoke('invitar-usuario',{body:{tenantId:tenant,email:email.trim(),nombre:nombre.trim(),apellidos:apellidos.trim(),rol}}):await supabase.rpc('plan_admin_miembro',{p_tenant:tenant,p_email:email.trim(),p_rol:rol,p_activo:true});assertSession(ticket);if(r.error)throw new Error(r.error.message);if('data' in r&&r.data?.error)throw new Error(r.data.error);onDone()}catch(e){setError(e instanceof Error?e.message:'No se pudo crear la cuenta')}finally{setBusy(false)}}
 return <PanelAdministracion titulo="Crear o vincular cuenta" busy={busy} onCerrar={()=>guard.solicitar(onClose,guardId)} acciones={<button className={styles.primaryButton} disabled={busy||!email.trim()||!nombre.trim()} onClick={()=>void create(true)}>Enviar invitación</button>}><p>Para responsables de empresa y cuentas administradas por la plataforma. Después asigná sus obras, permisos y cupos desde la ficha.</p>{[[nombre,setNombre,'Nombre'],[apellidos,setApellidos,'Apellidos'],[email,setEmail,'Correo']].map(([v,set,label])=><label className={styles.field} key={String(label)}><span className={styles.fieldLabel}>{String(label)}<VoiceInputButton compact disabled={busy} value={String(v)} onChange={set as (v:string)=>void}/></span><input disabled={busy} type={label==='Correo'?'email':'text'} value={String(v)} onChange={e=>(set as (v:string)=>void)(e.target.value)}/></label>)}<label className={styles.field}>Perfil inicial<select disabled={busy} value={rol} onChange={e=>setRol(e.target.value)}><option value="supervisor">Jefe</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option></select></label><button className={styles.secondaryButton} disabled={busy||!email.trim()} onClick={()=>void create(false)}>Vincular cuenta existente</button>{error&&<p role="alert">{error}</p>}</PanelAdministracion>;
}
