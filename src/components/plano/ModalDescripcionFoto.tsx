import { useEffect, useState } from 'react';
import styles from './ModalDescripcionFoto.module.css';

const MAX_CHARS = 1500;

interface Props {
  fotoUrl: string;
  sugerenciaIA: string;
  cargandoIA: boolean;
  onGuardar: (descripcion: string) => void;
  onOmitir: () => void;
}

export default function ModalDescripcionFoto({
  fotoUrl,
  sugerenciaIA,
  cargandoIA,
  onGuardar,
  onOmitir,
}: Props) {
  const [descripcion, setDescripcion] = useState('');

  useEffect(() => {
    if (sugerenciaIA && !descripcion) {
      setDescripcion(sugerenciaIA);
    }
  }, [sugerenciaIA]);

  const handleGuardar = () => {
    onGuardar(descripcion.trim());
  };

  const esCortito = descripcion.length > MAX_CHARS * 0.85;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onOmitir()}>
      <div className={styles.modal}>

        <div className={styles.header}>
          <span className={styles.headerIcon}>📷</span>
          <span className={styles.headerTitle}>Descripción de Fotografía</span>
          <span className={styles.headerBadge}>✨ IA</span>
        </div>

        <div className={styles.body}>

          <div className={styles.thumbnail}>
            <img src={fotoUrl} alt="Foto de la OT" />
          </div>

          <div className={styles.fields}>

            <div>
              <div className={styles.fieldLabel}>
                <span className={styles.labelIcon}>💡</span>
                Sugerencia de la IA
              </div>
              <div className={styles.iaBox}>
                {cargandoIA ? (
                  <div className={styles.iaLoading}>
                    <div className={styles.spinner} />
                    Analizando fotografía...
                  </div>
                ) : sugerenciaIA ? (
                  sugerenciaIA
                ) : (
                  <span className={styles.iaEmpty}>
                    Sin análisis automático — describí la foto manualmente.
                  </span>
                )}
              </div>
            </div>

            <div className={styles.editableSection}>
              <div className={styles.fieldLabel}>
                <span className={styles.labelIcon}>✏️</span>
                Tu descripción (aparece en informes)
              </div>
              <textarea
                className={styles.textarea}
                value={descripcion}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) {
                    setDescripcion(e.target.value);
                  }
                }}
                placeholder="Describí el estado de la tarea, materiales observados, condiciones del área, etc."
                rows={5}
                autoFocus={!cargandoIA}
              />
              <div className={`${styles.counter} ${esCortito ? styles.counterWarn : ''}`}>
                {descripcion.length} / {MAX_CHARS} caracteres
              </div>
            </div>

          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnOmitir} onClick={onOmitir}>
            Omitir
          </button>
          <button
            className={styles.btnGuardar}
            onClick={handleGuardar}
            disabled={cargandoIA}
          >
            Guardar descripción
          </button>
        </div>

      </div>
    </div>
  );
}