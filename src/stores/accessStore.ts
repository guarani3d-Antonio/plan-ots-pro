import { create } from 'zustand';
import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
export interface EmpresaAcceso { id: string; nombre: string; rol: string; puede_crear: boolean }
export interface ObraAcceso { id: string; tenant_id: string | null; nombre: string; editar: boolean; administrar: boolean; ver_costos: boolean }
export interface ContextoAcceso { creador: boolean; empresas: EmpresaAcceso[]; obras: ObraAcceso[] }
interface AccessState { contexto:ContextoAcceso|null;empresaId:string;disponible:boolean;error:string|null;refresh:()=>Promise<void> }
let inFlight:Promise<void>|null=null;
export const useAccessStore=create<AccessState>((set,get)=>({
  contexto:null,empresaId:'',disponible:false,error:null,
  refresh:()=>{
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      try {
        const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_contexto_acceso');assertSession(ticket);
        if(error)throw new Error(error.message);
        const contexto=data as ContextoAcceso,previous=get().contexto;
        if(previous&&JSON.stringify(previous)!==JSON.stringify(contexto)){
          set({disponible:false,error:'Los permisos cambiaron. Actualizando la sesión…'});window.location.reload();return;
        }
        set({contexto,empresaId:get().empresaId||(contexto.empresas.length===1?contexto.empresas[0].id:''),disponible:true,error:null});
      }catch(e){set({disponible:false,error:e instanceof Error?e.message:'No se pudieron validar los permisos'});}
    })().finally(()=>{inFlight=null;});return inFlight;
  },
}));
export function permisoObra(id:string|null|undefined):ObraAcceso|undefined {
  const s=useAccessStore.getState();return s.disponible?s.contexto?.obras.find(p=>p.id===id):undefined;
}
export function exigirPermiso(id:string,action:'editar'|'administrar'):void {
  sessionTicket();if(!permisoObra(id)?.[action])throw new Error('Tu rol no permite esta acción en la obra.');
}
export function usePermisoObra(id:string|null|undefined):ObraAcceso|undefined {
  return useAccessStore(s=>s.disponible?s.contexto?.obras.find(p=>p.id===id):undefined);
}
