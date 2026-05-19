import { useState, useEffect, useRef } from 'react';
import styles from './ModalComentarioEstado.module.css';

interface Props {
  isOpen: boolean;
  estadoAnterior: string;
  estadoNuevo: string;
  esPorFoto?: boolean;        // true cuando lo dispara auto-transición por foto
  onConfirmar: (comentario: string) => void;
  onCancelar: () => void;
}

const COLORES_ESTADO: Record<string, string> = {
  'Pendiente':  '#DC2626',   // rojo
  'En proceso': '#2563EB',   // azul
  'Cerrada':    '#16A34A',   // verde
  'No aplica':  '#6B7280',   // gris
};

export function ModalComentarioEstado({
  isOpen, estadoAnterior, estadoNuevo, esPorFoto = false,
  onConfirmar, onCancelar
}: Props) {
  const [texto, setTexto] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MIN_CHARS = 10;

  useEffect(() => {
    if (isOpen) {
      setTexto('');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const valido = texto.trim().length >= MIN_CHARS;
  const colorAnterior = COLORES_ESTADO[estadoAnterior] ?? '#6B7280';
  const colorNuevo    = COLORES_ESTADO[estadoNuevo]    ?? '#6B7280';

  return (
    <div className={styles.backdrop} onClick={onCancelar}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <h2 className={styles.titulo}>Cambio de estado</h2>
          {esPorFoto && (
            <p className={styles.subtituloFoto}>
              📷 La foto que estás subiendo genera este cambio de estado
            </p>
          )}
        </div>

        <div className={styles.transicion}>
          <span className={styles.estadoChip} style={{ background: colorAnterior + '22', color: colorAnterior, border: `1px solid ${colorAnterior}55` }}>
            {estadoAnterior}
          </span>
          <span className={styles.flecha}>→</span>
          <span className={styles.estadoChip} style={{ background: colorNuevo + '22', color: colorNuevo, border: `1px solid ${colorNuevo}55` }}>
            {estadoNuevo}
          </span>
        </div>

        <div className={styles.campoTexto}>
          <label className={styles.label}>
            Comentario técnico <span className={styles.obligatorio}>*</span>
          </label>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Describí qué ocurrió, qué cambió, o el motivo del cambio de estado..."
            rows={4}
            maxLength={1000}
          />
          <div className={styles.contadorChars}>
            <span className={!valido ? styles.charsFaltantes : styles.charsOk}>
              {texto.trim().length < MIN_CHARS
                ? `Mínimo ${MIN_CHARS - texto.trim().length} caracteres más`
                : `${texto.trim().length} caracteres`}
            </span>
          </div>
        </div>

        {esPorFoto && (
          <div className={styles.avisoFoto}>
            ⚠️ Si cancelás, la foto <strong>no se guardará</strong> y el estado no cambiará.
          </div>
        )}

        <div className={styles.botones}>
          <button className={styles.btnCancelar} onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className={styles.btnConfirmar}
            onClick={() => valido && onConfirmar(texto.trim())}
            disabled={!valido}
          >
            Confirmar cambio
          </button>
        </div>

      </div>
    </div>
  );
}
