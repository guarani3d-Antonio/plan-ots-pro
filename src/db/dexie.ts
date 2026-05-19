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

class PlanOTsDB extends Dexie {
  proyectos!: Table<ProyectoLocal>;
  ordenes!: Table<OrdenLocal>;
  camposDefinicion!: Table<CampoDefinicionLocal>;
  syncQueue!: Table<SyncQueueItem>;

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
  }
}

export const db = new PlanOTsDB();