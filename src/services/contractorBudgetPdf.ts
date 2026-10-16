import type {Presupuesto,VersionPresupuesto,FirmaPresupuesto} from './contractorBudgetModel';
import {crearPdfPresupuesto as crearPdfHistorico} from './contractorBudgetPdfLegacy';
import {crearPdfPresupuestoNuevo} from './contractorBudgetPdfBranded';
import {BUDGET_BRANDING_VERSION} from './documentBranding';
/** Renderer is frozen by the saved version, never by today's company profile. */
export function crearPdfPresupuesto(b:Presupuesto,v:VersionPresupuesto,signatures:FirmaPresupuesto[],logo?:string):Blob{
 if(!v.fuentes.plantilla_version)return crearPdfHistorico(b,v,signatures,logo);
 if(v.fuentes.plantilla_version!==BUDGET_BRANDING_VERSION)throw Error('La plantilla de esta versión no es compatible.');
 return crearPdfPresupuestoNuevo(b,v,signatures,logo);
}
