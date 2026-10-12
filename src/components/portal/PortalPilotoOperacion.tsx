import {useEffect,useState} from 'react';
import {configurarPortal,estadoPortal,type PortalStatus} from '../../services/claimsPilotService';
import {portalConectado} from '../../services/portalPublicService';
import {cartelPortal,enlacePortalConectado,type ContextoPortal} from '../../services/portalPilot';
import {PortalDialog} from './PortalDialog';
import s from './PortalReclamos.module.css';
export function PortalPilotoOperacion({context,logo,photo,imagesReady}:{context:ContextoPortal;logo:string;photo:string;imagesReady:boolean}) {
  const [status,setStatus]=useState<PortalStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState(false),[refresh,setRefresh]=useState(0);
  const enabled=portalConectado();
  useEffect(()=>{if(!enabled)return;let valid=true;void estadoPortal(context.obraId).then(v=>{if(valid){setStatus(v);setError('');}}).catch(e=>{if(valid)setError(e instanceof Error?e.message:'No se pudo comprobar el piloto.');});return()=>{valid=false;};},[context.obraId,refresh,enabled]);
  async function change(active:boolean) {
    if(busy)return;setBusy(true);setError('');
    try {await configurarPortal(context.obraId,context.sector,active);setDialog(false);setRefresh(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar la recepción.');}
    finally{setBusy(false);}
  }
  const config=status?.portal,active=!!config?.vigente,link=config?enlacePortalConectado(window.location.origin,config.id):'';
  function download() {
    if(!config||!imagesReady)return;
    const svg=cartelPortal({...context,sector:config.sector},link,logo,photo,true),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download=`QR-piloto-${context.obraId}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className={`${s.cloud} ${s.operations}`}><div className={s.title}><h3>Recepción conectada · piloto limitado</h3><span className={s.badge}>{!enabled?'Conexión pendiente':active?'Piloto activo':'Recepción pausada'}</span></div>
    <p className={s.hint}>Una obra · 48 horas · hasta seis solicitudes · tres fotos de hasta 2 MB cada una. Solo el Creador revisa este piloto.</p>
    {!enabled&&<p className={s.hint}>El formulario de demostración sigue disponible. La recepción con registros guardados se habilitará después de conectar y verificar el servicio.</p>}
    {config&&<p className={s.hint}>{config.usados} / {config.cupo} cupos utilizados · vence {new Date(config.vence_en).toLocaleString('es-PY')}.</p>}
    {enabled&&status&&!status.respaldo_listo&&<p className={s.warning}>Los nuevos envíos están pausados porque el respaldo no está operativo o su recuperación no está vigente.</p>}
    {error&&<p className={s.error} role="alert">{error}</p>}
    <div className={s.actions}>{active?<><button type="button" disabled={busy} onClick={()=>void change(false)}>Pausar recepción</button><button type="button" disabled={!imagesReady} onClick={download}>Descargar QR del piloto</button><a href={link} target="_blank" rel="noopener noreferrer">Abrir portal del piloto</a></>:<button type="button" className={s.primary} disabled={!enabled||!status?.respaldo_listo||busy} onClick={()=>setDialog(true)}>Activar piloto limitado</button>}{enabled&&<button type="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Actualizar estado</button>}</div>
    {dialog&&<PortalDialog title="Activar recepción de prueba" onClose={()=>{if(!busy)setDialog(false);}}><h3>{context.obra}</h3><p>Este QR permitirá guardar hasta seis solicitudes de invitados de prueba durante 48 horas. Usá datos ficticios y fotos sin personas ni documentos privados.</p><p className={s.hint}>Se conservarán contacto, pedido original y evidencias privadas en Supabase y en las copias cifradas. Máximo de fotos nuevas: 36 MB. Pausar no borra registros ni reinicia el cupo.</p><p className={s.hint}>No activa WhatsApp, no crea OTs automáticamente y no cambia el acceso de Ariel. El respaldo se comprueba en cada envío.</p>{error&&<p className={s.error} role="alert">{error}</p>}<div className={s.actions}><button type="button" disabled={busy} onClick={()=>setDialog(false)}>Cancelar</button><button type="button" className={s.primary} disabled={busy} onClick={()=>void change(true)}>{busy?'Activando…':'Activar seis cupos de prueba'}</button></div></PortalDialog>}
  </section>;
}
