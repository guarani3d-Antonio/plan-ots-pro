import * as pdfjsLib from 'pdfjs-dist';
import type { OrdenLocal } from '../types/orden';
import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
import { resolverArchivo } from './storageService';

export interface PlanoContexto {
  imagen: string;
  planoRef: string;
  posX: number;
  posY: number;
}

const ANCHO = 900;
const ALTO = 560;
const MAX_DATA_URL = 400_000;

function posicionValida(orden: OrdenLocal): boolean {
  return Number.isFinite(orden.pos_x) && Number.isFinite(orden.pos_y) &&
    orden.pos_x >= 0 && orden.pos_x <= 1 && orden.pos_y >= 0 && orden.pos_y <= 1;
}

function lienzo(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function rasterizarPlano(ref: string): Promise<HTMLCanvasElement> {
  const url = await resolverArchivo(ref);
  const respuesta = await fetch(url, { cache: 'no-store' });
  if (!respuesta.ok) throw new Error('No se pudo descargar el plano de la obra.');
  const blob = await respuesta.blob();
  if (blob.size > 60 * 1024 * 1024) throw new Error('El plano supera el límite para generar la referencia visual.');
  const esPdf = blob.type === 'application/pdf' || /\.pdf(?:\?|$)/i.test(ref);
  if (esPdf) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    try {
      const pagina = await pdf.getPage(1);
      const original = pagina.getViewport({ scale: 1 });
      const escala = Math.min(1800 / original.width, 2600 / original.height);
      const vista = pagina.getViewport({ scale: escala });
      const canvas = lienzo(Math.ceil(vista.width), Math.ceil(vista.height));
      const contexto = canvas.getContext('2d');
      if (!contexto) throw new Error('No se pudo preparar el plano.');
      contexto.fillStyle = '#fff';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: contexto, viewport: vista }).promise;
      pagina.cleanup();
      return canvas;
    } finally { await pdf.destroy(); }
  }
  if (!blob.type.startsWith('image/')) throw new Error('El formato del plano no admite una vista de ubicación.');
  const urlImagen = URL.createObjectURL(blob);
  try {
    const imagen = new Image();
    imagen.src = urlImagen;
    await imagen.decode();
    if (!imagen.naturalWidth || !imagen.naturalHeight)
      throw new Error('El plano no tiene dimensiones válidas.');
    const escala = Math.min(1, 1800 / imagen.naturalWidth, 2600 / imagen.naturalHeight);
    const canvas = lienzo(Math.max(1, Math.round(imagen.naturalWidth * escala)), Math.max(1, Math.round(imagen.naturalHeight * escala)));
    canvas.getContext('2d')?.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(urlImagen); }
}

function marcar(ctx: CanvasRenderingContext2D, x: number, y: number, radio: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radio + 4, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0F172A';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, 2 * Math.PI);
  ctx.fillStyle = '#D92D20';
  ctx.fill();
}

function componerRecorte(fuente: HTMLCanvasElement, posX: number, posY: number): string {
  const canvas = lienzo(ANCHO, ALTO);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen del plano.');
  const margen = 16;
  const vistaW = ANCHO - margen * 2;
  const vistaH = ALTO - margen * 2;
  const cropW = Math.min(fuente.width, fuente.height * vistaW / vistaH) * 0.5;
  const cropH = cropW * vistaH / vistaW;
  const px = posX * fuente.width;
  const py = posY * fuente.height;
  const sx = Math.max(0, Math.min(fuente.width - cropW, px - cropW / 2));
  const sy = Math.max(0, Math.min(fuente.height - cropH, py - cropH / 2));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.drawImage(fuente, sx, sy, cropW, cropH, margen, margen, vistaW, vistaH);
  const marcadorX = margen + (px - sx) / cropW * vistaW;
  const marcadorY = margen + (py - sy) / cropH * vistaH;
  marcar(ctx, marcadorX, marcadorY, 10);

  // Miniatura del plano completo: deja claro dónde cae el recorte ampliado.
  // Ubica el plano general en la esquina opuesta para no tapar el punto.
  const inset = {
    x: marcadorX > ANCHO / 2 ? 15 : ANCHO - 207,
    y: marcadorY < ALTO / 2 ? ALTO - 151 : 15,
    w: 192, h: 136,
  };
  ctx.fillStyle = '#fff';
  ctx.fillRect(inset.x - 5, inset.y - 5, inset.w + 10, inset.h + 10);
  ctx.strokeStyle = '#3B599B';
  ctx.lineWidth = 2;
  ctx.strokeRect(inset.x - 5, inset.y - 5, inset.w + 10, inset.h + 10);
  const escala = Math.min(inset.w / fuente.width, inset.h / fuente.height);
  const w = fuente.width * escala;
  const h = fuente.height * escala;
  const ix = inset.x + (inset.w - w) / 2;
  const iy = inset.y + (inset.h - h) / 2;
  ctx.drawImage(fuente, ix, iy, w, h);
  marcar(ctx, ix + posX * w, iy + posY * h, 4);

  for (const calidad of [0.82, 0.7, 0.56, 0.42]) {
    const imagen = canvas.toDataURL('image/jpeg', calidad);
    if (imagen.length <= MAX_DATA_URL) return imagen;
  }
  throw new Error('El recorte del plano es demasiado grande para incorporarlo al informe.');
}

/** Primera página del plano; las coordenadas de OT son fracciones del lienzo, no GPS. */
export async function generarContextoPlano(orden: OrdenLocal): Promise<PlanoContexto | null> {
  if (!posicionValida(orden)) return null;
  const ticket = sessionTicket();
  const { data, error } = await supabase.from('proyectos').select('plano_url').eq('id', orden.proyecto_id).single();
  assertSession(ticket);
  if (error || !data?.plano_url || data.plano_url.startsWith('pending:'))
    throw new Error('El proyecto no tiene un plano accesible para mostrar la ubicación de la OT.');
  const fuente = await rasterizarPlano(data.plano_url);
  assertSession(ticket);
  return { imagen: componerRecorte(fuente, orden.pos_x, orden.pos_y),
    planoRef: data.plano_url, posX: orden.pos_x, posY: orden.pos_y };
}
