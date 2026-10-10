import { useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import { useAccessStore } from '../../stores/accessStore';
import { normalizarBusqueda } from '../../utils/busqueda';
import styles from './RespaldosAdministracion.module.css';

const cobertura = [
  ['Obras, clientes y directorios', 'Empresas, obras, clientes y sus ubicaciones, contratistas, contactos, colores, estados y fotos de las fichas.'],
  ['OT y datos del reclamo', 'Número único, clasificación, responsables, fechas, costos, posición sobre el plano y campos personalizados.'],
  ['Siete documentos y versiones', 'Solicitudes, visitas, relevamientos, avances, cierres, actas y encuestas, con sus versiones, motivos de corrección, aprobaciones y emisiones.'],
  ['Archivos originales', 'Fotos, planos, PDF y anexos. Cada archivo deberá conservar su ruta, tamaño y huella de integridad.'],
  ['Usuarios, permisos e historial', 'Perfiles, membresías, jerarquías, permisos, invitaciones y políticas. La recuperación de identidades y accesos se validará por separado.'],
  ['Pendientes en dispositivos', 'Sólo lo sincronizado llega al servidor. Los cambios de otras tablets desconectadas no pueden darse por respaldados.'],
] as const;
const faltaConexion = 'Disponible después de conectar y verificar el servicio de respaldos.';
type Vista = 'copies' | 'coverage' | 'schedule';

/** Primera entrega visible: no consulta ni modifica el servicio de respaldos. */
export function RespaldosAdministracion({ tenantId }: { tenantId: string }) {
  const creator = useAccessStore(s => s.disponible && s.contexto?.creador);
  const company = useAccessStore(s => s.contexto?.empresas.find(e => e.id === tenantId));
  const [scope, setScope] = useState(tenantId ? 'empresa' : 'plataforma');
  const [tab, setTab] = useState<Vista>('copies');
  const [search, setSearch] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [frequency, setFrequency] = useState(24);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pending = useLiveQuery(async () => ({
    cambios: await db.syncQueue.count(),
    fotos: await db.fotosPendientes.filter(f => f.estadoSync !== 'COMPLETADO').count(),
  }), []);

  useEffect(() => {
    if (scheduleOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [scheduleOpen]);

  if (!creator) return <p>No tenés permiso para administrar respaldos.</p>;
  const alcance = scope === 'empresa' ? company?.nombre ?? 'Empresa seleccionada' : 'Toda la plataforma';

  return <section className={styles.root} aria-label="Respaldo y recuperación">
    <header className={styles.heading}>
      <div><h2>Respaldo y recuperación</h2><p>Copias, archivos y comprobación de recuperación.</p></div>
      <span className={styles.pendingBadge}>Pendiente de conexión</span>
    </header>
    <div className={styles.context}>
      <strong>{alcance}</strong>
      <label>Alcance<select value={scope} onChange={e => setScope(e.target.value)}>
        <option value="empresa" disabled={!tenantId}>Esta empresa y sus obras</option>
        <option value="plataforma">Toda la plataforma · Creador</option>
      </select></label>
    </div>
    <p className={styles.notice}>La interfaz está preparada. Cloudflare R2 y el servicio de respaldos aún no están conectados ni verificados. No hay copias automáticas activas.</p>
    <div className={styles.tabs} aria-label="Secciones de respaldo">
      {([['copies', 'Copias y recuperación'], ['coverage', 'Cobertura de datos'], ['schedule', 'Programación']] as const)
        .map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>

    {tab === 'copies' && <>
      <div className={styles.summary}>
        <div><small>Última copia</small><strong>Sin copias registradas</strong></div>
        <div><small>Destino previsto</small><strong>Cloudflare R2 · pendiente</strong></div>
        <div><small>Recuperación</small><strong>Todavía no verificada</strong></div>
      </div>
      <p className={styles.hint}>{pending
        ? `${pending.cambios} cambios · ${pending.fotos} fotos pendientes de sincronizar en este dispositivo.`
        : 'Comprobando pendientes de sincronización de este dispositivo…'}</p>
      <div className={styles.heading}>
        <h3>Historial de copias</h3>
        <button type="button" className={styles.primary} disabled title={faltaConexion}>+ Crear respaldo</button>
      </div>
      <div className={styles.empty}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3M8 14h8m-4-3v6" /></svg>
        <div><strong>Todavía no hay copias disponibles</strong><p>Al conectar el servicio, aquí aparecerán la fecha, el alcance, el tamaño y el resultado de cada respaldo.</p></div>
      </div>
      <div className={styles.actions} aria-label="Operaciones de respaldo pendientes de conexión">
        <button type="button" disabled title={faltaConexion}>Verificar copia</button>
        <button type="button" disabled title={faltaConexion}>Descargar copia</button>
        <button type="button" disabled title={faltaConexion}>Preparar recuperación</button>
      </div>
      <p className={styles.hint}>Las operaciones se habilitarán al conectar el servicio y disponer de una copia válida. La descarga prevista será un paquete cifrado <b>.potbackup</b> con datos, archivos y un manifiesto de integridad.</p>
      <details><summary>¿Qué significa verificar una recuperación?</summary><p>Restaurar primero en un entorno aislado, comprobar los datos y archivos, y validar el acceso con cuentas de prueba. Una copia creada por sí sola no demuestra que la aplicación pueda recuperarse.</p></details>
    </>}

    {tab === 'coverage' && <>
      <div className={styles.heading}><h3>Cobertura prevista</h3><button type="button" disabled title={faltaConexion}>Medir datos y archivos</button></div>
      <label className={styles.search}>Buscar en la cobertura<input placeholder="Visitas, fotos, permisos…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {cobertura.filter(g => normalizarBusqueda(g.join(' ')).includes(normalizarBusqueda(search)))
        .map(([name, text]) => <details key={name}><summary>{name}</summary><p>{text}</p></details>)}
      {!cobertura.some(g => normalizarBusqueda(g.join(' ')).includes(normalizarBusqueda(search))) && <p>No hay secciones que coincidan con la búsqueda.</p>}
      <p className={styles.hint}>Esta lista describe el alcance propuesto; todavía no certifica cobertura ni cantidades. Las visitas y versiones deberán conservar sus relaciones. El CSV de la grilla y el archivo .otproj son exportaciones parciales.</p>
    </>}

    {tab === 'schedule' && <>
      <div className={styles.heading}><h3>Programación propuesta</h3><button type="button" onClick={() => { setFrequency(24); setScheduleOpen(true); }}>Ver configuración</button></div>
      <div className={styles.settings}>
        <div><small>Estado</small><strong>Sin activar</strong></div>
        <div><small>Frecuencia inicial propuesta</small><strong>Cada 24 horas</strong></div>
        <div><small>Destino</small><strong>Cloudflare R2 · pendiente</strong></div>
        <div><small>Capacidad y límite</small><strong>Por definir después del inventario</strong></div>
        <div><small>Conservación propuesta</small><strong>7 diarias · 4 semanales · 3 mensuales</strong></div>
        <div><small>Siguiente copia</small><strong>No programada</strong></div>
      </div>
      <p className={styles.hint}>La frecuencia, el espacio necesario y la conservación se confirmarán con el inventario real. Esta propuesta no guarda una configuración, no activa tareas y no contrata almacenamiento.</p>
    </>}

    <dialog ref={dialog} aria-labelledby={titleId} className={styles.dialog} onCancel={() => setScheduleOpen(false)}
      onClick={e => {
        if (e.target !== dialog.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setScheduleOpen(false);
      }}>
      <header><h3 id={titleId}>Programación de respaldos</h3><button type="button" aria-label="Cerrar configuración" onClick={() => setScheduleOpen(false)}>×</button></header>
      <div>
        <p className={styles.notice}>Vista previa de configuración · no se guarda ni activa.</p>
        <label>Frecuencia<select value={frequency} onChange={e => setFrequency(Number(e.target.value))}>
          {[6, 12, 24].map(n => <option key={n} value={n}>Cada {n} horas</option>)}
        </select></label>
        <label><input type="checkbox" disabled checked={false} readOnly /> Activar copias automáticas</label>
        <p>Primero hay que conectar el destino, medir el espacio y comprobar la recuperación de una copia.</p>
      </div>
      <footer><button type="button" onClick={() => setScheduleOpen(false)}>Cerrar</button><button type="button" className={styles.primary} disabled title={faltaConexion}>Guardar configuración</button></footer>
    </dialog>
  </section>;
}
