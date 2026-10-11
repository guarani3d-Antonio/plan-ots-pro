import { useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import { useAccessStore } from '../../stores/accessStore';
import { normalizarBusqueda } from '../../utils/busqueda';
import { cargarRespaldos, solicitarRespaldo, verificarRespaldo, programarRespaldo, inventarioRespaldo, descargarRespaldo, descargarInformeRespaldo, type InventarioRespaldo } from '../../services/backupService';
import styles from './RespaldosAdministracion.module.css';

const cobertura = [
  ['Obras, clientes y directorios', 'Empresas, obras, clientes y ubicaciones, contratistas, contactos, colores, estados y fotos.'],
  ['OT y datos del reclamo', 'Número único, clasificación, responsables, fechas, costos, posición sobre el plano y campos personalizados.'],
  ['Siete documentos y versiones', 'Solicitudes, visitas, relevamientos, avances, cierres, actas y encuestas, versiones, correcciones, aprobaciones y emisiones.'],
  ['Archivos originales', 'Fotos, planos, PDF y anexos con ruta, tamaño y huella. Los registros de Storage solos no son los archivos.'],
  ['Usuarios, permisos e historial', 'Perfiles, membresías, jerarquías, permisos, invitaciones y políticas. La copia de plataforma incluye Auth; recuperar una empresa requiere identidades compatibles.'],
  ['Portal de reclamos', 'La recepción sigue simulada. Antes de activarla se incorporarán solicitudes, evidencias, decisiones y vinculaciones a la cobertura comprobada.'],
  ['Pendientes en dispositivos', 'Sólo lo sincronizado llega al servidor. Los cambios en tablets desconectadas no pueden darse por respaldados.'],
] as const;
type Vista = 'copies' | 'coverage' | 'schedule';
type Datos = Awaited<ReturnType<typeof cargarRespaldos>>;
const fecha = (v: string | null | undefined) => v ? new Date(v).toLocaleString('es-PY', { timeZone: 'America/Asuncion', dateStyle: 'short', timeStyle: 'short' }) : 'Pendiente';
const tamano = (n: number | null | undefined) => n == null ? '—' : `${(n / 1024 / 1024).toLocaleString('es-PY', { maximumFractionDigits: 1 })} MB`;

export function RespaldosAdministracion({ tenantId }: { tenantId: string }) {
  const creator = useAccessStore(s => s.disponible && s.contexto?.creador);
  const company = useAccessStore(s => s.contexto?.empresas.find(e => e.id === tenantId));
  const [scope, setScope] = useState(tenantId ? 'empresa' : 'plataforma');
  const selectedScope = scope === 'empresa' ? tenantId : null;
  const [loaded, setLoaded] = useState<{ scope: string | null; data: Datos } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<Vista>('copies');
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<InventarioRespaldo | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [frequency, setFrequency] = useState(24);
  const [automatic, setAutomatic] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pending = useLiveQuery(async () => ({ cambios: await db.syncQueue.count(), fotos: await db.fotosPendientes.filter(f => f.estadoSync !== 'COMPLETADO').count() }), []);
  const data = loaded?.scope === selectedScope ? loaded.data : null;
  useEffect(() => {
    if (!creator) return;
    let cancelled = false;
    const refresh = () => cargarRespaldos(selectedScope).then(result => {
      if (!cancelled) { setLoaded({ scope: selectedScope, data: result }); setError(''); }
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo consultar el respaldo.'); });
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [creator, selectedScope, revision]);
  useEffect(() => { if (scheduleOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [scheduleOpen]);
  if (!creator) return <p>No tenés permiso para administrar respaldos.</p>;
  const status = data?.status;
  const connected = status?.destino === 'r2_verificado';
  const canCreate = connected && status?.motor_disponible && !error;
  const canActivate = canCreate && selectedScope === null && status?.puede_programar;
  const last = data?.jobs.find(b => b.estado === 'creada');
  const alcance = scope === 'empresa' ? company?.nombre ?? 'Empresa seleccionada' : 'Toda la plataforma';
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); setRevision(n => n + 1); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.root} aria-label="Respaldo y recuperación">
    <header className={styles.heading}><div><h2>Respaldo y recuperación</h2><p>Copias, archivos y comprobación de recuperación.</p></div><div className={styles.actions}><span className={styles.pendingBadge}>{status?.listo_para_piloto && !error ? 'Respaldo operativo' : connected ? 'Validación pendiente' : 'Pendiente de conexión'}</span><button type="button" disabled={busy} onClick={() => setRevision(n => n + 1)}>Actualizar</button></div></header>
    <div className={styles.context}><strong>{alcance}</strong><label>Alcance<select disabled={busy} value={scope} onChange={e => { setScope(e.target.value); setMessage(''); }}><option value="empresa" disabled={!tenantId}>Esta empresa y sus obras</option><option value="plataforma">Toda la plataforma · Creador</option></select></label></div>
    <p className={styles.notice}>{status?.listo_para_piloto && !error ? 'Copias automáticas activas, motor disponible y recuperación de datos y archivos comprobada. El portal tiene su propia activación.' : connected ? 'El destino está comprobado. Falta completar la recuperación y activar la programación con el motor disponible.' : 'R2 está pendiente de activación. No hay protección automática confirmada; el portal conserva la recepción simulada.'}</p>
    {error && <p role="alert" className={styles.alert}>{error}</p>}{message && <p role="status">{message}</p>}
    <div className={styles.tabs} aria-label="Secciones de respaldo">{([['copies', 'Copias y recuperación'], ['coverage', 'Cobertura de datos'], ['schedule', 'Programación']] as const).map(([id,label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'copies' && <>
      <div className={styles.summary}><div><small>Última copia de este alcance</small><strong>{last ? fecha(last.corte_en) : 'Sin copias registradas'}</strong></div><div><small>Destino / motor</small><strong>{connected ? `R2 comprobado · ${status?.motor_disponible ? 'motor disponible' : 'motor sin señal reciente'}` : 'Cloudflare R2 · pendiente'}</strong></div><div><small>Recuperación de este alcance</small><strong>{fecha(status?.recuperacion_en)}</strong></div></div>
      <p className={styles.hint}>{pending ? `${pending.cambios} cambios · ${pending.fotos} fotos pendientes de sincronizar en este dispositivo.` : 'Comprobando pendientes del dispositivo…'}</p>
      <div className={styles.heading}><h3>Historial de copias</h3><button type="button" className={styles.primary} disabled={busy || !canCreate} title={!canCreate ? 'Primero conectá R2 y comprobá el motor.' : undefined} onClick={() => void run(() => solicitarRespaldo(selectedScope,crypto.randomUUID()),'Respaldo solicitado. Revisá su estado en el historial; todavía no es una copia creada.')}>+ Crear respaldo</button></div>
      {!data?.jobs.length && <div className={styles.empty}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3M8 14h8m-4-3v6" /></svg><div><strong>Todavía no hay copias disponibles</strong><p>Aquí se mostrarán fecha, tamaño y resultado real de cada respaldo.</p></div></div>}
      <div className={styles.list}>{data?.jobs.map(job => <article key={job.id} className={styles.row}><div><strong>{fecha(job.corte_en ?? job.creado_en)}</strong><small>{job.estado === 'creada' ? 'Copia creada' : job.estado === 'pendiente' ? `En cola · ${job.tarea}` : job.estado === 'procesando' ? 'Procesando' : 'No completada'} · {tamano(job.bytes)}</small><small>{job.objetos ?? '—'} archivos · {job.filas ?? '—'} registros</small></div><div><strong>{job.recuperacion_en ? 'Recuperación de datos comprobada' : job.integridad_en ? 'Integridad comprobada · recuperación pendiente' : 'Comprobación pendiente'}</strong>{job.error && <small className={styles.alert}>{job.error}</small>}</div><div className={styles.actions}><button type="button" disabled={busy || !canCreate || job.estado !== 'creada'} onClick={() => void run(() => verificarRespaldo(job.id),'Verificación y ensayo solicitados. Revisá el resultado en el historial.')}>Verificar y ensayar</button><button type="button" disabled={busy || job.estado !== 'creada' || !!error || !import.meta.env.VITE_BACKUP_SERVICE_URL} title={!import.meta.env.VITE_BACKUP_SERVICE_URL ? 'Falta conectar la descarga segura.' : undefined} onClick={() => void run(() => descargarRespaldo(job.id),'Descarga autorizada por el servicio. Conservá la clave por separado.')}>Descargar copia</button><button type="button" disabled={!job.informe} onClick={() => descargarInformeRespaldo(job)}>Informe</button></div></article>)}</div>
      <p className={styles.hint}>La copia es un paquete cifrado <b>.potbackup</b> con datos, originales y manifiesto. El informe es un <b>.json</b> de comprobación. La clave se conserva por separado.</p>
      <details><summary>¿Cómo se comprueba la recuperación?</summary><p>Se restaura la copia remota en un laboratorio aislado y se comparan registros, relaciones y archivos. Esto no sustituye la validación de acceso y funcionamiento de una nueva instalación. Esta pantalla nunca reemplaza datos productivos.</p></details>
    </>}
    {tab === 'coverage' && <>
      <div className={styles.heading}><h3>Cobertura e inventario</h3><button type="button" disabled={busy || !data || !!error} onClick={() => void run(async () => setInventory(await inventarioRespaldo()),'Inventario consultado desde Supabase. No crea un respaldo.')}>Medir datos y archivos</button></div>
      <label className={styles.search}>Buscar en la cobertura<input placeholder="Visitas, fotos, permisos…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {cobertura.filter(g => normalizarBusqueda(g.join(' ')).includes(normalizarBusqueda(search))).map(([name,text]) => <details key={name}><summary>{name}</summary><p>{text}</p></details>)}
      {!cobertura.some(g => normalizarBusqueda(g.join(' ')).includes(normalizarBusqueda(search))) && <p>No hay secciones que coincidan.</p>}
      {inventory && <details open><summary>Inventario de plataforma · {fecha(inventory.capturado_en)}</summary><p>{inventory.tablas.length} tablas · {inventory.buckets.reduce((n,b) => n+Number(b.objetos),0)} archivos · {tamano(inventory.buckets.reduce((n,b) => n+Number(b.bytes),0))}</p>{inventory.buckets.map(b => <p key={b.id}>{b.id}: {b.objetos} archivos · {tamano(b.bytes)}{Number(b.sin_tamano)>0 ? ` · ${b.sin_tamano} sin tamaño informado` : ''}</p>)}</details>}
      <p className={styles.hint}>El inventario mide toda la plataforma. La grilla es una vista de datos: su CSV y el .otproj son exportaciones parciales. La cobertura efectiva se comprueba contra el esquema y el paquete.</p>
    </>}
    {tab === 'schedule' && <><div className={styles.heading}><h3>Programación de plataforma</h3><button type="button" onClick={() => { setFrequency(data?.config.intervalo_horas ?? 24); setAutomatic(data?.config.activo ?? false); setScheduleOpen(true); }}>Configurar</button></div><div className={styles.settings}><div><small>Estado</small><strong>{data?.config.activo ? 'Activa' : 'Sin activar'}</strong></div><div><small>Frecuencia</small><strong>Cada {data?.config.intervalo_horas ?? 24} horas</strong></div><div><small>Señal del motor</small><strong>{fecha(status?.motor_en)}</strong></div><div><small>Límite del depósito exclusivo</small><strong>{data ? tamano(data.config.max_bytes) : 'Pendiente de instalación'}</strong></div><div><small>Conservación</small><strong>Sin borrado automático</strong></div><div><small>Siguiente solicitud</small><strong>{data?.config.activo ? fecha(data.config.siguiente_en) : 'No programada'}</strong></div></div><p className={styles.hint}>La programación respalda toda la plataforma. Al agotarse el espacio, la copia falla y conserva el historial; no borra copias válidas para hacer lugar.</p></>}
    <dialog ref={dialog} aria-labelledby={titleId} className={styles.dialog} onCancel={() => setScheduleOpen(false)}><header><h3 id={titleId}>Programación de plataforma</h3><button type="button" aria-label="Cerrar configuración" disabled={busy} onClick={() => setScheduleOpen(false)}>×</button></header><div><label>Frecuencia<select disabled={busy} value={frequency} onChange={e => setFrequency(Number(e.target.value))}>{[6,12,24].map(n => <option key={n} value={n}>Cada {n} horas</option>)}</select></label><label><input type="checkbox" disabled={busy || (!automatic && !canActivate)} checked={automatic} onChange={e => setAutomatic(e.target.checked)} /> Activar copias automáticas</label><p>Para activar, seleccioná «Toda la plataforma», comprobá el motor y ensayá la recuperación de una copia reciente. Desactivar conserva las copias.</p></div><footer><button type="button" disabled={busy} onClick={() => setScheduleOpen(false)}>Cerrar</button><button type="button" className={styles.primary} disabled={busy || !data || !!error || (automatic && !canActivate)} onClick={() => void run(async () => { await programarRespaldo(automatic,frequency); setScheduleOpen(false); },'Programación actualizada.')}>Guardar configuración</button></footer></dialog>
  </section>;
}
