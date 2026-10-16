import {anticipoDisponible,saldoComprobante,versionAdjudicada,type ComprobantePresupuesto,type MonedaPresupuesto,type PagoPresupuesto,type Presupuesto} from './contractorBudgetModel';
export type TipoFinanzas='invoice'|'payment'|'advance';
export interface DatosFinanzas {budget:string;invoice:string;reference:string;amount:number;date:string;due:string;method:string;apply:boolean}
/** Read-only preview of the existing RPC limits; the server remains authoritative. */
export function resumenFormularioFinanzas(tipo:TipoFinanzas,valor:DatosFinanzas,presupuesto:Presupuesto|undefined,facturas:ComprobantePresupuesto[],pagos:PagoPresupuesto[],moneda:MonedaPresupuesto){
 const version=presupuesto&&versionAdjudicada(presupuesto),factor=moneda==='PYG'?1:100,round=(n:number)=>Math.round((n+Number.EPSILON)*factor)/factor;
 const total=version?.total??0,delPresupuesto=facturas.filter(f=>f.presupuesto_id===presupuesto?.id),movimientos=pagos.filter(p=>p.presupuesto_id===presupuesto?.id);
 const facturado=round(delPresupuesto.reduce((n,f)=>n+f.importe,0)),entregado=round(movimientos.reduce((n,p)=>n+p.importe,0));
 const factura=delPresupuesto.find(f=>f.id===valor.invoice),saldo=factura?round(saldoComprobante(factura,movimientos)):0,disponible=presupuesto?round(anticipoDisponible(presupuesto.id,movimientos)):0;
 const aplicado=tipo==='payment'&&valor.apply?Math.max(0,Math.min(disponible,saldo)):0;
 const limite=round(Math.max(0,tipo==='invoice'?total-facturado:tipo==='advance'?total-entregado:Math.min(saldo-aplicado,total-entregado)));
 let error='';
 if(!version)error='Seleccioná un presupuesto adjudicado con permiso de edición.';
 else if(tipo==='payment'&&(!factura||saldo<=0))error='Seleccioná una factura con saldo pendiente.';
 else if(!Number.isFinite(valor.amount)||valor.amount<0)error='Revisá el importe ingresado.';
 else if(Math.abs(round(valor.amount)-valor.amount)>1e-8)error=moneda==='PYG'?'Los importes en guaraníes se registran sin decimales.':'El importe admite hasta dos decimales.';
 else if(valor.amount>limite+1e-8)error=tipo==='invoice'?'La factura supera lo disponible del presupuesto adjudicado.':tipo==='advance'?'El anticipo supera el importe pendiente de entregar.':'El pago y el anticipo aplicado superan el saldo disponible.';
 else if(tipo==='payment'&&valor.amount+aplicado<=0)error='Indicá un nuevo pago o aplicá el anticipo disponible.';
 else if(tipo!=='payment'&&valor.amount<=0)error='Ingresá un importe mayor que cero.';
 return {version,total,facturado,entregado,factura,saldo,disponible,aplicado,limite,error,restante:round(Math.max(0,(tipo==='invoice'?total-facturado-valor.amount:tipo==='advance'?disponible+valor.amount:saldo-aplicado-valor.amount)))};
}
