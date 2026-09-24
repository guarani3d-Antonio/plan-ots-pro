import { useCallback, useEffect, useState } from 'react';
import { cargarEventos, tituloEvento, type EventoOT } from '../../services/trustService';
import styles from './HistorialComentarios.module.css';

interface Props { ordenId: string; proyectoId: string; refreshTrigger?: number }
function valor(v: unknown, campo?: string): string {
  if (v === null || v === undefined || v === '') return 'Sin valor';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (campo === 'edicion' && typeof v === 'object') return 'Ajustes de imagen actualizados';
  if (campo === 'anotaciones' && Array.isArray(v)) return `${v.length} ${v.length === 1 ? 'anotación' : 'anotaciones'}`;
  if (Array.isArray(v)) return `${v.length} elementos`;
  return typeof v === 'object' ? 'Datos actualizados' : String(v);
}
const campos: Record<string, string> = {
  pos_x: 'Posición horizontal', pos_y: 'Posición vertical', fecha_ingreso: 'Fecha de ingreso',
  fecha_inicio_trabajos: 'Inicio de trabajos', fecha_fin_trabajos: 'Fin de trabajos',
  porcentaje_avance: 'Avance', descripcion: 'Descripción', anotaciones: 'Anotaciones',
  descripcion_observacion: 'Observación de la evidencia', estado_anterior: 'Estado anterior', estado_nuevo: 'Estado nuevo', edicion: 'Ajustes de imagen',
};
export function HistorialComentarios(props: Props) {
  return <HistorialRegistro key={props.ordenId} {...props} />;
}
function HistorialRegistro({ ordenId, refreshTrigger = 0 }: Props) {
  const [eventos, setEventos] = useState<EventoOT[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [inicial, setInicial] = useState(true);
  useEffect(() => {
    let active = true;
    cargarEventos(ordenId).then(p => {
      if (active) { setEventos(p.eventos); setHayMas(p.hayMas); setError(null); }
    }).catch(e => { if (active) { setEventos([]); setError(e.message); } })
      .finally(() => { if (active) setInicial(false); });
    return () => { active = false; };
  }, [ordenId, refreshTrigger, revision]);
  const mas = useCallback(async () => {
    if (cargando) return;
    setCargando(true);
    try {
      const p = await cargarEventos(ordenId, eventos.at(-1));
      setEventos(prev => [...prev, ...p.eventos.filter(e => !prev.some(v => v.id === e.id))]);
      setHayMas(p.hayMas); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.'); }
    finally { setCargando(false); }
  }, [ordenId, eventos, cargando]);
  return <div className={styles.lista}>
    <p>Actividad registrada en el servidor. Cada cambio indica quién lo hizo y cuándo.</p>
    <button type="button" onClick={() => setRevision(r => r + 1)}>Actualizar historial</button>
    {error && <p role="alert">No se pudo consultar el historial: {error}</p>}
    {inicial && <p role="status">Cargando historial…</p>}
    {!inicial && !error && !eventos.length && <p>Sin actividad disponible. Los cambios anteriores a la activación solo aparecen si ya estaban registrados.</p>}
    {eventos.map(e => <article key={e.id} className={styles.item}>
      <div className={styles.itemHeader}>
        <time className={styles.fecha} dateTime={e.created_at}>{new Date(e.created_at).toLocaleString('es-PY')}</time>
        <span className={styles.usuario}>{e.actor_email ?? (e.actor_id ? 'Usuario registrado' : 'Operación del sistema')}</span>
      </div>
      <strong>{tituloEvento(e)}{e.restringido ? ' · Acceso de supervisor' : ''}</strong>
      {e.legado && <p>Registro histórico conservado.</p>}
      {e.tipo === 'informe.solicitado' && <p>La solicitud no confirma que el archivo se haya descargado o impreso.</p>}
      <details>
      <summary>Ver cambios ({Object.keys(e.cambios).length})</summary>
      <dl style={{ overflowWrap: 'anywhere' }}>
        {Object.entries(e.cambios).map(([key, cambio]) => <div key={key} style={{ marginTop: 8 }}>
          <dt style={{ fontWeight: 600 }}>{campos[key] ?? key.replaceAll('_', ' ')}</dt>
          <dd style={{ margin: '4px 0' }}>{valor(cambio.antes, key)} → {valor(cambio.despues, key)}</dd>
        </div>)}
      </dl>
      </details>
    </article>)}
    {hayMas && <button type="button" disabled={cargando} onClick={mas}>{cargando ? 'Cargando…' : 'Ver actividad anterior'}</button>}
  </div>;
}
