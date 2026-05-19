import { useEffect, useState } from 'react';
import { fetchComentariosOrden } from '../../services/comentariosService';
import type { OtComentario } from '../../services/comentariosService';
import styles from './HistorialComentarios.module.css';

interface Props {
  ordenId: string;
  proyectoId: string;
  refreshTrigger?: number;  // incrementar para forzar re-fetch
}

function formatearFecha(iso: string): string {
  const d = new Date(iso);
  const dia  = d.getDate().toString().padStart(2, '0');
  const mes  = (d.getMonth()+1).toString().padStart(2, '0');
  const año  = d.getFullYear();
  const hora = d.getHours().toString().padStart(2, '0');
  const min  = d.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes}/${año} ${hora}:${min}`;
}

const COLORES_ESTADO: Record<string, string> = {
  'Pendiente':  '#DC2626',
  'En proceso': '#2563EB',
  'Cerrada':    '#16A34A',
  'No aplica':  '#6B7280',
};

export function HistorialComentarios({ ordenId, proyectoId: _proyectoId, refreshTrigger = 0 }: Props) {
  const [comentarios, setComentarios] = useState<OtComentario[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetchComentariosOrden(ordenId)
      .then(setComentarios)
      .finally(() => setCargando(false));
  }, [ordenId, refreshTrigger]);

  if (cargando) return (
    <div className={styles.skeletonWrap}>
      {[1,2,3].map(i => <div key={i} className={styles.skeletonItem} />)}
    </div>
  );

  if (comentarios.length === 0) return (
    <div className={styles.vacio}>
      <span className={styles.vacioIcon}>📋</span>
      <p>Sin comentarios registrados</p>
      <p className={styles.vacioSub}>Los comentarios aparecerán aquí cada vez que se cambie el estado de esta OT.</p>
    </div>
  );

  return (
    <div className={styles.lista}>
      {comentarios.map(c => (
        <div key={c.id} className={styles.item}>
          <div className={styles.itemHeader}>
            <span className={styles.fecha}>{formatearFecha(c.created_at)}</span>
            <span className={styles.usuario}>{c.user_email ?? 'Usuario desconocido'}</span>
          </div>

          {c.estado_anterior && c.estado_nuevo && (
            <div className={styles.transicion}>
              <span className={styles.chip}
                style={{ color: COLORES_ESTADO[c.estado_anterior] ?? '#6B7280',
                         borderColor: (COLORES_ESTADO[c.estado_anterior] ?? '#6B7280') + '55' }}>
                {c.estado_anterior}
              </span>
              <span className={styles.flecha}>→</span>
              <span className={styles.chip}
                style={{ color: COLORES_ESTADO[c.estado_nuevo] ?? '#6B7280',
                         borderColor: (COLORES_ESTADO[c.estado_nuevo] ?? '#6B7280') + '55' }}>
                {c.estado_nuevo}
              </span>
            </div>
          )}

          <p className={styles.texto}>{c.comentario}</p>
        </div>
      ))}
    </div>
  );
}
