import {comercioRpc} from './contractorCommerceService';
import type {FichaContratista} from './workDirectoryService';
export interface ContratistaDesdePlan {nombre:string;identificacion:string;especialidad:string;telefono:string;correo:string}
export const crearContratistaDesdePlan=(orden:string,datos:ContratistaDesdePlan,solicitud:string)=>comercioRpc<FichaContratista>('plan_contratista_crear_desde_plan',{p_orden:orden,p_datos:datos,p_solicitud:solicitud});
