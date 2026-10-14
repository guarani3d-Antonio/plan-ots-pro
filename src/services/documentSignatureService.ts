import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
import type { FirmaDocumento } from './documentSignatureModel';
export async function cargarFirmasDocumento(revision:string):Promise<FirmaDocumento[]> {
 const ticket=sessionTicket();
 const r=await supabase.rpc('plan_documento_firmas_leer',{p_revision:revision});assertSession(ticket);
 if(r.error)throw new Error(r.error.message);
 return r.data as FirmaDocumento[];
}
export async function registrarFirmaDocumento(revision:string,hash:string,espacio:string,imagen:string,solicitud:string):Promise<FirmaDocumento> {
 const ticket=sessionTicket();
 const r=await supabase.rpc('plan_documento_firmar',{p_revision:revision,p_sha256:hash,p_espacio:espacio,p_imagen:imagen,p_solicitud:solicitud});assertSession(ticket);
 if(r.error)throw new Error(r.error.message);
 return r.data as FirmaDocumento;
}
