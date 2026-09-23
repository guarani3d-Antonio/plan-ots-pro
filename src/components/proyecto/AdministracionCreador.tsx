import {useState} from 'react';
import {supabase} from '../../db/supabase';
import {useAccessStore} from '../../stores/accessStore';
import {PoliticasDocumentales} from './PoliticasDocumentales';

export function AdministracionCreador(){
 const {contexto,empresaId,refresh}=useAccessStore();
 const [nombre,setNombre]=useState(''),[email,setEmail]=useState(''),[rol,setRol]=useState('viewer');
 const [activo,setActivo]=useState(true),[obra,setObra]=useState(''),[rolObra,setRolObra]=useState('viewer');
 const [busy,setBusy]=useState(false),[mensaje,setMensaje]=useState('');
 if(!contexto?.creador)return null;
 async function ejecutar(action:()=>PromiseLike<{error:{message:string}|null}>){
  setBusy(true);setMensaje('');
  try{const r=await action();if(r.error)throw new Error(r.error.message);setMensaje('Cambio confirmado por el servidor.');await refresh();}
  catch(e){setMensaje(e instanceof Error?e.message:'No se pudo completar el cambio.');}finally{setBusy(false);}
 }
 const empresa=contexto.empresas.find(e=>e.id===empresaId);
 return <details style={{border:'1px solid var(--border-default)',padding:16,marginBottom:16,color:'var(--text-primary)',background:'var(--bg-surface)'}}>
  <summary>Administración del Creador</summary>
  <fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:12,marginTop:16}}>
   <label>Nombre de la nueva empresa <input aria-label="Nombre de la nueva empresa" value={nombre} onChange={e=>setNombre(e.target.value)}/></label>
   <button disabled={!nombre.trim()} onClick={()=>void ejecutar(()=>supabase.rpc('plan_admin_empresa',{p_nombre:nombre}))}>Crear empresa</button>
   {empresa&&<>
    <p>Empresa seleccionada: <strong>{empresa.nombre}</strong></p>
    <label>Correo de una cuenta existente <input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Rol en la empresa <select value={rol} onChange={e=>setRol(e.target.value)}>
     <option value="administrador">Administrador</option><option value="supervisor">Supervisor</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option>
    </select></label>
    <label><input type="checkbox" checked={activo} onChange={e=>setActivo(e.target.checked)}/>Membresía activa</label>
    <button disabled={!email.trim()} onClick={()=>void ejecutar(()=>supabase.rpc('plan_admin_miembro',{p_tenant:empresaId,p_email:email,p_rol:rol,p_activo:activo}))}>Guardar membresía de empresa</button>
    <label>Obra <select value={obra} onChange={e=>setObra(e.target.value)}><option value="">Seleccionar obra</option>{contexto.obras.filter(p=>p.tenant_id===empresaId).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
    <label>Permiso en la obra <select value={rolObra} onChange={e=>setRolObra(e.target.value)}><option value="supervisor">Supervisor</option><option value="tecnico">Técnico</option><option value="viewer">Lector</option><option value="sin_acceso">Retirar acceso</option></select></label>
    <button disabled={!email.trim()||!contexto.obras.some(p=>p.id===obra&&p.tenant_id===empresaId)} onClick={()=>void ejecutar(()=>supabase.rpc('plan_admin_obra_miembro',{p_proyecto:obra,p_email:email,p_rol:rolObra}))}>Guardar acceso a obra</button>
    <PoliticasDocumentales tenantId={empresaId}/>
   </>}
  </fieldset>
  {mensaje&&<p role="status">{mensaje}</p>}
 </details>;
}
