import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { useAccessStore } from '../../stores/accessStore';
import styles from './PoliticasDocumentales.module.css';

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

  if (!creador || !tenantId) return null;
  const actual = politicas.find(p => p.modulo === seleccion);
  const elegir = (p: Politica) => {
    setSeleccion(p.modulo);
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
      setMensaje('Para aprobar, indicá autoridad, respaldo y fecha de vigencia.');
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
      setPoliticas(await cargar());
      setMensaje('Decisión registrada como una nueva versión. No aprueba automáticamente ningún documento.');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar la decisión.');
    } finally { setBusy(false); }
  };

  return <section className={styles.panel} aria-label="Políticas documentales">
    <div className={styles.heading}>
      <div><h3>Políticas documentales</h3><p>Decisiones de la empresa, versionadas y respaldadas. Solo el Creador puede registrarlas.</p></div>
      <span className={styles.count}>{politicas.length} módulos</span>
    </div>
    <div className={styles.layout}>
      <div className={styles.list}>
        {politicas.map(p => <button type="button" key={p.modulo} className={styles.item}
          aria-pressed={seleccion === p.modulo} onClick={() => elegir(p)}>
          <strong>{p.titulo}</strong><span>{p.descripcion}</span>
          <small>{etiquetas[p.estado]}{p.version ? ` · versión ${p.version}` : ' · sin decisión'}</small>
        </button>)}
      </div>
      <div className={styles.editor}>
        {!actual ? <p>Elegí un módulo para ver su estado y registrar una decisión.</p> : <>
          <h4>{actual.titulo}</h4>
          <p className={styles.effect}>Estado actual: <strong>{etiquetas[actual.estado]}</strong>. Esta decisión queda registrada con su respaldo; no firma ni aprueba documentos concretos.</p>
          <label>Decisión<select value={estado} onChange={e => setEstado(e.target.value as Estado)}>
            {Object.entries(etiquetas).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Autoridad que decidió<input value={autoridad} onChange={e => setAutoridad(e.target.value)} placeholder="Nombre y función" /></label>
          <label>Referencia de respaldo<input value={respaldo} onChange={e => setRespaldo(e.target.value)} placeholder="Procedimiento, acta o aprobación" /></label>
          <label>Vigente desde<input type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} /></label>
          <label>Alcance y observaciones<textarea value={detalle} onChange={e => setDetalle(e.target.value)} rows={3} placeholder="Condiciones y límites de esta decisión" /></label>
          <button type="button" className={styles.save} disabled={busy} onClick={() => void guardar()}>{busy ? 'Guardando…' : 'Registrar nueva versión'}</button>
        </>}
      </div>
    </div>
    {mensaje && <p role="status" className={styles.message}>{mensaje}</p>}
  </section>;
}
