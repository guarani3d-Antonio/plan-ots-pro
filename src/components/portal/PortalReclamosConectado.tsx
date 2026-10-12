import {useEffect,useState} from 'react';
import {cargarPortalPublico,type PortalPublico} from '../../services/portalPublicService';
import {PortalReclamosPiloto} from './PortalReclamosPiloto';
import s from './PortalReclamos.module.css';
export function PortalReclamosConectado({id}:{id:string}) {
  const [context,setContext]=useState<PortalPublico|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let valid=true;void cargarPortalPublico(id).then(c=>{if(valid){setContext(c);setError('');}}).catch(e=>{if(valid)setError(e instanceof Error?e.message:'No se pudo cargar la obra.');});return()=>{valid=false;};},[id,retry]);
  if(context)return <PortalReclamosPiloto key={id} context={context} real={{portalId:id,disponible:context.disponible}}/>;
  return <main className={`${s.root} ${s.public}`}><section className={`${s.portal} ${s.portalBody}`}><h1>Portal de reclamos</h1><p className={s.hint}>{error||'Comprobando el portal de esta obra…'}</p>{error&&<button type="button" onClick={()=>{setError('');setRetry(v=>v+1);}}>Reintentar</button>}</section></main>;
}
