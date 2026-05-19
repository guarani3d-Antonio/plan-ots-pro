import React, { useState, useRef } from 'react';
import styles from './ModalNuevoProyecto.module.css';
import { useProyectosStore } from '../../stores/proyectosStore';
import { procesarPlanoCanvas, esPDFFile } from '../../utils/planoScanner';

async function validarCalidadPlano(
  file: File
): Promise<{ valido: boolean; error?: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > 20 * 1024 * 1024)
      return { valido: false, error: 'El PDF supera el máximo de 20 MB.' };
    return { valido: true };
  }

  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!imageTypes.includes(file.type))
    return { valido: false, error: 'Formato no soportado. Usá PDF, PNG, JPG o WebP.' };

  if (file.size < 200 * 1024)
    return { valido: false, error: 'Imagen demasiado pequeña (< 200 KB). El plano puede verse pixelado.' };

  if (file.size > 20 * 1024 * 1024)
    return { valido: false, error: 'La imagen supera el máximo de 20 MB.' };

  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const minAncho = 1800;
      const minAlto  = 1200;
      if (img.width < minAncho || img.height < minAlto) {
        resolve({
          valido: false,
          error: `Resolución insuficiente: ${img.width}×${img.height}px. ` +
                 `Mínimo requerido: ${minAncho}×${minAlto}px. ` +
                 `Subí el plano en mayor calidad o usá PDF.`,
        });
      } else {
        resolve({ valido: true });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valido: false, error: 'No se pudo leer la imagen.' });
    };
    img.src = url;
  });
}

interface Props {
  onCerrar: () => void;
}

export const ModalNuevoProyecto: React.FC<Props> = ({ onCerrar }) => {
  const [nombre, setNombre]   = useState('');
  const [cliente, setCliente] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError]     = useState('');
  const [progreso, setProgreso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [validando, setValidando] = useState(false);

  const inputRef      = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const { crearProyecto } = useProyectosStore();

  const handleArchivo = async (file: File) => {
    setValidando(true);
    try {
      const validacion = await validarCalidadPlano(file);
      if (!validacion.valido) {
        setError(validacion.error ?? 'Plano inválido.');
        return;
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      setArchivo(file);
      setError('');
      if (!esPDFFile(file)) {
        const url = URL.createObjectURL(file);
        previewUrlRef.current = url;
        setPreview(url);
      } else {
        previewUrlRef.current = null;
        setPreview(null);
      }
    } finally {
      setValidando(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (cargando) return;
    const f = e.dataTransfer.files[0];
    if (f) void handleArchivo(f);
  };

  const handleSubmit = async () => {
    if (!nombre.trim()) { setError('El nombre del proyecto es obligatorio.'); return; }
    if (!archivo)       { setError('Debés subir un plano referencial.'); return; }

    setCargando(true);
    setError('');

    try {
      // Scanner Nivel 2: procesar imagen antes de pasarla al store
      // El store hace el upload internamente → recibe un File
      let planoFile: File = archivo;

      if (!esPDFFile(archivo)) {
        setProgreso('Procesando plano con scanner Blueprint Pro...');
        const processedBlob = await procesarPlanoCanvas(archivo);
        // Convertir Blob → File con extensión .png para que el store detecte bien
        planoFile = new File([processedBlob], 'plano_procesado.png', { type: 'image/png' });
      } else {
        setProgreso('Preparando plano PDF...');
      }

      setProgreso('Creando proyecto...');
      await crearProyecto({
        nombre:      nombre.trim(),
        cliente:     cliente.trim(),
        descripcion: '',
        planoFile,
      });

      // El store captura errores internamente — verificar si quedó uno
      const storeErr = useProyectosStore.getState().error;
      if (storeErr) {
        setError(storeErr);
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      onCerrar();

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido al crear el proyecto.');
    } finally {
      setCargando(false);
      setProgreso('');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !cargando) onCerrar();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>

        {/* ─ Header ─ */}
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Nuevo Proyecto</span>
          <button className={styles.btnCerrar} onClick={onCerrar} disabled={cargando}>✕</button>
        </div>

        {/* ─ Body ─ */}
        <div className={styles.modalBody}>

          <div className={styles.formRow}>
            <label className={styles.label}>Nombre del proyecto *</label>
            <input
              className={styles.input}
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Ej: Edificio Torre Norte — Planta 3"
              disabled={cargando}
              autoFocus
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.label}>Cliente <span className={styles.labelHint}>(opcional)</span></label>
            <input
              className={styles.input}
              type="text"
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              placeholder="Ej: BBC Facility Services"
              disabled={cargando}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.label}>
              Plano referencial *
              <span className={styles.labelHint}> PNG · JPG · PDF · máx 20 MB</span>
            </label>
            <div
              className={`${styles.dropZone} ${archivo ? styles.dropZoneActive : ''}`}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => !cargando && !validando && inputRef.current?.click()}
            >
              {validando ? (
                <>
                  <span className={styles.spinner} />
                  <span className={styles.dropText}>Verificando calidad...</span>
                </>
              ) : archivo ? (
                <>
                  <span className={styles.dropIcon}>{esPDFFile(archivo) ? '📄' : '🖼'}</span>
                  <span className={styles.dropFileName}>{archivo.name}</span>
                  <span className={styles.dropFileSize}>
                    {archivo.size > 1024 * 1024
                      ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB`
                      : `${(archivo.size / 1024).toFixed(0)} KB`}
                  </span>
                  {!esPDFFile(archivo) && (
                    <span className={styles.scannerBadge}>⬡ Scanner Nivel 2 activo</span>
                  )}
                </>
              ) : (
                <>
                  <span className={styles.dropIcon}>⬆</span>
                  <span className={styles.dropText}>Arrastrá o hacé clic para subir</span>
                  <span className={styles.dropHint}>PNG · JPG · WEBP · PDF</span>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleArchivo(f); }}
            />
          </div>

          {/* Preview con filtro de scanner */}
          {preview && (
            <div className={styles.previewWrap}>
              <img src={preview} alt="Vista previa" className={styles.previewImg} />
              <span className={styles.previewLabel}>
                Vista previa del scanner (escala de grises + contraste)
              </span>
            </div>
          )}

          {error   && <div className={styles.errorMsg}>{error}</div>}
          {progreso && (
            <div className={styles.progresoMsg}>
              <span className={styles.spinner} />
              {progreso}
            </div>
          )}

        </div>

        {/* ─ Footer ─ */}
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={onCerrar} disabled={cargando}>
            Cancelar
          </button>
          <button
            className={`${styles.btnSubmit} ${cargando ? styles.btnLoading : ''}`}
            onClick={handleSubmit}
            disabled={cargando}
          >
            {cargando ? 'Creando...' : 'Crear Proyecto'}
          </button>
        </div>

      </div>
    </div>
  );
};