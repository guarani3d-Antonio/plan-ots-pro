// src/components/plano/VisorFotos.tsx
// S12 — Visor/editor de fotos con anotaciones
// Canvas-based annotation: lápiz libre, flecha, círculo, texto
// Guarda versión anotada como nueva foto (no sobreescribe original)

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { subirYRegistrarFoto, type CategoriaFoto } from '../../services/fotosService';
import styles from './VisorFotos.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'cursor' | 'lapiz' | 'flecha' | 'circulo' | 'texto';

interface Point {
  x: number;
  y: number;
}

interface Annotation {
  id: string;
  tool: Tool;
  color: string;
  lineWidth: number;
  points?: Point[];      // lapiz
  start?: Point;         // flecha, circulo
  end?: Point;           // flecha, circulo
  text?: string;         // texto
  position?: Point;      // texto — canvas coords
}

export interface FotoVisor {
  id: string;
  file_url: string;
  categoria: string;     // 'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO'
  file_type?: string | null;
}

interface TextInputState {
  active: boolean;
  canvasX: number;  // canvas-space coords for final annotation
  canvasY: number;
  clientX: number;  // screen-space coords for floating <input>
  clientY: number;
  value: string;
}

interface VisorFotosProps {
  fotos: FotoVisor[];
  initialIndex?: number;
  ordenId: string;
  onClose: () => void;
  proyectoId: string;
  onFotoGuardada?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  '#FF0000', // rojo — default (marcar problemas)
  '#FF8C00', // naranja
  '#FFD700', // amarillo
  '#00C853', // verde
  '#2196F3', // azul
  '#FFFFFF', // blanco
  '#000000', // negro
];
const WIDTHS = [2, 4, 8];
const ZOOM_LEVELS = [0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM_IDX = 3; // 1x

const CATEGORIA_COLORS: Record<string, string> = {
  ANTES: '#ef4444',
  DURANTE: '#3b82f6',
  DESPUES: '#22c55e',
  ADJUNTO: '#a78bfa',
};

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  lineWidth: number
) {
  const headLen = Math.max(18, lineWidth * 7);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  // Shaft
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Arrowhead (two lines)
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function renderAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (ann.tool) {
    case 'lapiz': {
      const pts = ann.points;
      if (!pts || pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'flecha': {
      if (!ann.start || !ann.end) break;
      // Skip tiny drags (accidental clicks)
      const dx = ann.end.x - ann.start.x;
      const dy = ann.end.y - ann.start.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) break;
      drawArrow(ctx, ann.start, ann.end, ann.lineWidth);
      break;
    }
    case 'circulo': {
      if (!ann.start || !ann.end) break;
      const rx = Math.abs(ann.end.x - ann.start.x) / 2;
      const ry = Math.abs(ann.end.y - ann.start.y) / 2;
      if (rx < 3 && ry < 3) break;
      const cx = (ann.start.x + ann.end.x) / 2;
      const cy = (ann.start.y + ann.end.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'texto': {
      if (!ann.position || !ann.text) break;
      const fontSize = ann.lineWidth * 6 + 14;
      ctx.font = `bold ${fontSize}px sans-serif`;
      // Dark outline for readability on any background
      ctx.lineWidth = Math.max(3, ann.lineWidth * 1.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(ann.text, ann.position.x, ann.position.y);
      // Colored fill
      ctx.fillStyle = ann.color;
      ctx.fillText(ann.text, ann.position.x, ann.position.y);
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

// Map clientX/Y → canvas pixel coordinates (accounts for CSS scaling + position)
function toCanvasPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const VisorFotos: React.FC<VisorFotosProps> = ({
  fotos,
  initialIndex = 0,
  ordenId,
  proyectoId,
  onClose,
  onFotoGuardada,
}) => {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, fotos.length - 1))
  );
  const [tool, setTool] = useState<Tool>('lapiz');
  const [color, setColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(3);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnn, setCurrentAnn] = useState<Annotation | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'ok' | 'err' | ''>('');
  const [textInput, setTextInput] = useState<TextInputState | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const zoom = ZOOM_LEVELS[zoomIdx];
  const fotoActual = fotos[currentIndex];

  // ── Load image ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fotoActual) return;
    setImageLoaded(false);
    setImageError(false);
    setAnnotations([]);
    setCurrentAnn(null);
    setTextInput(null);
    imageRef.current = null;

    const img = new Image();
    // Required for canvas.toBlob() to work after drawImage (CORS)
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Cap at 1920px on the long edge to keep redraws fast on mobile
      const MAX = 1920;
      const long = Math.max(img.naturalWidth, img.naturalHeight, 1);
      const scale = Math.min(1, MAX / long);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => setImageError(true);
    img.src = fotoActual.file_url;
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redraw canvas on every state change ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded || !imageRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
    annotations.forEach(ann => renderAnnotation(ctx, ann));
    if (currentAnn) renderAnnotation(ctx, currentAnn);
  }, [annotations, currentAnn, imageLoaded]);

  // ── Prevent body scroll during touch drawing ───────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevent = (e: TouchEvent) => {
      if (tool !== 'cursor') e.preventDefault();
    };
    canvas.addEventListener('touchmove', prevent, { passive: false });
    canvas.addEventListener('touchstart', prevent, { passive: false });
    return () => {
      canvas.removeEventListener('touchmove', prevent);
      canvas.removeEventListener('touchstart', prevent);
    };
  }, [tool]);

  // ── Focus text input when shown ────────────────────────────────────────────
  useEffect(() => {
    if (textInput?.active) {
      setTimeout(() => textInputRef.current?.focus(), 40);
    }
  }, [textInput?.active]);

  // ── Drawing core ───────────────────────────────────────────────────────────
  const startDraw = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageLoaded) return;

      if (tool === 'cursor') return;

      if (tool === 'texto') {
        const pt = toCanvasPoint(clientX, clientY, canvas);
        setTextInput({
          active: true,
          canvasX: pt.x,
          canvasY: pt.y,
          clientX,
          clientY,
          value: '',
        });
        return;
      }

      const pt = toCanvasPoint(clientX, clientY, canvas);
      const newAnn: Annotation = {
        id: crypto.randomUUID(),
        tool,
        color,
        lineWidth,
        ...(tool === 'lapiz'
          ? { points: [pt] }
          : { start: pt, end: pt }),
      };
      setIsDrawing(true);
      setCurrentAnn(newAnn);
    },
    [tool, color, lineWidth, imageLoaded]
  );

  const continueDraw = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawing || !currentAnn) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pt = toCanvasPoint(clientX, clientY, canvas);

      setCurrentAnn(prev => {
        if (!prev) return null;
        if (prev.tool === 'lapiz') {
          return { ...prev, points: [...(prev.points ?? []), pt] };
        }
        return { ...prev, end: pt };
      });
    },
    [isDrawing, currentAnn]
  );

  const endDraw = useCallback(() => {
    if (!isDrawing || !currentAnn) return;
    setIsDrawing(false);
    setAnnotations(prev => [...prev, currentAnn]);
    setCurrentAnn(null);
  }, [isDrawing, currentAnn]);

  // ── Mouse events ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    startDraw(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    continueDraw(e.clientX, e.clientY);
  };
  const onMouseUp = () => endDraw();
  const onMouseLeave = () => {
    if (isDrawing) endDraw();
  };

  // ── Touch events ───────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      startDraw(t.clientX, t.clientY);
    }
  };
  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      continueDraw(t.clientX, t.clientY);
    }
  };
  const onTouchEnd = () => endDraw();

  // ── Text commit ────────────────────────────────────────────────────────────
  const commitText = () => {
    if (!textInput) return;
    if (textInput.value.trim()) {
      const ann: Annotation = {
        id: crypto.randomUUID(),
        tool: 'texto',
        color,
        lineWidth,
        // +4 because canvas text baseline is at the bottom of the font
        position: { x: textInput.canvasX, y: textInput.canvasY + 4 },
        text: textInput.value.trim(),
      };
      setAnnotations(prev => [...prev, ann]);
    }
    setTextInput(null);
  };

  // ── Undo / Clear ───────────────────────────────────────────────────────────
  const handleUndo = () => setAnnotations(prev => prev.slice(0, -1));
  const handleClear = () => setAnnotations([]);

  // ── Save annotated version ─────────────────────────────────────────────────
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded) return;
    if (annotations.length === 0) {
      showStatus('Agrega al menos una anotación antes de guardar.', 'err');
      return;
    }

    setSaving(true);
    try {
      // Flatten image + annotations into a single PNG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('toBlob devolvió null'))),
          'image/png'
        );
      });

      const file = new File(
        [blob],
        `anotada_${Date.now()}.png`,
        { type: 'image/png' }
      );

      // Upload as a NEW foto in the same category (original is not overwritten)
      await subirYRegistrarFoto(
  file,
  ordenId,
  proyectoId,
  fotoActual.categoria as CategoriaFoto
);
      showStatus('✓ Imagen con anotaciones guardada', 'ok');
      setAnnotations([]);
      onFotoGuardada?.();
    } catch (err) {
      console.error('[VisorFotos] Error al guardar:', err);
      const isDomEx = err instanceof DOMException;
      const msg = isDomEx && err.name === 'SecurityError'
        ? 'Error CORS: la imagen no puede exportarse desde este origen. Verifica la config de CORS en Supabase Storage.'
        : 'Error al guardar la imagen. Intenta de nuevo.';
      showStatus(msg, 'err');
    } finally {
      setSaving(false);
    }
  };

  function showStatus(msg: string, type: 'ok' | 'err') {
    setStatusMsg(msg);
    setStatusType(type);
    setTimeout(() => { setStatusMsg(''); setStatusType(''); }, 4500);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goTo = (idx: number) => {
    if (idx < 0 || idx >= fotos.length) return;
    setCurrentIndex(idx);
    setAnnotations([]);
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never intercept while user is typing in the text overlay
      if (textInput?.active) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      switch (e.key) {
        case 'Escape':  onClose(); break;
        case 'ArrowLeft':  goTo(currentIndex - 1); break;
        case 'ArrowRight': goTo(currentIndex + 1); break;
        case 'z':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleUndo(); }
          break;
        case '+': case '=':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1)); }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoomIdx(i => Math.max(0, i - 1)); }
          break;
        // Quick tool shortcuts (not intercepted if modifier is held)
        case 'v': if (!e.ctrlKey && !e.metaKey) setTool('cursor'); break;
        case 'p': setTool('lapiz'); break;
        case 'a': setTool('flecha'); break;
        case 'c': setTool('circulo'); break;
        case 't': setTool('texto'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, textInput, onClose]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const cursorClass =
    tool === 'cursor' ? styles.cursorDefault :
    tool === 'texto'  ? styles.cursorText    :
    styles.cursorCross;

  const badgeColor = CATEGORIA_COLORS[fotoActual?.categoria] ?? '#888';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Visor de foto">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.catBadge} style={{ background: badgeColor }}>
            {fotoActual?.categoria ?? '—'}
          </span>
          <span className={styles.counter}>
            {currentIndex + 1} / {fotos.length}
          </span>
          {annotations.length > 0 && (
            <span className={styles.annBadge}>
              {annotations.length} anotación{annotations.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <span className={styles.shortcutsHint}>
            V · P · A · C · T &nbsp;|&nbsp; Ctrl+Z deshacer &nbsp;|&nbsp; ← → navegar
          </span>
          <button className={styles.btnClose} onClick={onClose} title="Cerrar (Esc)">
            ✕
          </button>
        </div>
      </div>

      {/* ── CANVAS AREA ────────────────────────────────────────────────────── */}
      <div className={styles.canvasArea}>

        {/* Previous */}
        {fotos.length > 1 && (
          <button
            className={`${styles.navBtn} ${styles.navPrev}`}
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            title="Anterior (←)"
          >
            ‹
          </button>
        )}

        {/* Canvas wrapper — receives CSS zoom */}
        <div
          className={styles.canvasWrapper}
          style={{ transform: `scale(${zoom})` }}
        >
          {!imageLoaded && !imageError && (
            <div className={styles.stateMsg}>Cargando imagen…</div>
          )}
          {imageError && (
            <div className={`${styles.stateMsg} ${styles.stateMsgErr}`}>
              No se pudo cargar la imagen
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`${styles.canvas} ${cursorClass}`}
            style={{ display: imageLoaded ? 'block' : 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Next */}
        {fotos.length > 1 && (
          <button
            className={`${styles.navBtn} ${styles.navNext}`}
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === fotos.length - 1}
            title="Siguiente (→)"
          >
            ›
          </button>
        )}
      </div>

      {/* ── STATUS MESSAGE ─────────────────────────────────────────────────── */}
      {statusMsg && (
        <div className={`${styles.statusMsg} ${statusType === 'err' ? styles.statusErr : styles.statusOk}`}>
          {statusMsg}
        </div>
      )}

      {/* ── TOOLBAR ────────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>

        {/* Tools */}
        <div className={styles.toolGroup}>
          <span className={styles.groupLabel}>HERRAMIENTA</span>
          {(
            [
              ['cursor', '↖', 'Cursor / Mover (V)'],
              ['lapiz',  '✏', 'Lápiz libre (P)'],
              ['flecha', '→', 'Flecha (A)'],
              ['circulo','○', 'Círculo/Elipse (C)'],
              ['texto',  'T', 'Texto (T)'],
            ] as [Tool, string, string][]
          ).map(([t, icon, label]) => (
            <button
              key={t}
              className={`${styles.toolBtn} ${tool === t ? styles.toolBtnActive : ''}`}
              onClick={() => setTool(t)}
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Colors */}
        <div className={styles.toolGroup}>
          <span className={styles.groupLabel}>COLOR</span>
          <div className={styles.colorRow}>
            {COLORS.map(c => (
              <button
                key={c}
                className={`${styles.colorBtn} ${color === c ? styles.colorBtnActive : ''}`}
                style={{ background: c, outline: c === '#FFFFFF' ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Width */}
        <div className={styles.toolGroup}>
          <span className={styles.groupLabel}>GROSOR</span>
          <div className={styles.widthRow}>
            {WIDTHS.map(w => (
              <button
                key={w}
                className={`${styles.widthBtn} ${lineWidth === w ? styles.widthBtnActive : ''}`}
                onClick={() => setLineWidth(w)}
                title={`Grosor ${w}px`}
              >
                <span
                  style={{
                    display: 'block',
                    width: 22,
                    height: w * 2 + 1,
                    background: 'currentColor',
                    borderRadius: 2,
                    margin: '0 auto',
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Zoom */}
        <div className={styles.toolGroup}>
          <span className={styles.groupLabel}>ZOOM</span>
          <div className={styles.zoomRow}>
            <button
              className={styles.zoomBtn}
              onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
              disabled={zoomIdx === 0}
              title="Reducir zoom (Ctrl –)"
            >
              −
            </button>
            <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button
              className={styles.zoomBtn}
              onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              title="Aumentar zoom (Ctrl +)"
            >
              +
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.toolGroup}>
          <span className={styles.groupLabel}>EDITAR</span>
          <div className={styles.actionsRow}>
            <button
              className={styles.actionBtn}
              onClick={handleUndo}
              disabled={annotations.length === 0}
              title="Deshacer última anotación (Ctrl+Z)"
            >
              ↩ Deshacer
            </button>
            <button
              className={styles.actionBtn}
              onClick={handleClear}
              disabled={annotations.length === 0}
              title="Borrar todas las anotaciones"
            >
              🗑 Limpiar
            </button>
          </div>
        </div>

        {/* Save */}
        <div className={styles.toolGroup}>
          <span className={styles.groupLabel}>GUARDAR</span>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || annotations.length === 0 || !imageLoaded}
            title="Guardar versión con anotaciones (nueva foto, no sobreescribe)"
          >
            {saving ? 'Guardando…' : '💾 Guardar anotada'}
          </button>
        </div>

      </div>

      {/* ── FLOATING TEXT INPUT (portal-style: fixed, screen-space coords) ─── */}
      {textInput?.active && (
        <input
          ref={textInputRef}
          className={styles.floatingTextInput}
          style={{
            left: textInput.clientX,
            top: textInput.clientY - 36,
            color: color,
            borderBottomColor: color,
          }}
          value={textInput.value}
          onChange={e =>
            setTextInput(prev => prev ? { ...prev, value: e.target.value } : null)
          }
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitText(); }
            if (e.key === 'Escape') setTextInput(null);
          }}
          onBlur={commitText}
          placeholder="Escribe y pulsa Enter…"
          maxLength={120}
        />
      )}

    </div>
  );
};

export default VisorFotos;
