// src/components/plano/EditorFoto.tsx
// S32-A — Editor de Evidencia Fotográfica
// NUEVO ARCHIVO — no toca archivos prohibidos

import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import styles from './EditorFoto.module.css';
import { cargarEdicionFoto, guardarEdicionFoto } from '../../services/editorFotoService';
import type { AnotacionGuardada } from '../../services/editorFotoService';

// ─── Tipos locales ────────────────────────────────────────────────────────────

type TipoHerramienta = 'cursor' | 'lapiz' | 'flecha' | 'circulo' | 'texto';
type TipoAnotacion   = 'lapiz' | 'flecha' | 'circulo' | 'texto';

interface Punto { x: number; y: number; }

interface Anotacion {
  id: string;
  tipo: TipoAnotacion;
  color: string;
  puntos: Punto[];
  texto?: string;
  visible: boolean;
}

export interface FotoMinima {
  id: string;
  orden_id: string;
  categoria: 'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO';
  file_url: string;
  file_type?: string;
}

interface EditorFotoProps {
  foto: FotoMinima;
  ordenCodigo: string;
  todasLasFotos: FotoMinima[];
  onClose: () => void;
  onGuardado?: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLORES = [
  { valor: '#E53E3E', nombre: 'Rojo' },
  { valor: '#F6AD55', nombre: 'Amarillo' },
  { valor: '#48BB78', nombre: 'Verde' },
  { valor: '#FFFFFF', nombre: 'Blanco' },
];

const HERRAMIENTAS: { id: TipoHerramienta; icon: string; title: string }[] = [
  { id: 'cursor', icon: '↖',  title: 'Seleccionar' },
  { id: 'lapiz',  icon: '✏',  title: 'Lápiz libre' },
  { id: 'flecha', icon: '↗',  title: 'Flecha' },
  { id: 'circulo',icon: '○',  title: 'Círculo' },
  { id: 'texto',  icon: 'T',  title: 'Texto (clic en foto)' },
];

const CATEGORIA_LABEL: Record<string, string> = {
  ANTES:   'Antes — Diagnóstico',
  DURANTE: 'Durante — Hallazgo',
  DESPUES: 'Después — Cierre',
  ADJUNTO: 'Adjunto',
};

const TIPO_NOMBRE: Record<TipoAnotacion, string> = {
  lapiz:   'Dibujo libre',
  flecha:  'Flecha',
  circulo: 'Círculo',
  texto:   'Texto',
};

const TIPO_ICONO: Record<TipoAnotacion, string> = {
  lapiz:   '✏',
  flecha:  '↗',
  circulo: '○',
  texto:   'T',
};

function uid(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Funciones de dibujo ──────────────────────────────────────────────────────

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string
) {
  const headLen = 18;
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  // Shaft
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTextBadge(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  texto: string, color: string
) {
  ctx.save();
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
  const tw   = ctx.measureText(texto).width;
  const pad  = 8;
  const dotR = 5;
  const bw   = pad + dotR * 2 + 8 + tw + pad;
  const bh   = 26;
  // Badge background
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  fillRoundRect(ctx, x, y - bh, bw, bh, 4);
  ctx.fill();
  // Colored dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + pad + dotR, y - bh / 2, dotR, 0, 2 * Math.PI);
  ctx.fill();
  // Label
  ctx.fillStyle = '#111111';
  ctx.fillText(texto, x + pad + dotR * 2 + 8, y - bh / 2 + 5);
  ctx.restore();
}

function drawAnotacion(ctx: CanvasRenderingContext2D, ann: Anotacion) {
  if (!ann.visible || ann.puntos.length === 0) return;
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  switch (ann.tipo) {
    case 'lapiz': {
      if (ann.puntos.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(ann.puntos[0].x, ann.puntos[0].y);
      for (let i = 1; i < ann.puntos.length; i++) {
        ctx.lineTo(ann.puntos[i].x, ann.puntos[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'flecha': {
      if (ann.puntos.length < 2) break;
      const p1 = ann.puntos[0];
      const p2 = ann.puntos[ann.puntos.length - 1];
      drawArrow(ctx, p1.x, p1.y, p2.x, p2.y, ann.color);
      break;
    }
    case 'circulo': {
      if (ann.puntos.length < 2) break;
      const c  = ann.puntos[0];
      const e  = ann.puntos[ann.puntos.length - 1];
      const r  = Math.hypot(e.x - c.x, e.y - c.y);
      if (r < 4) break;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'texto': {
      if (!ann.texto || ann.puntos.length === 0) break;
      drawTextBadge(ctx, ann.puntos[0].x, ann.puntos[0].y, ann.texto, ann.color);
      break;
    }
  }
  ctx.restore();
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EditorFoto({
  foto, ordenCodigo, todasLasFotos, onClose, onGuardado,
}: EditorFotoProps) {

  // Índice de navegación entre fotos
  const [indice, setIndice] = useState(
    () => Math.max(0, todasLasFotos.findIndex(f => f.id === foto.id))
  );
  const fotoActual = todasLasFotos[indice] ?? foto;

  // Estado de anotaciones e historial undo/redo
  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([]);
  const [historial,   setHistorial]   = useState<Anotacion[][]>([]);
  const [futuro,      setFuturo]      = useState<Anotacion[][]>([]);

  // Herramienta activa y color
  const [herramienta, setHerramienta] = useState<TipoHerramienta>('cursor');
  const [colorActivo, setColorActivo] = useState('#E53E3E');

  // Metadatos de la foto
  const [descripcion, setDescripcion] = useState('');

  // Ajustes de imagen
  const [brillo,    setBrillo]    = useState(0);
  const [contraste, setContraste] = useState(0);

  // UI state
  const [guardando, setGuardando] = useState(false);
  const [toast,     setToast]     = useState(false);
  const [cargando,  setCargando]  = useState(false);

  // Input de texto flotante
  const [textoPos,   setTextoPos]   = useState<Punto | null>(null);
  const [textoValor, setTextoValor] = useState('');

  // Refs para canvas y dibujo en curso
  const imgRef      = useRef<HTMLImageElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const ctxRef      = useRef<CanvasRenderingContext2D | null>(null);
  const textoRef    = useRef<HTMLInputElement>(null);
  const dibujandoRef = useRef(false);
  const annEnCursoRef = useRef<Anotacion | null>(null);

  // ── Setup canvas ──────────────────────────────────────────────────────────

  const setupCanvas = useCallback(() => {
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const rect = img.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width        = rect.width  * dpr;
    canvas.height       = rect.height * dpr;
    canvas.style.width  = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
  }, []);

  // ── Dibujar todo ──────────────────────────────────────────────────────────

  const dibujarTodo = useCallback((anns: Anotacion[]) => {
    const ctx    = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    anns.forEach(a => drawAnotacion(ctx, a));
  }, []);

  // ── Cargar edición al cambiar foto ────────────────────────────────────────

  useEffect(() => {
    setAnotaciones([]);
    setHistorial([]);
    setFuturo([]);
    setDescripcion('');
    setBrillo(0);
    setContraste(0);
    setCargando(true);
    cargarEdicionFoto(fotoActual.id)
      .then(edicion => {
        const anns = (edicion.anotaciones ?? []) as unknown as Anotacion[];
        setAnotaciones(anns);
        setDescripcion(edicion.descripcion_observacion ?? '');
      })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [fotoActual.id]);

  // ── Redibujar cuando cambien anotaciones ──────────────────────────────────

  useEffect(() => {
    dibujarTodo(anotaciones);
  }, [anotaciones, dibujarTodo]);

  // ── Helpers canvas ────────────────────────────────────────────────────────

  function getCoords(e: React.MouseEvent): Punto {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function commitAnotacion(anns: Anotacion[], nueva: Anotacion): Anotacion[] {
    return [...anns, nueva];
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent) {
    if (herramienta === 'cursor') return;
    if (herramienta === 'texto') {
      const coords = getCoords(e);
      setTextoPos(coords);
      setTextoValor('');
      setTimeout(() => textoRef.current?.focus(), 0);
      return;
    }
    dibujandoRef.current = true;
    const ann: Anotacion = {
      id:      uid(),
      tipo:    herramienta as TipoAnotacion,
      color:   colorActivo,
      puntos:  [getCoords(e)],
      visible: true,
    };
    annEnCursoRef.current = ann;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dibujandoRef.current || !annEnCursoRef.current) return;
    const coords = getCoords(e);
    const ann    = annEnCursoRef.current;

    if (ann.tipo === 'lapiz') {
      ann.puntos = [...ann.puntos, coords];
    } else {
      // flecha y circulo: solo inicio + punto actual
      ann.puntos = [ann.puntos[0], coords];
    }

    // Preview en tiempo real
    dibujarTodo(anotaciones);
    const ctx = ctxRef.current;
    if (ctx) drawAnotacion(ctx, ann);
  }

  function handleMouseUp() {
    if (!dibujandoRef.current || !annEnCursoRef.current) return;
    dibujandoRef.current = false;
    const ann = annEnCursoRef.current;
    annEnCursoRef.current = null;

    // Validar tamaño mínimo
    if (ann.tipo === 'lapiz'  && ann.puntos.length < 3)  return;
    if ((ann.tipo === 'flecha' || ann.tipo === 'circulo') && ann.puntos.length < 2) return;
    const dist = ann.puntos.length >= 2
      ? Math.hypot(
          ann.puntos[ann.puntos.length - 1].x - ann.puntos[0].x,
          ann.puntos[ann.puntos.length - 1].y - ann.puntos[0].y,
        )
      : 999;
    if ((ann.tipo === 'flecha' || ann.tipo === 'circulo') && dist < 8) return;

    const nuevas = commitAnotacion(anotaciones, ann);
    setHistorial(h => [...h, anotaciones]);
    setFuturo([]);
    setAnotaciones(nuevas);
  }

  // ── Confirmar texto ───────────────────────────────────────────────────────

  function confirmarTexto() {
    const texto = textoValor.trim();
    if (!texto || !textoPos) {
      setTextoPos(null);
      return;
    }
    const ann: Anotacion = {
      id:      uid(),
      tipo:    'texto',
      color:   colorActivo,
      puntos:  [textoPos],
      texto,
      visible: true,
    };
    const nuevas = commitAnotacion(anotaciones, ann);
    setHistorial(h => [...h, anotaciones]);
    setFuturo([]);
    setAnotaciones(nuevas);
    setTextoPos(null);
    setTextoValor('');
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    setHistorial(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuturo(f => [...f, anotaciones]);
      setAnotaciones(prev);
      return h.slice(0, -1);
    });
  }, [anotaciones]);

  const redo = useCallback(() => {
    setFuturo(f => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setHistorial(h => [...h, anotaciones]);
      setAnotaciones(next);
      return f.slice(0, -1);
    });
  }, [anotaciones]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No interferir con el input de texto
      if (textoPos) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 's') { e.preventDefault(); handleGuardar(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoPos, undo, redo]);

  // ── Capas ─────────────────────────────────────────────────────────────────

  function toggleVisible(id: string) {
    setAnotaciones(prev =>
      prev.map(a => a.id === id ? { ...a, visible: !a.visible } : a)
    );
  }

  function eliminarCapa(id: string) {
    const nuevas = anotaciones.filter(a => a.id !== id);
    setHistorial(h => [...h, anotaciones]);
    setFuturo([]);
    setAnotaciones(nuevas);
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  function navegar(dir: -1 | 1) {
    const nuevo = indice + dir;
    if (nuevo < 0 || nuevo >= todasLasFotos.length) return;
    setIndice(nuevo);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  async function handleGuardar() {
    setGuardando(true);
    try {
      await guardarEdicionFoto(fotoActual.id, {
        anotaciones: anotaciones as unknown as AnotacionGuardada[],
        descripcion_observacion: descripcion,
      });
      setToast(true);
      setTimeout(() => setToast(false), 2200);
      onGuardado?.();
    } catch (err) {
      console.error(err);
      alert('Error al guardar. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  // ── CSS filter ────────────────────────────────────────────────────────────

  const imgFilter = [
    brillo    !== 0 ? `brightness(${1 + brillo    / 100})` : '',
    contraste !== 0 ? `contrast(${1  + contraste  / 100})` : '',
  ].filter(Boolean).join(' ') || undefined;

  // ── Cursor canvas ─────────────────────────────────────────────────────────

  const canvasCursor =
    herramienta === 'texto'  ? styles.cursorText :
    herramienta === 'cursor' ? styles.cursorDefault :
    styles.cursorCross;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.overlay}>

      {/* ── TOPBAR ────────────────────────────────────────────────────────── */}
      <div className={styles.topbar}>
        <div className={styles.topbarTitle}>
          <div className={styles.topbarMain}>Editor de Evidencia Fotográfica</div>
          <div className={styles.topbarSub}># {ordenCodigo}</div>
        </div>
        <div className={styles.topbarActions}>
          <button className={styles.btnCancelar} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnGuardar}
            onClick={handleGuardar}
            disabled={guardando}
          >
            {guardando ? '⏳ Guardando…' : '💾 Guardar Cambios'}
          </button>
        </div>
      </div>

      <div className={styles.body}>

        {/* ── TOOLBAR IZQUIERDA ────────────────────────────────────────────── */}
        <div className={styles.toolbar}>

          {HERRAMIENTAS.map(h => (
            <button
              key={h.id}
              className={`${styles.toolBtn} ${herramienta === h.id ? styles.toolActive : ''}`}
              onClick={() => { setHerramienta(h.id); setTextoPos(null); }}
              title={h.title}
            >
              {h.icon}
            </button>
          ))}

          <div className={styles.toolSep} />

          {/* Paleta de colores */}
          <div className={styles.colores}>
            {COLORES.map(c => (
              <button
                key={c.valor}
                className={`${styles.colorSwatch} ${colorActivo === c.valor ? styles.colorActive : ''}`}
                style={{ backgroundColor: c.valor }}
                onClick={() => setColorActivo(c.valor)}
                title={c.nombre}
              />
            ))}
          </div>

          <div className={styles.toolSep} />

          {/* Undo / Redo */}
          <button
            className={styles.toolBtn}
            onClick={undo}
            disabled={historial.length === 0}
            title="Deshacer (Ctrl+Z)"
          >↩</button>
          <button
            className={styles.toolBtn}
            onClick={redo}
            disabled={futuro.length === 0}
            title="Rehacer (Ctrl+Y)"
          >↪</button>

        </div>

        {/* ── ÁREA FOTO ────────────────────────────────────────────────────── */}
        <div className={styles.photoArea}>

          <button
            className={`${styles.navBtn} ${styles.navPrev}`}
            onClick={() => navegar(-1)}
            disabled={indice === 0}
            title="Foto anterior"
          >‹</button>

          <div className={styles.photoWrapper}>
            <img
              ref={imgRef}
              src={fotoActual.file_url}
              alt="Evidencia fotográfica"
              className={styles.photoImg}
              style={{ filter: imgFilter }}
              draggable={false}
              onLoad={() => {
                setupCanvas();
                // Redibujar con anotaciones ya cargadas
                setTimeout(() => dibujarTodo(anotaciones), 0);
              }}
            />
            <canvas
              ref={canvasRef}
              className={`${styles.photoCanvas} ${canvasCursor}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {/* Input flotante para herramienta texto */}
            {textoPos && (
              <input
                ref={textoRef}
                className={styles.textoInput}
                style={{
                  left: textoPos.x,
                  top:  Math.max(0, textoPos.y - 34),
                }}
                value={textoValor}
                onChange={e => setTextoValor(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  confirmarTexto();
                  if (e.key === 'Escape') setTextoPos(null);
                }}
                onBlur={confirmarTexto}
                placeholder="Escribí el texto…"
                maxLength={80}
              />
            )}
          </div>

          <button
            className={`${styles.navBtn} ${styles.navNext}`}
            onClick={() => navegar(1)}
            disabled={indice >= todasLasFotos.length - 1}
            title="Foto siguiente"
          >›</button>

          {/* Contador fotos */}
          {todasLasFotos.length > 1 && (
            <div className={styles.photoCounter}>
              {fotoActual.categoria} · {indice + 1} / {todasLasFotos.length}
            </div>
          )}

          {/* Loading overlay */}
          {cargando && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.4)',
              color: '#A89985', fontSize: 13,
            }}>
              Cargando anotaciones…
            </div>
          )}

        </div>

        {/* ── PANEL DERECHO ────────────────────────────────────────────────── */}
        <div className={styles.rightPanel}>

          {/* Detalles */}
          <div className={styles.panelSection}>
            <div className={styles.sectionTitle}>ⓘ Detalles de Evidencia</div>
            <label className={styles.fieldLabel}>Categoría (Fase)</label>
            <select
              className={styles.fieldSelect}
              value={fotoActual.categoria}
              disabled
            >
              {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Descripción */}
          <div className={styles.panelSection}>
            <label className={styles.fieldLabel}>Descripción de la Observación</label>
            <textarea
              className={styles.fieldTextarea}
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Describí lo observado en esta foto…"
            />
          </div>

          {/* Capas de Marcado */}
          <div className={styles.panelSection}>
            <div className={styles.sectionTitle}>
              Capas de Marcado
              {anotaciones.length > 0 && (
                <span className={styles.sectionBadge}>{anotaciones.length}</span>
              )}
            </div>
            <div className={styles.layersList}>
              {anotaciones.length === 0 ? (
                <div className={styles.emptyLayers}>Sin anotaciones todavía</div>
              ) : (
                anotaciones.map(ann => (
                  <div key={ann.id} className={styles.layerItem}>
                    <button
                      className={styles.layerEye}
                      onClick={() => toggleVisible(ann.id)}
                      title={ann.visible ? 'Ocultar' : 'Mostrar'}
                    >
                      {ann.visible ? '👁' : '🚫'}
                    </button>
                    <div
                      className={styles.layerDot}
                      style={{ backgroundColor: ann.color }}
                    />
                    <span className={styles.layerTypeIcon}>
                      {TIPO_ICONO[ann.tipo]}
                    </span>
                    <span className={styles.layerName}>
                      {ann.tipo === 'texto' && ann.texto
                        ? ann.texto
                        : TIPO_NOMBRE[ann.tipo]}
                    </span>
                    <button
                      className={styles.layerDel}
                      onClick={() => eliminarCapa(ann.id)}
                      title="Eliminar capa"
                    >✕</button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Herramientas de ajuste */}
          <div className={styles.panelSection}>
            <div className={styles.sectionTitle}>Herramientas de Ajuste</div>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>Brillo</span>
                <span className={styles.sliderVal}>
                  {brillo > 0 ? `+${brillo}` : brillo}
                </span>
              </div>
              <input
                type="range" min={-100} max={100}
                value={brillo}
                onChange={e => setBrillo(Number(e.target.value))}
                className={styles.slider}
              />
            </div>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>Contraste</span>
                <span className={styles.sliderVal}>
                  {contraste > 0 ? `+${contraste}` : contraste}
                </span>
              </div>
              <input
                type="range" min={-100} max={100}
                value={contraste}
                onChange={e => setContraste(Number(e.target.value))}
                className={styles.slider}
              />
            </div>

            <button className={styles.btnRecortar} disabled>
              ✂ Recortar Imagen <span style={{ fontSize: 10, opacity: 0.6 }}>(próximamente)</span>
            </button>
          </div>

        </div>
      </div>

      {/* Toast de guardado */}
      {toast && (
        <div className={styles.toast}>✓ Guardado correctamente</div>
      )}

    </div>
  );
}