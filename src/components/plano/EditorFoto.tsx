// src/components/plano/EditorFoto.tsx
// S32-A v3 — zoom sin lag (ref DOM) + guardar imagen anotada

import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import styles from './EditorFoto.module.css';
import {
  cargarEdicionFoto,
  guardarEdicionFoto,
  subirImagenAnotada,
} from '../../services/editorFotoService';
import type { AnotacionGuardada } from '../../services/editorFotoService';
import { supabase } from '../../db/supabase';

// ─── Tipos ───────────────────────────────────────────────────────────────────

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
  proyecto_id: string;
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

// ─── Constantes ──────────────────────────────────────────────────────────────

const COLORES = [
  { valor: '#E53E3E', nombre: 'Rojo' },
  { valor: '#F6AD55', nombre: 'Naranja' },
  { valor: '#48BB78', nombre: 'Verde' },
  { valor: '#FFFFFF', nombre: 'Blanco' },
];

const HERRAMIENTAS: { id: TipoHerramienta; icon: string; title: string }[] = [
  { id: 'cursor', icon: '↖', title: 'Seleccionar' },
  { id: 'lapiz',  icon: '✏', title: 'Lápiz libre' },
  { id: 'flecha', icon: '↗', title: 'Flecha' },
  { id: 'circulo',icon: '○', title: 'Círculo' },
  { id: 'texto',  icon: 'T', title: 'Texto' },
];

const CATEGORIA_LABEL: Record<string, string> = {
  ANTES: 'Antes — Diagnóstico', DURANTE: 'Durante — Hallazgo',
  DESPUES: 'Después — Cierre',  ADJUNTO: 'Adjunto',
};

const TIPO_NOMBRE: Record<TipoAnotacion, string> = {
  lapiz: 'Dibujo libre', flecha: 'Flecha', circulo: 'Círculo', texto: 'Texto',
};
const TIPO_ICONO: Record<TipoAnotacion, string> = {
  lapiz: '✏', flecha: '↗', circulo: '○', texto: 'T',
};

function uid() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Dibujo ───────────────────────────────────────────────────────────────────

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const headLen = 18;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTextBadge(ctx: CanvasRenderingContext2D, x: number, y: number, texto: string, color: string) {
  ctx.save();
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
  const tw = ctx.measureText(texto).width;
  const pad = 8; const dotR = 5;
  const bw = pad + dotR * 2 + 8 + tw + pad; const bh = 26;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  fillRoundRect(ctx, x, y - bh, bw, bh, 4); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x + pad + dotR, y - bh / 2, dotR, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.fillText(texto, x + pad + dotR * 2 + 8, y - bh / 2 + 5);
  ctx.restore();
}

function drawAnotacion(ctx: CanvasRenderingContext2D, ann: Anotacion) {
  if (!ann.visible || ann.puntos.length === 0) return;
  ctx.save();
  ctx.strokeStyle = ann.color; ctx.lineWidth = 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (ann.tipo) {
    case 'lapiz':
      if (ann.puntos.length < 2) break;
      ctx.beginPath(); ctx.moveTo(ann.puntos[0].x, ann.puntos[0].y);
      for (let i = 1; i < ann.puntos.length; i++) ctx.lineTo(ann.puntos[i].x, ann.puntos[i].y);
      ctx.stroke(); break;
    case 'flecha':
      if (ann.puntos.length < 2) break;
      drawArrow(ctx, ann.puntos[0].x, ann.puntos[0].y, ann.puntos[ann.puntos.length - 1].x, ann.puntos[ann.puntos.length - 1].y, ann.color); break;
    case 'circulo': {
      if (ann.puntos.length < 2) break;
      const r = Math.hypot(ann.puntos[ann.puntos.length-1].x - ann.puntos[0].x, ann.puntos[ann.puntos.length-1].y - ann.puntos[0].y);
      if (r < 4) break;
      ctx.beginPath(); ctx.arc(ann.puntos[0].x, ann.puntos[0].y, r, 0, 2 * Math.PI); ctx.stroke(); break;
    }
    case 'texto':
      if (!ann.texto || ann.puntos.length === 0) break;
      drawTextBadge(ctx, ann.puntos[0].x, ann.puntos[0].y, ann.texto, ann.color); break;
  }
  ctx.restore();
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function EditorFoto({ foto, ordenCodigo, todasLasFotos, onClose, onGuardado }: EditorFotoProps) {
  const [indice, setIndice] = useState(() => Math.max(0, todasLasFotos.findIndex(f => f.id === foto.id)));
  const fotoActual = todasLasFotos[indice] ?? foto;

  const [anotaciones,  setAnotaciones]  = useState<Anotacion[]>([]);
  const [historial,    setHistorial]    = useState<Anotacion[][]>([]);
  const [futuro,       setFuturo]       = useState<Anotacion[][]>([]);
  const [herramienta,  setHerramienta]  = useState<TipoHerramienta>('cursor');
  const [colorActivo,  setColorActivo]  = useState('#E53E3E');
  const [descripcion,  setDescripcion]  = useState('');
  const [brillo,       setBrillo]       = useState(0);
  const [contraste,    setContraste]    = useState(0);
  const [guardando,    setGuardando]    = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const [cargando,     setCargando]     = useState(false);
  const [textoPos,     setTextoPos]     = useState<Punto | null>(null);
  const [textoValor,   setTextoValor]   = useState('');
  const [zoomBadge,    setZoomBadge]    = useState(100);

  // Refs
  const imgRef          = useRef<HTMLImageElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const ctxRef          = useRef<CanvasRenderingContext2D | null>(null);
  const textoRef        = useRef<HTMLInputElement>(null);
  const photoAreaRef    = useRef<HTMLDivElement>(null);
  const photoWrapperRef = useRef<HTMLDivElement>(null);
  const zoomRef         = useRef(1);
  const dibujandoRef    = useRef(false);
  const annEnCursoRef   = useRef<Anotacion | null>(null);
  const anotacionesRef  = useRef<Anotacion[]>([]);
  const brilloRef       = useRef(0);
  const contrasteRef    = useRef(0);

  useEffect(() => { anotacionesRef.current = anotaciones; }, [anotaciones]);
  useEffect(() => { brilloRef.current = brillo; }, [brillo]);
  useEffect(() => { contrasteRef.current = contraste; }, [contraste]);

  // ── Zoom directo al DOM ──────────────────────────────────────────────────
  const applyZoom = useCallback((value: number) => {
    const clamped = +Math.min(5, Math.max(0.3, value)).toFixed(2);
    zoomRef.current = clamped;
    if (photoWrapperRef.current) {
      photoWrapperRef.current.style.transform = `scale(${clamped})`;
    }
    setZoomBadge(Math.round(clamped * 100));
  }, []);

  // ── Scroll = zoom ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = photoAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      applyZoom(+(zoomRef.current + delta).toFixed(2));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  // ── Setup canvas ─────────────────────────────────────────────────────────
  const setupCanvas = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
  }, []);

  // ── Dibujar ──────────────────────────────────────────────────────────────
  const dibujarTodo = useCallback((anns: Anotacion[]) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    anns.forEach(a => drawAnotacion(ctx, a));
  }, []);

  // ── Cargar al cambiar foto — lee fotos.descripcion ───────────────────────
  useEffect(() => {
    setAnotaciones([]); setHistorial([]); setFuturo([]);
    setDescripcion(''); setBrillo(0); setContraste(0);
    applyZoom(1);
    setCargando(true);

    Promise.all([
      cargarEdicionFoto(fotoActual.id),
      supabase.from('fotos').select('descripcion').eq('id', fotoActual.id).single(),
    ])
      .then(([edicion, { data: fotoData }]) => {
        const anns = (edicion.anotaciones ?? []) as unknown as Anotacion[];
        setAnotaciones(anns);
        // Usa fotos.descripcion como fuente única de verdad
        setDescripcion(fotoData?.descripcion ?? '');
      })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [fotoActual.id, applyZoom]);

  useEffect(() => { dibujarTodo(anotaciones); }, [anotaciones, dibujarTodo]);

  function getCoords(e: React.MouseEvent): Punto {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const cssW   = canvas.offsetWidth;
    const scale  = cssW / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top)  * scale,
    };
  }

  // ── Mouse handlers ───────────────────────────────────────────────────────
  function handleMouseDown(e: React.MouseEvent) {
    if (herramienta === 'cursor') return;
    if (herramienta === 'texto') {
      setTextoPos(getCoords(e)); setTextoValor('');
      setTimeout(() => textoRef.current?.focus(), 0);
      return;
    }
    dibujandoRef.current = true;
    annEnCursoRef.current = {
      id: uid(), tipo: herramienta as TipoAnotacion,
      color: colorActivo, puntos: [getCoords(e)], visible: true,
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dibujandoRef.current || !annEnCursoRef.current) return;
    const coords = getCoords(e);
    const ann = annEnCursoRef.current;
    if (ann.tipo === 'lapiz') { ann.puntos = [...ann.puntos, coords]; }
    else { ann.puntos = [ann.puntos[0], coords]; }
    dibujarTodo(anotaciones);
    if (ctxRef.current) drawAnotacion(ctxRef.current, ann);
  }

  function handleMouseUp() {
    if (!dibujandoRef.current || !annEnCursoRef.current) return;
    dibujandoRef.current = false;
    const ann = annEnCursoRef.current;
    annEnCursoRef.current = null;
    if (ann.tipo === 'lapiz' && ann.puntos.length < 3) return;
    if ((ann.tipo === 'flecha' || ann.tipo === 'circulo') && ann.puntos.length < 2) return;
    if (ann.tipo === 'flecha' || ann.tipo === 'circulo') {
      const d = Math.hypot(ann.puntos[ann.puntos.length-1].x - ann.puntos[0].x, ann.puntos[ann.puntos.length-1].y - ann.puntos[0].y);
      if (d < 8) return;
    }
    const nuevas = [...anotaciones, ann];
    setHistorial(h => [...h, anotaciones]); setFuturo([]);
    setAnotaciones(nuevas);
  }

  function confirmarTexto() {
    const texto = textoValor.trim();
    if (!texto || !textoPos) { setTextoPos(null); return; }
    const ann: Anotacion = { id: uid(), tipo: 'texto', color: colorActivo, puntos: [textoPos], texto, visible: true };
    setHistorial(h => [...h, anotaciones]); setFuturo([]);
    setAnotaciones(prev => [...prev, ann]);
    setTextoPos(null); setTextoValor('');
  }

  // ── Undo/Redo ────────────────────────────────────────────────────────────
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

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textoPos) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 's') { e.preventDefault(); handleGuardar(); }
        if (e.key === '0') { e.preventDefault(); applyZoom(1); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoPos, undo, redo, applyZoom]);

  function toggleVisible(id: string) {
    setAnotaciones(prev => prev.map(a => a.id === id ? { ...a, visible: !a.visible } : a));
  }
  function eliminarCapa(id: string) {
    const nuevas = anotaciones.filter(a => a.id !== id);
    setHistorial(h => [...h, anotaciones]); setFuturo([]);
    setAnotaciones(nuevas);
  }
  function navegar(dir: -1 | 1) {
    const nuevo = indice + dir;
    if (nuevo < 0 || nuevo >= todasLasFotos.length) return;
    setIndice(nuevo);
  }

  // ── Generar imagen anotada (burn-in) ─────────────────────────────────────
  async function generarImagenAnotada(): Promise<Blob> {
    const displayImg = imgRef.current;
    if (!displayImg) throw new Error('No hay imagen cargada');

    const nW = displayImg.naturalWidth;
    const nH = displayImg.naturalHeight;
    const dW = displayImg.offsetWidth;
    const dH = displayImg.offsetHeight;
    if (!nW || !nH || !dW || !dH) throw new Error('Dimensiones inválidas');

    const sx = nW / dW;
    const sy = nH / dH;

    const response = await fetch(fotoActual.file_url);
    if (!response.ok) throw new Error('No se pudo descargar la imagen original');
    const imageBlob = await response.blob();
    const blobUrl = URL.createObjectURL(imageBlob);

    const offscreen = document.createElement('canvas');
    offscreen.width  = nW;
    offscreen.height = nH;
    const ctx = offscreen.getContext('2d')!;

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const b = brilloRef.current;
        const c = contrasteRef.current;
        const filter = [
          b !== 0 ? `brightness(${1 + b / 100})` : '',
          c !== 0 ? `contrast(${1  + c / 100})` : '',
        ].filter(Boolean).join(' ');
        ctx.filter = filter || 'none';
        ctx.drawImage(img, 0, 0, nW, nH);
        ctx.filter = 'none';
        ctx.save();
        ctx.scale(sx, sy);
        anotacionesRef.current.filter(a => a.visible).forEach(a => drawAnotacion(ctx, a));
        ctx.restore();
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Error cargando imagen')); };
      img.src = blobUrl;
    });

    return new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export falló')), 'image/jpeg', 0.92);
    });
  }

  // ── Guardar — siempre actualiza fotos.descripcion ────────────────────────
  async function handleGuardar() {
    setGuardando(true);
    try {
      const tieneAnnotaciones = anotaciones.length > 0;
      const tieneModificaciones = tieneAnnotaciones || brillo !== 0 || contraste !== 0;

      if (tieneModificaciones) {
        // Burn-in: generar imagen compuesta y subir a Storage
        const blob = await generarImagenAnotada();
        await subirImagenAnotada(
          fotoActual.id,
          fotoActual.orden_id,
          fotoActual.proyecto_id,
          blob,
          anotaciones as unknown as AnotacionGuardada[],
          descripcion,
        );
      } else {
        // Solo anotaciones vacías
        await guardarEdicionFoto(fotoActual.id, { anotaciones: [], descripcion_observacion: descripcion });
      }

      // ── Siempre actualizar fotos.descripcion (fuente única de verdad) ──
      await supabase
        .from('fotos')
        .update({ descripcion: descripcion.trim() })
        .eq('id', fotoActual.id);

      setToast('✓ Guardado correctamente');
      setTimeout(() => setToast(null), 2500);
      onGuardado?.();
    } catch (err) {
      console.error(err);
      alert(`Error al guardar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setGuardando(false);
    }
  }

  const imgFilter = [
    brillo    !== 0 ? `brightness(${1 + brillo    / 100})` : '',
    contraste !== 0 ? `contrast(${1  + contraste  / 100})` : '',
  ].filter(Boolean).join(' ') || undefined;

  const canvasCursor =
    herramienta === 'texto'  ? styles.cursorText  :
    herramienta === 'cursor' ? styles.cursorDefault :
    styles.cursorCross;

  return (
    <div className={styles.overlay}>

      {/* ── TOPBAR ── */}
      <div className={styles.topbar}>
        <button className={styles.btnClose} onClick={onClose} title="Salir (Esc)">✕</button>
        <div className={styles.topbarTitle}>
          <div className={styles.topbarMain}>Editor de Evidencia Fotográfica</div>
          <div className={styles.topbarSub}># {ordenCodigo}</div>
        </div>
        <div className={styles.topbarActions}>
          <button className={styles.btnCancelar} onClick={onClose}>Cancelar</button>
          <button className={styles.btnGuardar} onClick={handleGuardar} disabled={guardando}>
            {guardando ? '⏳ Guardando…' : '💾 Guardar Cambios'}
          </button>
        </div>
      </div>

      <div className={styles.body}>

        {/* ── TOOLBAR ── */}
        <div className={styles.toolbar}>
          {HERRAMIENTAS.map(h => (
            <button
              key={h.id}
              className={`${styles.toolBtn} ${herramienta === h.id ? styles.toolActive : ''}`}
              onClick={() => { setHerramienta(h.id); setTextoPos(null); }}
              title={h.title}
            >{h.icon}</button>
          ))}
          <div className={styles.toolSep} />
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
          <button className={styles.toolBtn} onClick={undo} disabled={historial.length === 0} title="Deshacer (Ctrl+Z)">↩</button>
          <button className={styles.toolBtn} onClick={redo} disabled={futuro.length === 0}    title="Rehacer (Ctrl+Y)">↪</button>
          <div className={styles.toolSep} />
          <button className={styles.toolBtn} onClick={() => applyZoom(1)} title="Zoom 100% (Ctrl+0)" style={{ fontSize: 10, fontWeight: 700 }}>1:1</button>
        </div>

        {/* ── FOTO ── */}
        <div className={styles.photoArea} ref={photoAreaRef}>
          <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => navegar(-1)} disabled={indice === 0} title="Foto anterior">‹</button>

          <div className={styles.photoWrapperOuter}>
            <div
              ref={photoWrapperRef}
              className={styles.photoWrapper}
              onDoubleClick={() => applyZoom(1)}
            >
              <img
                ref={imgRef}
                src={fotoActual.file_url}
                alt="Evidencia fotográfica"
                className={styles.photoImg}
                style={{ filter: imgFilter }}
                draggable={false}
                onLoad={() => {
                  setupCanvas();
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
              {textoPos && (
                <input
                  ref={textoRef}
                  className={styles.textoInput}
                  style={{ left: textoPos.x, top: Math.max(0, textoPos.y - 34) }}
                  value={textoValor}
                  onChange={e => setTextoValor(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmarTexto();
                    if (e.key === 'Escape') setTextoPos(null);
                  }}
                  onBlur={confirmarTexto}
                  placeholder="Escribí el texto…"
                  maxLength={80}
                />
              )}
            </div>
          </div>

          <button className={`${styles.navBtn} ${styles.navNext}`} onClick={() => navegar(1)} disabled={indice >= todasLasFotos.length - 1} title="Foto siguiente">›</button>

          {todasLasFotos.length > 1 && (
            <div className={styles.photoCounter}>{fotoActual.categoria} · {indice + 1} / {todasLasFotos.length}</div>
          )}
          <div className={styles.zoomBadge}>{zoomBadge}%</div>

          {cargando && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)', color: '#6B7280', fontSize: 13 }}>
              Cargando…
            </div>
          )}
        </div>

        {/* ── PANEL DERECHO ── */}
        <div className={styles.rightPanel}>
          <div className={styles.panelSection}>
            <div className={styles.sectionTitle}>ℹ Detalles de Evidencia</div>
            <label className={styles.fieldLabel}>Categoría (Fase)</label>
            <select className={styles.fieldSelect} value={fotoActual.categoria} disabled>
              {Object.entries(CATEGORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className={styles.panelSection}>
            <label className={styles.fieldLabel}>Descripción (aparece en informes)</label>
            <textarea
              className={styles.fieldTextarea}
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Describí el estado de la tarea, materiales observados, condiciones del área…"
              maxLength={1500}
            />
            <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
              {descripcion.length} / 1500
            </div>
          </div>

          <div className={styles.panelSection}>
            <div className={styles.sectionTitle}>
              Capas de Marcado
              {anotaciones.length > 0 && <span className={styles.sectionBadge}>{anotaciones.length}</span>}
            </div>
            <div className={styles.layersList}>
              {anotaciones.length === 0
                ? <div className={styles.emptyLayers}>Sin anotaciones todavía</div>
                : anotaciones.map(ann => (
                  <div key={ann.id} className={styles.layerItem}>
                    <button className={styles.layerEye} onClick={() => toggleVisible(ann.id)} title={ann.visible ? 'Ocultar' : 'Mostrar'}>
                      {ann.visible ? '👁' : '🚫'}
                    </button>
                    <div className={styles.layerDot} style={{ backgroundColor: ann.color }} />
                    <span className={styles.layerTypeIcon}>{TIPO_ICONO[ann.tipo]}</span>
                    <span className={styles.layerName}>{ann.tipo === 'texto' && ann.texto ? ann.texto : TIPO_NOMBRE[ann.tipo]}</span>
                    <button className={styles.layerDel} onClick={() => eliminarCapa(ann.id)} title="Eliminar capa">✕</button>
                  </div>
                ))
              }
            </div>
          </div>

          <div className={styles.panelSection}>
            <div className={styles.sectionTitle}>Herramientas de Ajuste</div>
            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>Brillo</span>
                <span className={styles.sliderVal}>{brillo > 0 ? `+${brillo}` : brillo}</span>
              </div>
              <input type="range" min={-100} max={100} value={brillo} onChange={e => setBrillo(Number(e.target.value))} className={styles.slider} />
            </div>
            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>Contraste</span>
                <span className={styles.sliderVal}>{contraste > 0 ? `+${contraste}` : contraste}</span>
              </div>
              <input type="range" min={-100} max={100} value={contraste} onChange={e => setContraste(Number(e.target.value))} className={styles.slider} />
            </div>
            <button className={styles.btnRecortar} disabled>✂ Recortar <span style={{ fontSize: 10 }}>(próximamente)</span></button>
          </div>
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}