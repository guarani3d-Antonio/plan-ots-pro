// src/sync/SyncManager.ts
import { db } from '../db/dexie';
import { supabase } from '../db/supabase';
import type { OrdenLocal } from '../types/orden';
import type { FotoPendiente } from '../db/dexie';
import {
  subirFoto,
  registrarFotoEnDB,
  type CategoriaFoto,
  type FotoSubida,
} from '../services/fotosService';

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface QueueItemCreate { tipo: 'CREATE_OT'; payload: OrdenLocal; }
interface QueueItemUpdate { tipo: 'UPDATE_OT'; payload: { id: string; campos: Partial<OrdenLocal> }; }
interface QueueItemDelete { tipo: 'DELETE_OT'; payload: { id: string }; }
interface QueueItemUploadFoto { tipo: 'UPLOAD_FOTO'; payload: { fotoPendienteId: number }; }
type QueueItem = QueueItemCreate | QueueItemUpdate | QueueItemDelete | QueueItemUploadFoto;

// 'OMITIR' NO es fallo: el item queda en la cola sin gastar intentos. Cubre el
// tipo desconocido y la foto que otra pasada tiene reclamada.
type ResultadoItem = 'OK' | 'FALLO' | 'OMITIR';

const MAX_INTENTOS = 3;

// Un item fuera de esta lista se OMITE, no se descarta. Antes caía en el
// `return true` final de procesarItem y se borraba en la primera pasada como si
// hubiera subido bien, sin log: es lo que dejó huérfano el binario de TODA foto
// encolada desde B2 Fase 2.
const TIPOS_CONOCIDOS = new Set(['CREATE_OT', 'UPDATE_OT', 'DELETE_OT', 'UPLOAD_FOTO']);

// Una pestaña que muere a mitad de subida deja el registro en SUBIENDO con su
// item de cola presente: no es huérfano y el claim lo rechazaría para siempre.
// Pasado este lease, otra pasada puede robarlo.
const LEASE_SUBIENDO_MS = 10 * 60 * 1000;

// ─── Mapper local → Supabase (igual que en ordenesStore) ─────────────────────
function ordenToRow(o: OrdenLocal) {
  return {
    id:            o.id,
    proyecto_id:   o.proyecto_id,
    ot:            o.ot,
    ubicacion:     o.ubicacion ?? '',
    comentarios:   o.descripcion,
    estado:        o.estado,
    prioridad:     o.prioridad,
    responsable:   o.responsable,
    rubro:         o.rubro,
    pos_x:         o.pos_x,
    pos_y:         o.pos_y,
    plano_ref_url: o.plano_ref_url,
    campos:        o.campos,
    conflict_flag: o.conflict_flag,
  };
}

// ─── Subida de una foto capturada offline (B2 Fase 3) ────────────────────────
type Claim =
  | { estado: 'GANADO'; reg: FotoPendiente & { id: number } }
  | { estado: 'NADA_QUE_HACER' }
  | { estado: 'RECLAMADO_POR_OTRO' };

async function subirFotoPendiente(fotoPendienteId: number): Promise<ResultadoItem> {
  // Claim atómico: IndexedDB serializa las transacciones rw entre pestañas del
  // mismo origen, así que este read-and-flip es indivisible y sólo una pasada
  // gana el registro. Sin esto, dos pestañas online suben la misma foto dos veces.
  const claim: Claim = await db.transaction('rw', db.fotosPendientes, async () => {
    const r = await db.fotosPendientes.get(fotoPendienteId);
    if (!r || r.id === undefined)      return { estado: 'NADA_QUE_HACER' } as Claim;
    if (r.estadoSync === 'COMPLETADO') return { estado: 'NADA_QUE_HACER' } as Claim;
    if (r.estadoSync === 'SUBIENDO') {
      const desde = r.subiendo_desde ? Date.parse(r.subiendo_desde) : 0;
      if (Date.now() - desde < LEASE_SUBIENDO_MS) {
        return { estado: 'RECLAMADO_POR_OTRO' } as Claim;
      }
    }
    await db.fotosPendientes.update(r.id, {
      estadoSync:     'SUBIENDO',
      subiendo_desde: new Date().toISOString(),
    });
    return { estado: 'GANADO', reg: r as FotoPendiente & { id: number } } as Claim;
  });

  // Ya no existe (el técnico la borró) o ya subió: el item de cola sobra.
  if (claim.estado === 'NADA_QUE_HACER')     return 'OK';
  // La tiene otra pasada viva: ni tocar el item ni gastarle un intento.
  if (claim.estado === 'RECLAMADO_POR_OTRO') return 'OMITIR';

  const reg = claim.reg;

  // 1. Storage. Con storage_path ya escrito, el archivo se subió en un intento
  //    previo cuyo insert falló: NO se re-sube, se reusa.
  let path = reg.storage_path ?? null;
  let url:  string;
  if (path) {
    url = supabase.storage.from('fotos').getPublicUrl(path).data.publicUrl;
  } else {
    // Se reconstruye el File en vez de confiar en que IndexedDB preserve el
    // subtipo: subirFoto necesita name/type/size.
    const file   = new File([reg.blob], reg.nombre, { type: reg.file_type });
    const subida = await subirFoto(file, reg.orden_id, reg.categoria as CategoriaFoto);
    path = subida.path;
    url  = subida.url;
    // Se persiste ANTES del insert: si el insert falla, el reintento entra por la
    // rama de arriba y no deja un segundo archivo huérfano en el bucket.
    await db.fotosPendientes.update(reg.id, { storage_path: path });
  }

  // 2. Fila en `fotos`. fotoId es el candado de idempotencia: si ya está, el
  //    insert ocurrió y sólo puede faltar la descripción.
  let fotoId = reg.fotoId ?? null;
  if (!fotoId) {
    const foto: FotoSubida = {
      url, path,
      categoria:   reg.categoria as CategoriaFoto,
      orden_id:    reg.orden_id,
      proyecto_id: reg.proyecto_id,
      file_type:   reg.file_type,
      nombre:      reg.nombre,
    };
    fotoId = await registrarFotoEnDB(foto);
    await db.fotosPendientes.update(reg.id, { fotoId });
  }

  // 3. Descripción. NO puede hacer fallar el item: la foto ya está registrada y
  //    visible. Si esto falla se pierde un texto, no una foto — y un 'FALLO' acá
  //    haría reintentar un insert que ya ocurrió.
  const desc = (reg.descripcion ?? '').trim();
  if (desc) {
    const { error } = await supabase.from('fotos').update({ descripcion: desc }).eq('id', fotoId);
    if (error) console.warn(`[SyncManager] Foto ${fotoId} subida, descripción no guardada:`, error.message);
  }

  // 4. Decisión 1b: el binario se borra. Hasta 10 MB por foto retenidos para
  //    siempre en la tablet no se justifican, y la UI ya ignora COMPLETADO
  //    (fotosService:244), así que conservarlo no muestra nada.
  await db.fotosPendientes.delete(reg.id);
  return 'OK';
}

// ─── Barrido de huérfanos ─────────────────────────────────────────────────────
// Binarios sin item en la cola. Los produjo el bug del `return true` y los puede
// producir cualquier borrado a medias. Se RE-ENCOLAN, no se borran: el binario es
// trabajo del técnico, el item es contabilidad — perder contabilidad tiene que
// curarse, no destruir el dato. 'ERROR' no se toca: ese estado espera decisión
// humana.
async function reconciliarFotosHuerfanas(): Promise<void> {
  const registros = await db.fotosPendientes
    .where('estadoSync').anyOf('PENDIENTE', 'SUBIENDO').toArray();
  if (registros.length === 0) return;

  const items = await db.syncQueue.where('tipo').equals('UPLOAD_FOTO').toArray();
  const encolados = new Set(
    items
      .map(i => (i.payload as { fotoPendienteId?: number })?.fotoPendienteId)
      .filter((n): n is number => typeof n === 'number')
  );

  const ahora = new Date().toISOString();
  for (const reg of registros) {
    if (reg.id === undefined || encolados.has(reg.id)) continue;
    // Una re-subida no duplica nada: storage_path y fotoId hacen el trabajo.
    if (reg.estadoSync === 'SUBIENDO') {
      await db.fotosPendientes.update(reg.id, { estadoSync: 'PENDIENTE' });
    }
    await db.syncQueue.add({
      tipo:       'UPLOAD_FOTO',
      payload:    { fotoPendienteId: reg.id },
      created_at: ahora,
      intentos:   0,
    });
    console.warn(`[SyncManager] Foto pendiente ${reg.id} sin item en cola — re-encolada.`);
  }
}

// ─── Procesar un item de la cola ──────────────────────────────────────────────
async function procesarItem(item: QueueItem & { id?: number }): Promise<ResultadoItem> {
  try {
    if (item.tipo === 'CREATE_OT') {
      const { error } = await supabase
        .from('ordenes')
        .insert(ordenToRow(item.payload));
      if (error) throw error;

    } else if (item.tipo === 'UPDATE_OT') {
      const { id, campos } = item.payload;
      // Construir payload limpio para Supabase
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      const camposPublicos: (keyof OrdenLocal)[] = [
        'ot', 'estado', 'prioridad', 'responsable',
        'rubro', 'pos_x', 'pos_y', 'plano_ref_url',
        'campos', 'conflict_flag',
      ];
      camposPublicos.forEach(k => {
        if (k in campos) patch[k] = campos[k as keyof typeof campos];
      });
      if ('descripcion' in campos) patch['comentarios'] = campos.descripcion;
      if ('ubicacion'   in campos) patch['ubicacion']   = campos.ubicacion;

      const { error } = await supabase
        .from('ordenes')
        .update(patch)
        .eq('id', id);
      if (error) throw error;

    } else if (item.tipo === 'DELETE_OT') {
      const { error } = await supabase
        .from('ordenes')
        .delete()
        .eq('id', item.payload.id);
      if (error) throw error;

    } else if (item.tipo === 'UPLOAD_FOTO') {
      return await subirFotoPendiente(item.payload.fotoPendienteId);
    }

    return 'OK'; // éxito

  } catch (err) {
    console.error(`[SyncManager] Error procesando ${item.tipo}:`, err);
    if (item.tipo === 'UPLOAD_FOTO') {
      // Se libera el claim y se guarda el motivo. Sin liberarlo, el registro
      // queda en SUBIENDO y su propio lease lo bloquearía 10 minutos ante un
      // fallo de red trivial que debería reintentarse en el próximo 'online'.
      await db.fotosPendientes.update(item.payload.fotoPendienteId, {
        estadoSync:   'PENDIENTE',
        ultimo_error: err instanceof Error ? err.message : String(err),
      }).catch(() => { /* el registro pudo haberse borrado desde la UI */ });
    }
    return 'FALLO';
  }
}

// ─── Función principal: procesar toda la cola ─────────────────────────────────
export async function procesarSyncQueue(): Promise<void> {
  if (!navigator.onLine) return;

  // Antes de leer la cola: recuperar los binarios que quedaron sin item.
  await reconciliarFotosHuerfanas();

  const items = await db.syncQueue.orderBy('id').toArray();
  if (items.length === 0) return;

  console.log(`[SyncManager] Procesando ${items.length} item(s) en cola...`);

  for (const item of items) {
    // Tipo desconocido: no es fallo de red. Gastarle intentos terminaría
    // borrándolo, que es exactamente el bug que estamos cerrando.
    if (!TIPOS_CONOCIDOS.has(item.tipo)) {
      console.warn(`[SyncManager] Item ${item.id} de tipo desconocido "${item.tipo}" — se conserva en cola sin procesar.`);
      continue;
    }

    const resultado = await procesarItem(item as QueueItem & { id?: number });

    if (resultado === 'OMITIR') {
      // Ni borrar ni contar intento: otra pasada tiene esta foto reclamada.
      continue;

    } else if (resultado === 'OK') {
      // Eliminar de la cola
      if (item.id !== undefined) await db.syncQueue.delete(item.id);

    } else {
      // Incrementar intentos; si supera el límite, descartar con log
      const intentos = (item.intentos ?? 0) + 1;
      if (intentos >= MAX_INTENTOS) {
        if (item.tipo === 'UPLOAD_FOTO') {
          // Excepción: el item sale de la cola pero EL BINARIO QUEDA, en 'ERROR',
          // esperando reintento manual. Descartarlo sería tirar trabajo de campo.
          const idFoto = (item.payload as { fotoPendienteId: number }).fotoPendienteId;
          await db.fotosPendientes.update(idFoto, { estadoSync: 'ERROR' }).catch(() => {});
          console.warn(`[SyncManager] Foto ${idFoto} en ERROR tras ${MAX_INTENTOS} intentos. Binario conservado.`);
        } else {
          console.warn(`[SyncManager] Item ${item.id} descartado tras ${MAX_INTENTOS} intentos.`);
        }
        if (item.id !== undefined) await db.syncQueue.delete(item.id);
      } else {
        await db.syncQueue.update(item.id!, { intentos });
      }
    }
  }

  console.log('[SyncManager] Cola procesada.');
}

// ─── Inicializar listeners de conectividad ────────────────────────────────────
export function iniciarSyncManager(): () => void {
  const handleOnline = () => {
    console.log('[SyncManager] Conexión recuperada → procesando cola...');
    procesarSyncQueue();
  };

  window.addEventListener('online', handleOnline);

  // Procesar al iniciar si ya hay conexión y hay items pendientes
  procesarSyncQueue();

  // Retorna función de cleanup para usar en useEffect
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}