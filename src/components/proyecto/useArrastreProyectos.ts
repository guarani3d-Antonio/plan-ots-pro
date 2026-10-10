import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { ElementoMovimiento } from '../../utils/moverElementosProyecto';

interface Arrastre {
  elemento: ElementoMovimiento;
  destino: string | null | undefined;
  error: string | null;
}

/** El mouse mueve elementos; el dedo conserva el scroll normal de la tablet. */
export function useArrastreProyectos() {
  const [activo, setActivo] = useState<Arrastre | null>(null);
  const limpieza = useRef<(() => void) | null>(null);
  const ignorarClickHasta = useRef(0);
  const origenClick = useRef<HTMLElement | null>(null);
  useEffect(() => () => limpieza.current?.(), []);

  function comenzar(event: ReactPointerEvent<HTMLElement>, elemento: ElementoMovimiento, opciones: {
    permitido: boolean;
    contenedor: HTMLElement | null;
    validar: (destino: string | null) => string | null;
    iniciar: () => void;
    mover: (elemento: ElementoMovimiento, destino: string | null) => Promise<boolean>;
    rechazar: (error: string) => void;
  }) {
    if (!opciones.permitido || event.pointerType !== 'mouse' || event.button !== 0 ||
      (event.target instanceof Element && event.target.closest('[data-no-drag]'))) return;
    limpieza.current?.();
    const origen = event.currentTarget;
    const pointerId = event.pointerId;
    const inicio = { x: event.clientX, y: event.clientY };
    let posicion = inicio;
    let arrastrando = false;
    let frame = 0;
    let anterior: Arrastre | null = null;
    const contenedor = opciones.contenedor;

    function destinoEn(x: number, y: number): Arrastre {
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-destino-movimiento]');
      const destino = target && contenedor?.contains(target)
        ? target.dataset.destinoMovimiento === 'raiz' ? null : target.dataset.destinoMovimiento
        : undefined;
      return { elemento, destino, error: destino === undefined ? null : opciones.validar(destino) };
    }
    function mostrar() {
      const actual = destinoEn(posicion.x, posicion.y);
      if (!anterior || anterior.destino !== actual.destino || anterior.error !== actual.error) {
        anterior = actual; setActivo(actual);
      }
    }
    function autoScroll() {
      if (!arrastrando) return;
      if (contenedor) {
        const rect = contenedor.getBoundingClientRect();
        if (posicion.x >= rect.left && posicion.x <= rect.right) {
          const margen = 48;
          const paso = posicion.y < rect.top + margen ? -10 : posicion.y > rect.bottom - margen ? 10 : 0;
          if (paso && posicion.y >= rect.top && posicion.y <= rect.bottom) {
            contenedor.scrollTop += paso; mostrar();
          }
        }
      }
      frame = requestAnimationFrame(autoScroll);
    }
    function limpiar() {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', movimiento);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', cancelar);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('blur', cancelar);
      if (origen.hasPointerCapture(pointerId)) origen.releasePointerCapture(pointerId);
      if (arrastrando) {
        ignorarClickHasta.current = performance.now() + 400;
        origenClick.current = origen;
      }
      limpieza.current = null;
    }
    function cancelar() { limpiar(); setActivo(null); }
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); cancelar(); } }
    function movimiento(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      posicion = { x: e.clientX, y: e.clientY };
      if (!arrastrando && Math.hypot(posicion.x - inicio.x, posicion.y - inicio.y) < 6) return;
      if (!arrastrando) {
        arrastrando = true;
        origen.setPointerCapture(pointerId);
        opciones.iniciar();
        frame = requestAnimationFrame(autoScroll);
      }
      e.preventDefault(); mostrar();
    }
    function soltar(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const destino = arrastrando ? destinoEn(e.clientX, e.clientY) : null;
      limpiar(); setActivo(null);
      if (!destino || destino.destino === undefined) return;
      if (destino.error) opciones.rechazar(destino.error);
      else void opciones.mover(elemento, destino.destino);
    }
    limpieza.current = limpiar;
    document.addEventListener('pointermove', movimiento, { passive: false });
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', cancelar);
    document.addEventListener('keydown', tecla);
    window.addEventListener('blur', cancelar);
  }

  function evitarClickTrasArrastre(event: MouseEvent<HTMLElement>) {
    if (performance.now() < ignorarClickHasta.current &&
      event.target instanceof Node && origenClick.current?.contains(event.target)) {
      event.preventDefault(); event.stopPropagation();
    }
  }
  return { activo, comenzar, evitarClickTrasArrastre };
}
