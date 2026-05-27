content = '''\
// src/components/plano/ModalVersiones.tsx
import { useState, useEffect, useCallback } from \'react\';
import type { OrdenLocal } from \'../../types/orden\';
import {
  listarVersiones,
  guardarVersion,
  eliminarVersion,
} from \'../../services/versionesService\';
import type { Version } from \'../../services/versionesService\';
import styles from \'./ModalVersiones.module.css\';

interface Props {
  proyectoId: string;
  ordenes: OrdenLocal[];
  onCerrar: () => void;
  onComparar: () => void;
  onRestaurar: (v: Version) => void;
}

export function ModalVersiones({
  proyectoId,
  ordenes,
  onCerrar,
  onComparar,
  onRestaurar,
}: Props) {
  const [versiones, setVersiones]       = useState<Version[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [mostrarForm, setMostrarForm]   = useState(false);
  const [nombre, setNombre]             = useState(\'\');
  const [guardando, setGuardando]       = useState(false);
  const [eliminando, setEliminando]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await listarVersiones(proyectoId);
    setVersiones(data);
    setCargando(false);
  }, [proyectoId]);

  useEffect(() => { void cargar(); }, [cargar]);

  function abrirForm() {
    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, \'0\');
    const m = String(hoy.getMonth() + 1).padStart(2, \'0\');
    const y = hoy.getFullYear();
    setNombre(`v${d}/${m}/${y} \\u2014 ${ordenes.length} OTs`);
    setMostrarForm(true);
  }

  async function handleGuardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    const snap = ordenes.map(o => ({
      id:          o.id          ?? \'\',
      ot:          o.ot          ?? \'\',
      ubicacion:   o.ubicacion   ?? \'\',
      rubro:       o.rubro       ?? \'\',
      estado:      o.estado,
      responsable: o.responsable ?? \'\',
      prioridad:   o.prioridad   ?? \'Media\',
      pos_x:       o.pos_x       ?? 0,
      pos_y:       o.pos_y       ?? 0,
      comentarios: o.comentarios ?? \'\',
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
    if (!confirm(\'\\u00bfEliminar esta versi\\u00f3n? Esta acci\\u00f3n no se puede deshacer.\')) return;
    setEliminando(id);
    const ok = await eliminarVersion(id);
    if (ok) setVersiones(prev => prev.filter(v => v.id !== id));
    setEliminando(null);
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString(\'es-PY\', {
      day: \'2-digit\', month: \'2-digit\', year: \'numeric\',
      hour: \'2-digit\', minute: \'2-digit\',
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
          <span className={styles.headerIcon}>\\ud83d\\udcbe</span>
          <span className={styles.headerTitle}>Versiones Guardadas</span>
          <button className={styles.closeBtn} onClick={onCerrar} type="button">\\u2715</button>
        </div>

        {/* Guardar secci\\u00f3n */}
        <div className={styles.guardarSec}>
          {!mostrarForm ? (
            <button className={styles.btnNueva} onClick={abrirForm} type="button">
              + Guardar versi\\u00f3n actual
            </button>
          ) : (
            <div className={styles.form}>
              <input
                className={styles.input}
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Nombre de la versi\\u00f3n"
                maxLength={80}
                autoFocus
                onKeyDown={e => {
                  if (e.key === \'Enter\')  void handleGuardar();
                  if (e.key === \'Escape\') setMostrarForm(false);
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
                  {guardando ? \'Guardando\\u2026\' : \'\\ud83d\\udcbe Guardar\'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className={styles.lista}>
          {cargando ? (
            <div className={styles.msg}>Cargando versiones\\u2026</div>
          ) : versiones.length === 0 ? (
            <div className={styles.msg}>
              No hay versiones guardadas a\\u00fan.<br />
              Us\\u00e1 el bot\\u00f3n de arriba para crear la primera.
            </div>
          ) : (
            versiones.map((v, idx) => (
              <div key={v.id} className={styles.card}>

                <div className={styles.vNum}>v{total - idx}</div>

                <div className={styles.cardBody}>
                  <div className={styles.cardNombre}>{v.nombre}</div>
                  <div className={styles.cardMeta}>
                    {fmt(v.created_at)} \\u00b7 {v.snapshot?.total ?? \'?\'} OTs
                  </div>
                  {v.descripcion && (
                    <div className={styles.cardDesc}>{v.descripcion}</div>
                  )}
                  <div className={styles.cardBtns}>
                    <button
                      className={styles.btnRestaurar}
                      onClick={() => onRestaurar(v)}
                      type="button"
                    >
                      Restaurar
                    </button>
                    <button
                      className={styles.btnComparar}
                      onClick={() => { onComparar(); onCerrar(); }}
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
                  title="Eliminar versi\\u00f3n"
                >
                  {eliminando === v.id ? \'\\u2026\' : \'\\ud83d\\uddd1\'}
                </button>

              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
'''

with open('src/components/plano/ModalVersiones.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK -', content.count('\\n'), 'lineas')
