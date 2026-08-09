import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { OrdenLocal } from '../types/orden';

export type { OrdenLocal };

export interface ProyectoLocal {
  id: string;
  nombre: string;
  cliente?: string;
  descripcion?: string | null
  plano_url?: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _last_fetched: number;
}

export interface CampoDefinicionLocal {
  id: string;
  proyecto_id: string;
  nombre: string;
  tipo: string;
  obligatorio: boolean;
  opciones: string[] | null;
  formula: string | null;
  orden: number;
  created_at: string;
  _synced: boolean;
}

export interface SyncQueueItem {
  id?: number;
  tipo: string;
  payload: unknown;
  created_at: string;
  intentos: number;
}

/**
 * B2 — Foto capturada offline. El binario vive acá; la syncQueue guarda solo
 * la referencia (fotoPendienteId), nunca el Blob.
 * Al tercer intento fallido NO se borra: pasa a estadoSync 'ERROR' y el binario
 * se conserva para reintento manual desde la UI.
 */
export interface FotoPendiente {
  id?:          number;
  orden_id:     string;
  proyecto_id:  string;
  // Mantener en sincronía con CategoriaFoto de src/services/fotosService.ts:4
  categoria:    'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO';
  blob:         Blob;
  nombre:       string;
  descripcion?: string;   // capturada en el modal offline; cómo se escribe al subir → Fase 3
  file_type:    string;   // MIME crudo (file.type) — el mapeo a 'imagen'/'video'/'pdf' lo hace registrarFotoEnDB
  size:         number;
  estadoSync:   'PENDIENTE' | 'SUBIENDO' | 'COMPLETADO' | 'ERROR';
  intentos:     number;
  created_at:   string;
  ultimo_error?: string;
  // B2 Fase 3 — Momento en que una pasada del SyncManager reclamó esta foto para
  // subirla. Una pestaña que muere a mitad de subida deja el registro en SUBIENDO
  // para siempre y su item SIGUE en la cola, así que el barrido de huérfanos no
  // lo ve; pasado LEASE_SUBIENDO_MS otra pasada puede robarlo.
  // Campo no indexado: no requiere subir la versión del esquema.
  subiendo_desde?: string;
  // Path en Storage cuando el archivo YA se subió pero falló el insert en `fotos`.
  // Evita que el reintento suba un segundo archivo y deje el primero huérfano.
  // Declarado en B2-Fase 2, todavía sin escritor — lo usa la Fase 3.
  storage_path?: string;
  fotoId?:      string;   // id de la fila en `fotos` de Supabase, una vez registrada (idempotencia del retry)
}

class PlanOTsDB extends Dexie {
  proyectos!: Table<ProyectoLocal>;
  ordenes!: Table<OrdenLocal>;
  camposDefinicion!: Table<CampoDefinicionLocal>;
  syncQueue!: Table<SyncQueueItem>;
  fotosPendientes!: Table<FotoPendiente, number>;

  constructor() {
    super('PlanOTsDB');
    this.version(4).stores({
      proyectos:        'id, nombre, _synced',
      ordenes:          'id, proyecto_id, ot, estado, _synced',
      camposDefinicion: 'id, proyecto_id, orden, _synced',
      syncQueue:        '++id, tipo, created_at',
    });
    // v5: agrega índice nivel_riesgo en ordenes para filtros por riesgo.
    this.version(5).stores({
      proyectos:        'id, nombre, _synced',
      ordenes:          'id, proyecto_id, ot, estado, nivel_riesgo, _synced',
      camposDefinicion: 'id, proyecto_id, orden, _synced',
      syncQueue:        '++id, tipo, created_at',
    });
    // v6 (B2): tabla fotosPendientes para el binario de fotos capturadas offline.
    // No toca ninguna tabla existente — la migración v5→v6 solo crea la tabla nueva.
    this.version(6).stores({
      proyectos:        'id, nombre, _synced',
      ordenes:          'id, proyecto_id, ot, estado, nivel_riesgo, _synced',
      camposDefinicion: 'id, proyecto_id, orden, _synced',
      syncQueue:        '++id, tipo, created_at',
      fotosPendientes:  '++id, orden_id, categoria, estadoSync, created_at',
    });
  }
}

export const db = new PlanOTsDB();