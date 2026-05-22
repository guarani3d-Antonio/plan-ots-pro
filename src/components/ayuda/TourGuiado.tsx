import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import styles from './TourGuiado.module.css';

const LS_TOUR_KEY = 'plan_ots_tour_visto_v1';

interface PasoTour {
  id: string;
  titulo: string;
  texto: string;
  /** Selector CSS del elemento del Sidebar a resaltar. Sin selector → card centrada. */
  selector?: string;
}

const PASOS: PasoTour[] = [
  {
    id: 'bienvenida',
    titulo: '¡Bienvenido a Plan-OTs! 👋',
    texto: 'Gestioná tus órdenes de trabajo de forma visual sobre el plano de cada obra. Te muestro lo esencial en 30 segundos.',
  },
  {
    id: 'proyectos',
    titulo: 'Tus proyectos',
    texto: 'Acá creás un proyecto nuevo y abrís los existentes. Cada proyecto tiene su plano y sus OTs.',
    selector: '[aria-label="Proyectos"]',
  },
  {
    id: 'dashboard',
    titulo: 'Panel ejecutivo',
    texto: 'El Dashboard resume los KPIs de todas tus obras: avance, pendientes y actividad reciente.',
    selector: '[aria-label="Dashboard"]',
  },
  {
    id: 'vistas',
    titulo: 'Planificación en el tiempo',
    texto: 'Organizá los trabajos con la vista Gantt y seguí los hitos en el Calendario.',
    selector: '[aria-label="Gantt"]',
  },
  {
    id: 'ayuda',
    titulo: '¿Dudas? Ayuda siempre a mano',
    texto: 'En Ayuda tenés la guía completa por módulos. Volvé cuando quieras.',
    selector: '[aria-label="Ayuda"]',
  },
  {
    id: 'fin',
    titulo: '¡Listo para arrancar! 🚀',
    texto: 'Empezá creando tu primer proyecto desde el menú Proyectos.',
  },
];

interface Rect { top: number; left: number; width: number; height: number; }

export default function TourGuiado() {
  const [visible, setVisible] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_TOUR_KEY) !== '1'; }
    catch { return false; }
  });
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const pasoActual = PASOS[paso];

  const recalcular = useCallback(() => {
    const sel = PASOS[paso]?.selector;
    if (!sel) { setRect(null); return; }
    const el = document.querySelector(sel);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [paso]);

  useEffect(() => {
    if (!visible) return;
    recalcular();
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
    };
  }, [visible, recalcular]);

  if (!visible) return null;

  const cerrar = () => {
    try { localStorage.setItem(LS_TOUR_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  const siguiente = () => {
    if (paso < PASOS.length - 1) setPaso(p => p + 1);
    else cerrar();
  };
  const anterior = () => { if (paso > 0) setPaso(p => p - 1); };

  const PAD = 8;
  const cardCentrada = !rect;

  const spotlightStyle: CSSProperties | undefined = rect ? {
    position: 'fixed',
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    borderRadius: 10,
    boxShadow: '0 0 0 9999px rgba(8, 12, 20, 0.78)',
    border: '2px solid #CC7A00',
    pointerEvents: 'none',
    transition: 'all 0.2s ease',
    zIndex: 100000,
  } : undefined;

  const EST_CARD_H = 250; // alto estimado de la card para clampear al viewport
  const cardStyle: CSSProperties = { position: 'fixed', zIndex: 100001, width: 320 };
  if (rect) {
    const clampTop = (t: number) =>
      Math.max(16, Math.min(t, window.innerHeight - EST_CARD_H - 16));
    const espacioDerecha = window.innerWidth - (rect.left + rect.width);
    if (espacioDerecha > 360) {
      // A la derecha del elemento, centrada vertical respecto al ítem y clampeada.
      cardStyle.top = clampTop(rect.top + rect.height / 2 - EST_CARD_H / 2);
      cardStyle.left = rect.left + rect.width + 20;
    } else {
      cardStyle.top = clampTop(rect.top + rect.height + 16);
      cardStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 340));
    }
  } else {
    cardStyle.top = '50%';
    cardStyle.left = '50%';
    cardStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <div className={styles.overlay}>
      {cardCentrada && <div className={styles.dimFull} />}
      {rect && <div style={spotlightStyle} />}

      <div className={styles.card} style={cardStyle}>
        <div className={styles.cardHeader}>
          <span className={styles.progreso}>{paso + 1} / {PASOS.length}</span>
          <button className={styles.btnSaltar} onClick={cerrar} type="button">
            Saltar ✕
          </button>
        </div>
        <h3 className={styles.titulo}>{pasoActual.titulo}</h3>
        <p className={styles.texto}>{pasoActual.texto}</p>
        <div className={styles.acciones}>
          <button
            className={styles.btnSec}
            onClick={anterior}
            disabled={paso === 0}
            type="button"
          >
            Anterior
          </button>
          <button className={styles.btnPrim} onClick={siguiente} type="button">
            {paso < PASOS.length - 1 ? 'Siguiente' : 'Empezar'}
          </button>
        </div>
      </div>
    </div>
  );
}