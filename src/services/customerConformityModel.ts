import { espaciosFirma, type EspacioFirma } from './documentSignatureModel';
export const DECISIONES_CONFORMIDAD=['Conforme','Conforme con observaciones','No conforme'] as const;
export interface PendienteConformidad {id:string;descripcion:string;responsable:string;fecha:string}
export interface ConformidadPreparada {version:1;decision:string;receptor:string;calidad:'Cliente'|'Contacto';espacioReceptor:string;motivo:string;confirmada:boolean;pendientes:PendienteConformidad[]}
export interface ConformidadRegistrada {id:string;revision_id:string;firma_id:string;contenido_sha256:string;decision:string;receptor:string;calidad:string;registrada_en:string;registrada_por:string}
export interface SeguimientoConformidad extends PendienteConformidad {pendiente_id:string;resuelto_en:string|null;resuelto_por:string|null;constancia:string|null}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function leerConformidad(acta:unknown):ConformidadPreparada|null {
 const raw=(acta as Record<string,unknown>|null)?.conformidadJSON;if(!raw)return null;
 if(typeof raw!=='string')throw new Error('Conformidad inválida.');
 let c:ConformidadPreparada;try{c=JSON.parse(raw)}catch{throw new Error('Conformidad inválida.')}
 if(!c||c.version!==1||!Array.isArray(c.pendientes)||typeof c.decision!=='string'||typeof c.receptor!=='string'||!['Cliente','Contacto'].includes(c.calidad)||typeof c.espacioReceptor!=='string'||typeof c.motivo!=='string'||typeof c.confirmada!=='boolean')throw new Error('Conformidad inválida.');
 if(c.pendientes.length>100||c.pendientes.some(p=>!p||!uuid.test(p.id)||typeof p.descripcion!=='string'||typeof p.responsable!=='string'||typeof p.fecha!=='string')||new Set(c.pendientes.map(p=>p.id)).size!==c.pendientes.length)throw new Error('Pendientes inválidos.');
 return c;
}
export function nuevaConformidad(receptor:string,slots:EspacioFirma[]):ConformidadPreparada {return {version:1,decision:'',receptor,calidad:'Cliente',espacioReceptor:slots.find(s=>s.categoria==='Cliente')?.id??'',motivo:'',confirmada:false,pendientes:[]};}
export function validarConformidad(datos:Record<string,unknown>):string|null {
 try{const c=leerConformidad(datos.acta);if(!c)return null;
 if(!DECISIONES_CONFORMIDAD.includes(c.decision as typeof DECISIONES_CONFORMIDAD[number]))return 'Elegí la decisión del cliente.';
 if(!c.receptor.trim()||c.receptor.length>200)return 'Indicá el receptor (hasta 200 caracteres).';
 if(!c.confirmada)return 'Confirmá que la decisión fue expresada por el receptor.';
 if(!espaciosFirma(datos.firmantes??[]).some(s=>s.id===c.espacioReceptor&&s.categoria===c.calidad))return 'Elegí el espacio de firma del receptor.';
 if(c.decision==='No conforme'&&!c.motivo.trim())return 'Indicá el motivo de la no conformidad.';
 if(c.motivo.length>4000)return 'El motivo supera los 4000 caracteres.';
 if(c.decision==='Conforme'&&c.pendientes.length)return 'Una conformidad sin observaciones no debe incluir pendientes.';
 if(c.decision!=='Conforme'&&!c.pendientes.length)return 'Agregá un pendiente para dar seguimiento a las observaciones.';
 if(c.pendientes.some(p=>!p.descripcion.trim()||p.descripcion.length>2000||!p.responsable.trim()||p.responsable.length>200||!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)||!Number.isFinite(new Date(p.fecha+'T00:00:00').getTime())||new Date(p.fecha+'T00:00:00').getDate()!==Number(p.fecha.slice(8))))return 'Completá descripción, responsable y fecha válida de cada pendiente.';
 return null;
 }catch(e){return e instanceof Error?e.message:'Conformidad inválida.'}
}
export function confirmacionConformidad(acta:unknown,slot:EspacioFirma):string|undefined {const c=leerConformidad(acta);return c&&c.espacioReceptor===slot.id?`${c.receptor} · ${c.decision}. Confirmo que esta es mi firma y que expresé esta decisión y las observaciones de esta versión.`:undefined;}
