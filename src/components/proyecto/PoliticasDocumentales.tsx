import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { useAccessStore } from '../../stores/accessStore';
import styles from './AdministracionCreador.module.css';
import {PanelAdministracion} from './PanelAdministracion';
import {VoiceInputButton} from '../ui/VoiceInputButton';

type Estado = 'pendiente' | 'aprobada' | 'no_aprobada' | 'suspendida';
interface Politica {
  modulo: string;
  titulo: string;
  descripcion: string;
  estado: Estado;
  version: number | null;
  autoridad: string | null;
  respaldo: string | null;
  detalle: string | null;
  vigente_desde: string | null;
  decidido_en: string | null;
}

const etiquetas: Record<Estado, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada',
  no_aprobada: 'No aprobada', suspendida: 'Suspendida',
};

export function PoliticasDocumentales({ tenantId }: { tenantId: string }) {
  const creador = useAccessStore(s => s.contexto?.creador === true && s.disponible);
  const [politicas, setPoliticas] = useState<Politica[]>([]);
  const [seleccion, setSeleccion] = useState<string>('');
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [autoridad, setAutoridad] = useState('');
  const [respaldo, setRespaldo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [avanzado,setAvanzado]=useState(false);
  const [historial,setHistorial]=useState<(Politica&{id:number})[]>([]);
  const [errorHistorial,setErrorHistorial]=useState('');
  const [revisionHistorial,setRevisionHistorial]=useState(0);

  const cargar = useCallback(async (): Promise<Politica[]> => {
    const ticket = sessionTicket();
    const { data, error } = await supabase.rpc('plan_politicas_listar', { p_tenant: tenantId });
    assertSession(ticket);
    if (error) throw new Error(error.message);
    return data as Politica[];
  }, [tenantId]);

  useEffect(() => {
    if (!creador || !tenantId) return;
    let activo = true;
    cargar().then(data => {
      if (activo) setPoliticas(data);
    }).catch(error => {
      if (activo) setMensaje(error instanceof Error ? error.message : 'No se pudieron cargar las políticas.');
    });
    return () => { activo = false; };
  }, [creador, tenantId, cargar]);

  useEffect(()=>{if(!creador||!seleccion)return;let active=true;const ticket=sessionTicket();
    void Promise.resolve(supabase.rpc('plan_politica_historial',{p_tenant:tenantId,p_modulo:seleccion})).then(r=>{
      assertSession(ticket);if(!active)return;if(r.error)throw new Error(r.error.message);setHistorial((r.data??[]) as (Politica&{id:number})[]);setErrorHistorial('');
    }).catch(e=>{if(active){setHistorial([]);setErrorHistorial(e instanceof Error?e.message:'No se pudo cargar el historial.')}});return()=>{active=false};
  },[creador,tenantId,seleccion,revisionHistorial]);

  if (!creador || !tenantId) return null;
  const actual = politicas.find(p => p.modulo === seleccion);
  const elegir = (p: Politica) => {
    setAvanzado(false);setHistorial([]);setErrorHistorial('');setSeleccion(p.modulo);
    setEstado(p.estado);
    setAutoridad(p.autoridad ?? '');
    setRespaldo(p.respaldo ?? '');
    setDetalle(p.detalle ?? '');
    setVigencia(p.vigente_desde ?? '');
    setMensaje('');
  };
  const guardar = async () => {
    if (!actual || busy) return;
    if (estado === 'aprobada' && (!autoridad.trim() || !respaldo.trim() || !vigencia)) {
      setAvanzado(true);setMensaje('Para aprobar, indicá autoridad, respaldo y fecha de vigencia.');
      return;
    }
    setBusy(true); setMensaje('');
    try {
      const ticket = sessionTicket();
      const { error } = await supabase.rpc('plan_politica_decidir', {
        p_tenant: tenantId, p_modulo: actual.modulo, p_estado: estado,
        p_autoridad: autoridad.trim(), p_respaldo: respaldo.trim(),
        p_detalle: detalle.trim(), p_vigente_desde: vigencia || null,
        p_solicitud: crypto.randomUUID(),
      });
      assertSession(ticket);
      if (error) throw new Error(error.message);
      setPoliticas(await cargar());setRevisionHistorial(v=>v+1);
      setMensaje('Decisión registrada como una nueva versión. No aprueba automáticamente ningún documento.');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar la decisión.');
    } finally { setBusy(false); }
  };

  return <section className={styles.workspace} aria-label="Configuración de informes">
    <div className={styles.sectionHeader}><div><h2>Configuración de informes</h2><p>Reglas documentales de la empresa · {politicas.length} módulos</p></div></div>
    <div className={styles.recordList}>{politicas.map(p=><article key={p.modulo} className={styles.recordRow}>
      <div className={styles.recordIdentity}><strong>{p.titulo}</strong><small>{p.descripcion}</small><small>{etiquetas[p.estado]} · {p.version?'versión '+p.version:'sin decisión'}</small></div>
      <button type="button" className={styles.secondaryButton} aria-label={`Configurar ${p.titulo}`} onClick={()=>elegir(p)}>Configurar</button>
    </article>)}</div>
    <p className={styles.hint}>Estas reglas no firman ni aprueban documentos individuales.</p>
    {actual&&<PanelAdministracion titulo={actual.titulo} busy={busy} onCerrar={()=>setSeleccion('')} acciones={<button type="button" className={styles.primaryButton} disabled={busy} onClick={()=>void guardar()}>{busy?'Guardando…':'Registrar versión'}</button>}>
      <fieldset disabled={busy} className={styles.editorFields}>
        <label className={styles.field}>Decisión<select value={estado} onChange={e=>setEstado(e.target.value as Estado)}>{Object.entries(etiquetas).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className={styles.field}>Vigente desde<input type="date" value={vigencia} onChange={e=>setVigencia(e.target.value)}/></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Alcance y observaciones<VoiceInputButton compact value={detalle} onChange={setDetalle}/></span><textarea rows={4} value={detalle} onChange={e=>setDetalle(e.target.value)} placeholder="Ej.: condiciones para revisar y entregar los informes."/></label>
        <details className={styles.editorDetails} open={avanzado} onToggle={e=>setAvanzado(e.currentTarget.open)}><summary>Respaldo e historial</summary>
          <div className={styles.editorFields}>
            <label className={styles.field}><span className={styles.fieldLabel}>Autoridad que decidió<VoiceInputButton compact value={autoridad} onChange={setAutoridad}/></span><input value={autoridad} onChange={e=>setAutoridad(e.target.value)} placeholder="Nombre y función"/></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Referencia de respaldo<VoiceInputButton compact value={respaldo} onChange={setRespaldo}/></span><input value={respaldo} onChange={e=>setRespaldo(e.target.value)} placeholder="Procedimiento, acta o aprobación"/></label>
            <p className={styles.hint}>Autoridad, respaldo y vigencia son obligatorios al aprobar.</p>
            {errorHistorial&&<p role="alert">{errorHistorial}</p>}
            {historial.map(h=><details key={h.id} className={styles.editorDetails}><summary>Versión {h.version} · {etiquetas[h.estado]}</summary><div className={styles.contactCard}><span>{h.decidido_en?new Date(h.decidido_en).toLocaleString('es-PY'):''}</span><span>{h.autoridad||'Sin autoridad registrada'}</span><span>{h.respaldo||'Sin referencia'}</span><span>{h.detalle||'Sin observaciones'}</span><span>Vigencia: {h.vigente_desde||'Sin registrar'}</span></div></details>)}
            {!historial.length&&!errorHistorial&&<p className={styles.hint}>Sin versiones registradas.</p>}
          </div>
        </details>
      </fieldset>
      {mensaje&&<p role="status">{mensaje}</p>}
    </PanelAdministracion>}
    {!actual&&mensaje&&<p role="status">{mensaje}</p>}
  </section>;
}
