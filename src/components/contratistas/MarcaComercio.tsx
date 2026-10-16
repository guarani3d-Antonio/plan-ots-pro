import {useEffect,useState} from 'react';
import {cargarLogoEmpresa,cargarMarcaEmpresaProyecto} from '../../services/companyLogoService';
import {useAccessStore} from '../../stores/accessStore';
import s from './ComercioContratista.module.css';

/** Presentation only: no company, budget or document is written by this header. */
export function MarcaComercio({tenantId,proyectoId,nombre,logoPath,conservada=false}:{tenantId:string;proyectoId?:string;nombre?:string;logoPath?:string|null;conservada?:boolean}){
 const nombreAcceso=useAccessStore(a=>a.contexto?.empresas.find(e=>e.id===tenantId)?.nombre);
 const key=`${tenantId}/${proyectoId}/${conservada}/${logoPath??''}/${nombre??''}`;
 const [image,setImage]=useState<{key:string;logo?:string;error?:boolean}>({key:''});
 useEffect(()=>{let active=true;const read=conservada?cargarLogoEmpresa(tenantId,logoPath??null).then(logo=>({logo})):proyectoId?cargarMarcaEmpresaProyecto(proyectoId):Promise.resolve({logo:undefined});
  void read.then(r=>{if(active)setImage({key,logo:r.logo});}).catch(()=>{if(active)setImage({key,error:true});});return()=>{active=false};
 },[key,tenantId,proyectoId,logoPath,conservada]);
 const label=nombre||nombreAcceso||'Empresa de la obra',initials=label.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 return <span className={s.companyBrand} aria-label={image.key===key&&image.error?`Logo de ${label} no disponible`:`${label}`}>{image.key===key&&image.logo?<img src={image.logo} alt={`Logo de ${label}`} onError={()=>setImage({key,error:true})}/>:initials}</span>;
}
