import { useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { useAccessStore } from '../../stores/accessStore';
import { PanelAdministracion as DialogDirectorioOT } from './PanelAdministracion';
import { EliminarDirectorio } from './EliminarDirectorio';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import styles from './AdministracionCreador.module.css';

export function EmpresasCreador({ crear, onCerrarCrear }: { crear: boolean; onCerrarCrear: () => void }) {
  const { contexto, empresaId, refresh } = useAccessStore();
  const [lectura,setLectura]=useState(false);
  const [buscar, setBuscar] = useState('');
  const [editar, setEditar] = useState<{ id: string; nombre: string; activa: boolean } | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!contexto?.creador) return null;
  const nombre = editar?.nombre ?? nuevoNombre;
  const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const resultados = contexto.empresas.filter(e => normalizar(e.nombre).includes(normalizar(buscar)));
  const cerrar = () => { setEditar(null); setNuevoNombre(''); setError(''); onCerrarCrear(); };
  async function guardar() {
    if (busy || !nombre.trim() || !useAccessStore.getState().contexto?.creador) return;
    setBusy(true); setError('');
    try {
      const ticket = sessionTicket();
      const { data, error } = await supabase.rpc('plan_admin_empresa', {
        p_nombre: nombre.trim(), p_id: editar?.id || null, p_activa: editar?.activa ?? true,
      });
      assertSession(ticket); if (error) throw new Error(error.message);
      if (!editar?.id && data) useAccessStore.setState({ empresaId: String(data) });
      cerrar(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la empresa.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.workspace} aria-label="Empresas">
    <div className={styles.sectionHeader}><div><h2>Empresas</h2><p>Buscá una empresa para editar su nombre o seleccionarla como contexto de trabajo.</p></div>
      <button className={styles.primaryButton} type="button" onClick={() => { cerrar(); setLectura(false); setEditar({ id: '', nombre: '', activa: true }); }}>+ Crear empresa</button></div>
    <label className={styles.search}>Buscar empresa<input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Nombre de la empresa…" /></label>
    <div className={styles.recordList}>{resultados.map(e => <div className={styles.recordRow} key={e.id}>
      <div className={styles.recordIdentity}><strong>{e.nombre}</strong><small>{e.id === empresaId ? 'Empresa seleccionada' : e.activa === false ? 'Inactiva' : 'Empresa registrada'}</small></div>
      <div className={styles.creationActions}><button className={styles.secondaryButton} type="button" onClick={()=>{setLectura(true);setEditar({id:e.id,nombre:e.nombre,activa:e.activa!==false})}}>Ver</button><button className={styles.secondaryButton} type="button" disabled={e.id === empresaId} onClick={() => useAccessStore.setState({ empresaId: e.id })}>Seleccionar</button>
        <button className={styles.secondaryButton} type="button" aria-label={`Editar empresa ${e.nombre}`} onClick={() => { setLectura(false); setError(''); setEditar({ id: e.id, nombre: e.nombre, activa: e.activa !== false }); }}>Editar</button><EliminarDirectorio tipo="empresa" id={e.id} nombre={e.nombre} onEliminar={()=>void refresh()}/></div>
    </div>)}</div>
    {!resultados.length && <p className={styles.hint}>No hay empresas que coincidan con la búsqueda.</p>}
    {(crear || editar) && <DialogDirectorioOT titulo={lectura?'Ficha de la empresa':editar?.id ? 'Editar empresa' : 'Crear empresa'} busy={busy} onCerrar={cerrar} acciones={!lectura&&<button className={styles.primaryButton} type="button" disabled={busy||!nombre.trim()} onClick={()=>void guardar()}>{busy?'Guardando…':'Guardar empresa'}</button>}>
      <div className={styles.field}><span className={styles.fieldLabel}>Nombre de la empresa<VoiceInputButton disabled={busy||lectura} compact value={nombre} maxLength={180} onChange={v => editar ? setEditar({ ...editar, nombre: v }) : setNuevoNombre(v)} /></span>
        <input aria-label="Nombre de la empresa" maxLength={180} disabled={busy||lectura} value={nombre} placeholder="Ej.: Benítez Bittar Constructora" onChange={e => editar ? setEditar({ ...editar, nombre: e.target.value }) : setNuevoNombre(e.target.value)} /></div>
      {error && <p role="alert">{error}</p>}
    </DialogDirectorioOT>}
  </section>;
}
