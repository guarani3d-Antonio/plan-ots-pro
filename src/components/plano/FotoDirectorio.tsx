import { useEffect, useId, useRef, useState } from 'react';
import { DIRECTORIO_FOTO_EVENTO, fotoDirectorio, type TipoFicha } from '../../services/directoryPhotoService';
import { DialogDirectorioOT } from './DialogDirectorioOT';
import styles from './FichaDirectorio.module.css';

export function FotoDirectorio({ tipo, id, nombre, archivo, onArchivo, disabled = false }: {
  tipo: TipoFicha; id?: string; nombre: string; archivo?: File | null;
  onArchivo?: (file: File | null) => void; disabled?: boolean;
}) {
  const inputId = useId();
  const input=useRef<HTMLInputElement>(null);
  const [remote, setRemote] = useState({ key: '', url: '', error: '' });
  const [local, setLocal] = useState<{file:File;url:string}|null>(null);
  const [ampliar, setAmpliar] = useState(false);
  const [falloImagen, setFalloImagen] = useState('');
  const imagenNombre = tipo === 'empresa' ? 'logo' : 'foto';
  useEffect(() => {
    if (!archivo) return;
    let active=true;
    const url = URL.createObjectURL(archivo);
    void Promise.resolve().then(()=>{if(active)setLocal({file:archivo,url})});
    return () => { active=false;URL.revokeObjectURL(url); };
  }, [archivo]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = () => { void fotoDirectorio(tipo, id).then(f => {
      if (active) setRemote({ key: `${tipo}/${id}`, url: f.url, error: '' });
    }).catch(e => { if (active) setRemote({ key: `${tipo}/${id}`, url: '', error: e instanceof Error ? e.message : 'No se pudo cargar la foto.' }); }); };
    const change = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.tipo === tipo && detail.id === id) load(); };
    load();
    const timer = window.setInterval(load, 240_000);
    window.addEventListener(DIRECTORIO_FOTO_EVENTO, change);
    return () => { active = false; clearInterval(timer); window.removeEventListener(DIRECTORIO_FOTO_EVENTO, change); };
  }, [tipo, id]);
  const source = archivo ? local?.file===archivo?local.url:'' : remote.key === `${tipo}/${id}` ? remote.url : '';
  const initials = nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const image = source && falloImagen !== source ? <img src={source} alt={`${tipo==='empresa'?'Logo':'Foto'} de ${nombre}`} onError={() => setFalloImagen(source)} />
    : <span aria-label={tipo === 'obra' ? 'Obra sin foto' : 'Ficha sin foto'}>{tipo === 'obra' ? '▥' : initials || '—'}</span>;
  return <div className={styles.photoColumn}>
    <button type="button" className={`${styles.photo} ${tipo === 'obra' ? styles.workPhoto : ''} ${tipo==='empresa'?styles.logoPhoto:''}`} disabled={disabled||(!onArchivo&&(!source || falloImagen === source))}
      aria-label={`${!source&&onArchivo?'Cargar':'Ampliar'} ${imagenNombre} de ${nombre}`} title={!source?(tipo==='empresa'?'Sin logo cargado. Usá Editar para agregarlo.':'Sin foto cargada. Usá Editar para agregarla.'):`Ampliar ${imagenNombre}`} onClick={() => {if(source&&falloImagen!==source)setAmpliar(true);else input.current?.click();}}>{image}</button>
    {onArchivo && <><label htmlFor={inputId} className={styles.photoLabel}>{source?`Cambiar ${imagenNombre}`:`Cargar ${imagenNombre}`}<input ref={input} aria-label={`Seleccionar ${imagenNombre} de ${nombre}`} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={e => { const file = e.target.files?.[0]; if (file) onArchivo(file); e.target.value = ''; }} /></label>
      {archivo && <button type="button" className={styles.linkButton} disabled={disabled} onClick={() => onArchivo(null)}>{tipo==='empresa'?'Descartar logo nuevo':'Descartar foto nueva'}</button>}</>}
    {remote.key === `${tipo}/${id}` && remote.error && <small role="alert" className={styles.photoError}>No se pudo cargar {tipo==='empresa'?'el logo':'la foto'}: {remote.error}</small>}
    {ampliar && source && <DialogDirectorioOT titulo={`${tipo==='empresa'?'Logo':'Foto'} de ${nombre}`} onCerrar={() => setAmpliar(false)}><img className={styles.fullPhoto} src={source} alt={`${tipo==='empresa'?'Logo':'Foto'} de ${nombre}`} /></DialogDirectorioOT>}
  </div>;
}
