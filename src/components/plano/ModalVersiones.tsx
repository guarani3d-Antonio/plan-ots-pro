// src/components/plano/ModalVersiones.tsx
import { useState, useEffect, useCallback } from 'react';
import type { OrdenLocal } from '../../types/orden';
import {
  listarVersiones,
  guardarVersion,
  eliminarVersion,
} from '../../services/versionesService';
import type { Version } from '../../services/versionesService';
import styles from './ModalVersiones.module.css';

interface Props {
  proyectoId: string;
  ordenes: OrdenLocal[];
  onCerrar: () => void;
  onComparar: (versionId: string) => void;
  onRestaurar: (v: Version) => void;
  versionesInicial?: Version[];   // pre-cargadas desde VistaPlano — apertura instantánea
}

export function ModalVersiones({
  proyectoId,
  ordenes,
  onCerrar,
  onComparar,
  onRestaurar,
  versionesInicial = [],
}: Props) {
  const [versiones, setVersiones]       = useState<Version[]>(versionesInicial);
  const [cargando, setCargando]         = useState(versionesInicial.length === 0);
  const [mostrarForm, setMostrarForm]   = useState(false);
  const [nombre, setNombre]             = useState('');
  const [guardando, setGuardando]       = useState(false);
  const [eliminando, setEliminando]     = useState<string | null>(null);
  const [pendingRestaur, setPendingRestaur] = useState<Version | null>(null);

  const cargar = useCallback(async (showLoading = true) => {
    if (showLoading) setCargando(true);
    const data = await listarVersiones(proyectoId);
    setVersiones(data);
    setCargando(false);
  }, [proyectoId]);

  // Si tenemos datos iniciales, refrescamos en background sin spinner (sin flash)
  useEffect(() => { void cargar(versionesInicial.length === 0); }, [cargar]);

  function abrirForm() {
    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, '0');
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const y = hoy.getFullYear();
    setNombre(`v${d}/${m}/${y} — ${ordenes.length} OTs`);
    setMostrarForm(true);
  }

  async function handleGuardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    const snap = ordenes.map(o => ({
      id:          o.id          ?? '',
      ot:          o.ot          ?? '',
      ubicacion:   o.ubicacion   ?? '',
      rubro:       o.rubro       ?? '',
      estado:      o.estado,
      responsable: o.responsable ?? '',
      prioridad:   o.prioridad   ?? 'Media',
      pos_x:       o.pos_x       ?? 0,
      pos_y:       o.pos_y       ?? 0,
      comentarios: o.comentarios ?? '',
      campos:      o.campos      ?? {},
    }));
    const nueva = await guardarVersion(proyectoId, nombre.trim(), null, snap);
    if (nueva) {
      setVersiones(prev => [nueva, ...prev]);
      setMostrarForm(false);
    }
    setGuardando(false);
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar esta versión? Esta acción no se puede deshacer.')) return;
    setEliminando(id);
    const ok = await eliminarVersion(id);
    if (ok) setVersiones(prev => prev.filter(v => v.id !== id));
    setEliminando(null);
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('es-PY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const total = versiones.length;

  return (
    <div
      className={styles.overlay}
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerIcon}>💾</span>
          <span className={styles.headerTitle}>Versiones Guardadas</span>
          <button className={styles.closeBtn} onClick={onCerrar} type="button">✕</button>
        </div>

        {/* Guardar sección */}
        <div className={styles.guardarSec}>
          {!mostrarForm ? (
            <button className={styles.btnNueva} onClick={abrirForm} type="button">
              + Guardar versión actual
            </button>
          ) : (
            <div className={styles.form}>
              <input
                className={styles.input}
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Nombre de la versión"
                maxLength={80}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter')  void handleGuardar();
                  if (e.key === 'Escape') setMostrarForm(false);
                }}
              />
              <div className={styles.formRow}>
                <button
                  className={styles.btnCancelar}
                  onClick={() => setMostrarForm(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className={styles.btnConfirmar}
                  onClick={() => void handleGuardar()}
                  type="button"
                  disabled={guardando || !nombre.trim()}
                >
                  {guardando ? 'Guardando…' : '💾 Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className={styles.lista}>
          {cargando ? (
            <div className={styles.msg}>Cargando versiones…</div>
          ) : versiones.length === 0 ? (
            <div className={styles.msg}>
              No hay versiones guardadas aún.<br />
              Usá el botón de arriba para crear la primera.
            </div>
          ) : (
            versiones.map((v, idx) => (
              <div key={v.id} className={styles.card}>

                <div className={styles.vNum}>v{total - idx}</div>

                <div className={styles.cardBody}>
                  <div className={styles.cardNombre}>{v.nombre}</div>
                  <div className={styles.cardMeta}>
                    {fmt(v.created_at)} · {v.snapshot?.total ?? '?'} OTs
                  </div>
                  {v.descripcion && (
                    <div className={styles.cardDesc}>{v.descripcion}</div>
                  )}
                  <div className={styles.cardBtns}>
                    <button
                      className={styles.btnRestaurar}
                      onClick={() => setPendingRestaur(v)}
                      type="button"
                    >
                      Restaurar
                    </button>
                    <button
                      className={styles.btnComparar}
                      onClick={() => { onComparar(v.id); onCerrar(); }}
                      type="button"
                    >
                      Comparar
                    </button>
                  </div>
                </div>

                <button
                  className={styles.btnDel}
                  onClick={() => void handleEliminar(v.id)}
                  type="button"
                  disabled={eliminando === v.id}
                  title="Eliminar versión"
                >
                  {eliminando === v.id ? '…' : '🗑'}
                </button>

              </div>
            ))
          )}
        </div>


        {/* ─── Confirmación restaurar ─── */}
        {pendingRestaur && (
          <div className={styles.confirmOverlay}>
            <div className={styles.confirmBox}>
              <div className={styles.confirmIcon}>⚠️</div>
              <div className={styles.confirmTitle}>Confirmar restauración</div>
              <div className={styles.confirmMsg}>
                ¿Restaurar al estado de <strong>"{pendingRestaur.nombre}"</strong>?
                <br /><br />
                Se guardará un backup automático del estado actual antes de restaurar.
              </div>
              <div className={styles.confirmBtns}>
                <button className={styles.btnCancelar} type="button"
                  onClick={() => setPendingRestaur(null)}>Cancelar</button>
                <button className={styles.btnConfirmarRed} type="button"
                  onClick={() => { onRestaurar(pendingRestaur as import('../../services/versionesService').Version); setPendingRestaur(null); }}>
                  ✓ Confirmar restauración
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
