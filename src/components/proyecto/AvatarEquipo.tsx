import {useEffect,useState} from 'react';
import {supabase} from '../../db/supabase';
import type {TeamPerson} from '../../services/teamService';
import s from './JerarquiasEmpresa.module.css';
export function AvatarEquipo({person}:{person:Pick<TeamPerson,'id'|'nombre'|'avatar_path'>}){
 const [image,setImage]=useState<{path:string;url:string}|null>(null);
 useEffect(()=>{let active=true;const path=person.avatar_path;if(path?.startsWith(person.id+'/'))void supabase.storage.from('profile-photos').createSignedUrl(path,300).then(r=>{if(active&&!r.error&&r.data)setImage({path,url:r.data.signedUrl})});return()=>{active=false}},[person.id,person.avatar_path]);
 return <span className={s.avatar}>{image?.path===person.avatar_path&&image?.url?<img src={image.url} alt=""/>:person.nombre.split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase()}</span>;
}
