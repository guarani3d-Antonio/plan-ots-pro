/**
 * CampoVideo.tsx — Campo personalizado tipo video
 * Flujo: selección → validación duración → compresión FFmpeg → upload Storage → URL en JSONB
 * Límites: 30s duración, 50MB post-compresión, 1 video por campo
 */

import { useRef, useState } from 'react';
import { supabase } from '../../db/supabase';
import styles from './CampoVideo.module.css';

const MAX_DURACION_SEG = 30;
const MAX_TAMANO_MB    = 50;

// URLs del core no-threaded (no requiere SharedArrayBuffer ni headers COOP/COEP)
const FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';

type Estado = 'vacio' | 'validando' | 'comprimiendo' | 'subiendo' | 'listo' | 'error';

interface Props {
  valor:      unknown;
  onChange:   (v: unknown) => void;
  ordenId:    string;
  proyectoId: string;
  campoId:    string;
}

export default function CampoVideo({
  valor,
  onChange,
  ordenId,
  proyectoId: _proyectoId,
  campoId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado,   setEstado]   = useState<Estado>(valor ? 'listo' : 'vacio');
  const [progreso, setProgreso] = useState(0);
  const [error,    setError]    = useState<string | null>(null);
  const [metaDur,  setMetaDur]  = useState<number | null>(null);
  const [metaMB,   setMetaMB]   = useState<number | null>(null);

  const videoUrl = typeof valor === 'string' && valor.length > 0 ? valor : null;

  // ── Obtener duración sin FFmpeg ───────────────────────────────────────────
  function getDuracion(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      const url = URL.createObjectURL(file);
      vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(vid.duration); };
      vid.onerror          = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer el video')); };
      vid.src = url;
    });
  }

  // ── Compresión FFmpeg (lazy load del WASM ~31 MB) ─────────────────────────
  async function comprimir(
    file: File,
    onProgress: (p: number) => void
  ): Promise<File> {
    try {
      const { FFmpeg }     = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

      const ff = new FFmpeg();
      ff.on('progress', ({ progress }) => onProgress(Math.round(progress * 100)));

      await ff.load({
        coreURL: await toBlobURL(FFMPEG_CORE_URL, 'text/javascript'),
        wasmURL: await toBlobURL(FFMPEG_WASM_URL, 'application/wasm'),
      });

      const ext    = file.name.split('.').pop() ?? 'mp4';
      const inName = `in.${ext}`;
      const outName = 'out.mp4';

      await ff.writeFile(inName, await fetchFile(file));

      // 720p H.264 · audio AAC 128k · faststart para streaming
      await ff.exec([
        '-i', inName,
        '-vf', 'scale=-2:min(720\\,ih)',   // no upscale si ya es menor a 720p
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outName,
      ]);

      const data = (await ff.readFile(outName)) as unknown as Uint8Array<ArrayBuffer>;
      return new File([new Blob([data], { type: 'video/mp4' })], outName, { type: 'video/mp4' });

    } catch (err) {
      // FFmpeg no disponible (offline, CDN caído) → subir sin comprimir con advertencia
      console.warn('[CampoVideo] FFmpeg no disponible, subiendo sin comprimir:', err);
      return file;
    }
  }

  // ── Upload a Storage (bucket fotos, carpeta VIDEO/) ───────────────────────
  async function subirAStorage(file: File): Promise<string> {
    const ts   = Date.now();
    const path = `${ordenId}/VIDEO/${campoId}_${ts}.mp4`;

    const { error } = await supabase.storage
      .from('fotos')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(`Error al subir video: ${error.message}`);

    const { data } = supabase.storage.from('fotos').getPublicUrl(path);
    return data.publicUrl;
  }

  // ── Handler principal ─────────────────────────────────────────────────────
  async function handleSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!file.type.startsWith('video/')) {
      setError('El archivo debe ser un video (MP4, MOV, WebM)');
      return;
    }

    try {
      // 1. Validar duración
      setEstado('validando');
      const dur = await getDuracion(file);
      setMetaDur(dur);

      if (dur > MAX_DURACION_SEG) {
        setError(`El video dura ${Math.round(dur)}s. Máximo: ${MAX_DURACION_SEG}s`);
        setEstado('error');
        return;
      }

      // 2. Comprimir
      setEstado('comprimiendo');
      setProgreso(0);
      const comprimido = await comprimir(file, setProgreso);
      setProgreso(100);

      // 3. Validar tamaño post-compresión
      const mb = comprimido.size / (1024 * 1024);
      setMetaMB(mb);

      if (mb > MAX_TAMANO_MB) {
        setError(`El video pesa ${mb.toFixed(1)} MB tras comprimir. Máximo: ${MAX_TAMANO_MB} MB`);
        setEstado('error');
        return;
      }

      // 4. Subir
      setEstado('subiendo');
      const url = await subirAStorage(comprimido);

      onChange(url);
      setEstado('listo');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setEstado('error');
    }

    // Reset input para permitir reselección del mismo archivo
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleEliminar() {
    // Nota: el archivo en Storage queda huérfano hasta limpieza futura.
    // Para borrado real necesitamos el path (no solo la URL) — pendiente S14+.
    onChange(null);
    setEstado('vacio');
    setMetaDur(null);
    setMetaMB(null);
  }

  // ── Render: video cargado ─────────────────────────────────────────────────
  if (estado === 'listo' && videoUrl) {
    return (
      <div className={styles.wrap}>
        <video src={videoUrl} controls className={styles.player} />
        {(metaDur !== null || metaMB !== null) && (
          <div className={styles.meta}>
            {metaDur !== null && <span>⏱ {Math.round(metaDur)}s</span>}
            {metaMB  !== null && <span>📦 {metaMB.toFixed(1)} MB</span>}
            <span>MP4 · 720p</span>
          </div>
        )}
        <button
          type="button"
          className={styles.btnEliminar}
          onClick={handleEliminar}
        >
          🗑 Eliminar video
        </button>
      </div>
    );
  }

  // ── Render: en progreso ───────────────────────────────────────────────────
  if (estado === 'validando') {
    return (
      <div className={styles.wrap}>
        <p className={styles.estadoTexto}>🔍 Verificando duración…</p>
      </div>
    );
  }

  if (estado === 'comprimiendo') {
    return (
      <div className={styles.wrap}>
        <p className={styles.estadoTexto}>⚙️ Comprimiendo a 720p… {progreso}%</p>
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${progreso}%` }} />
        </div>
        {progreso === 0 && (
          <p className={styles.hint}>Cargando compresor (~30 MB), un momento…</p>
        )}
      </div>
    );
  }

  if (estado === 'subiendo') {
    return (
      <div className={styles.wrap}>
        <p className={styles.estadoTexto}>☁️ Subiendo video…</p>
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: '100%', opacity: 0.6 }} />
        </div>
      </div>
    );
  }

  // ── Render: vacío / error ─────────────────────────────────────────────────
  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleSeleccionar}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className={styles.btnSeleccionar}
        onClick={() => { setError(null); setEstado('vacio'); inputRef.current?.click(); }}
      >
        📹 Seleccionar video
      </button>
      <p className={styles.hint}>
        Máx. {MAX_DURACION_SEG}s · {MAX_TAMANO_MB} MB · MP4 / MOV / WebM
      </p>
      {error && (
        <p className={styles.error}>{error}</p>
      )}
    </div>
  );
}
