import {useEffect,useState} from 'react';
import {supabase} from '../../db/supabase';
import {assertSession,sessionTicket} from '../../security/sessionScope';
import s from './Responsables.module.css';
export function FotoResponsable({id,nombre,path,archivo,compacta=false}:{id:string;nombre:string;path?:string|null;archivo?:File|null;compacta?:boolean}){
 const [image,setImage]=useState({path:'',url:'',error:''}),[local,setLocal]=useState<{file:File;url:string}|null>(null),[fallo,setFallo]=useState('');
 useEffect(()=>{if(!archivo)return;const url=URL.createObjectURL(archivo);setLocal({file:archivo,url});return()=>URL.revokeObjectURL(url)},[archivo]);
 useEffect(()=>{if(!path?.startsWith(id+'/'))return;let active=true;
  const load=async()=>{try{const ticket=sessionTicket(),r=await supabase.storage.from('profile-photos').createSignedUrl(path,300);assertSession(ticket);if(r.error)throw Error(r.error.message);if(active)setImage({path,url:r.data.signedUrl,error:''})}catch{if(active)setImage({path,url:'',error:'Foto no disponible.'})}};
  void load();const timer=window.setInterval(()=>void load(),240000);return()=>{active=false;clearInterval(timer)};
 },[id,path]);
 const url=archivo?(local?.file===archivo?local.url:''):image.path===path?image.url:'';
 return <div><span className={`${s.photo} ${compacta?s.smallPhoto:''}`}>{url&&fallo!==url?<img src={url} alt={`Foto de ${nombre}`} onError={()=>setFallo(url)}/>:<span aria-label="Sin foto disponible">{nombre.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()||'—'}</span>}</span>{!compacta&&image.path===path&&image.error&&<small className={s.photoError}>{image.error}</small>}</div>;
}
