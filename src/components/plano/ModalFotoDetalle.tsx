// src/components/plano/ModalFotoDetalle.tsx
//
// Modal de preview + descripción de foto. Dos modos:
//
//   - 'subida' (default): el usuario eligió un archivo y revisa antes de subir.
//     Se pasa `file` (File) y el modal genera el objectURL para preview.
//     Muestra título "Nueva Evidencia", el nombre del archivo, y el botón
//     "Editar imagen" para anotar la imagen antes del upload (vía VisorFotos).
//
//   - 'edicion': el usuario quiere editar la descripción de una foto YA subida.
//     Se pasa `fotoUrl` (string) y `descripcionInicial` (string). El modal NO
//     genera objectURL — usa la URL directamente. Muestra título "Editar
//     Descripción" y oculta el botón "Editar imagen".
//
// En ambos modos `onGuardar(descripcion)` se invoca cuando el usuario confirma;
// el padre decide qué hacer con la descripción (subir nueva foto o update DB).

import { useEffect, useState } from 'react';
import styles from './ModalFotoDetalle.module.css';

interface Props {
  modo?: 'subida' | 'edicion';
  file?: File;
  fotoUrl?: string;
  descripcionInicial?: string;
  categoria: 'ANTES' | 'DURANTE' | 'DESPUES';
  onGuardar: (descripcion: string) => void;
  onCancelar: () => void;
  onEditarImagen: () => void;
}

const MAX_DESCRIPCION = 300;
const MAX_NOMBRE_ARCHIVO = 40;

const PLACEHOLDERS: Record<Props['categoria'], string> = {
  ANTES:   'Describe el estado inicial encontrado...',
  DURANTE: 'Describe el proceso o intervención realizada...',
  DESPUES: 'Describe el resultado final obtenido...',
};

const BADGE_LABEL: Record<Props['categoria'], string> = {
  ANTES:   'ANTES',
  DURANTE: 'DURANTE',
  DESPUES: 'DESPUÉS',
};

const BADGE_CLASS: Record<Props['categoria'], string> = {
  ANTES:   styles.badgeAntes,
  DURANTE: styles.badgeDurante,
  DESPUES: styles.badgeDespues,
};

function truncarNombre(nombre: string, max: number): string {
  if (nombre.length <= max) return nombre;
  return nombre.slice(0, max - 1) + '…';
}

export function ModalFotoDetalle({
  modo = 'subida',
  file,
  fotoUrl,
  descripcionInicial,
  categoria,
  onGuardar,
  onCancelar,
  onEditarImagen,
}: Props) {
  const esEdicion = modo === 'edicion';
  const [descripcion, setDescripcion] = useState<string>(
    esEdicion ? (descripcionInicial ?? '') : ''
  );
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Preview source depende del modo:
  // - edicion → usar `fotoUrl` directo (foto ya subida en Storage).
  // - subida  → objectURL del File con cleanup para no fugar memoria.
  useEffect(() => {
    if (esEdicion) {
      setPreviewUrl(fotoUrl ?? '');
      return;
    }
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [esEdicion, file, fotoUrl]);

  // Escape cierra el modal (mismo efecto que Cancelar y click fuera).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancelar]);

  const titulo = esEdicion ? 'Editar Descripción' : 'Nueva Evidencia';
  const imgAlt = esEdicion ? 'Foto a editar' : (file?.name ?? 'Foto');

  return (
    <div className={styles.backdrop} onClick={onCancelar}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* ── Columna izquierda: preview ── */}
        <div className={styles.imagenCol}>
          <span className={`${styles.badgeCategoria} ${BADGE_CLASS[categoria]}`}>
            {BADGE_LABEL[categoria]}
          </span>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={imgAlt}
              className={styles.imagen}
            />
          )}
        </div>

        {/* ── Columna derecha: formulario ── */}
        <div className={styles.formCol}>
          <h3 className={styles.titulo}>{titulo}</h3>
          {!esEdicion && file && (
            <div className={styles.subtituloArchivo} title={file.name}>
              {truncarNombre(file.name, MAX_NOMBRE_ARCHIVO)}
            </div>
          )}

          <div className={styles.separador} />

          <label className={styles.label} htmlFor="modal-foto-descripcion">
            Descripción
          </label>
          <textarea
            id="modal-foto-descripcion"
            className={styles.textarea}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder={PLACEHOLDERS[categoria]}
            maxLength={MAX_DESCRIPCION}
            autoFocus
          />
          <div className={styles.contador}>
            {descripcion.length} / {MAX_DESCRIPCION}
          </div>

          <div className={styles.spacer} />

          <div className={styles.botones}>
            <button
              type="button"
              className={styles.btnGuardar}
              onClick={() => onGuardar(descripcion)}
            >
              Guardar
            </button>
            <button
              type="button"
              className={styles.btnCancelar}
              onClick={onCancelar}
            >
              Cancelar
            </button>
            {!esEdicion && (
              <button
                type="button"
                className={styles.btnEditarImagen}
                onClick={onEditarImagen}
              >
                ✏️ Editar imagen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
