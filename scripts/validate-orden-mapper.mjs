import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'data', 'ordenMapper.ts');
const source = await readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { ordenPatchToRow, ordenToRow, rowToOrden } = await import(moduleUrl);

const baseRow = {
  id: '00000000-0000-4000-8000-000000000001',
  proyecto_id: '00000000-0000-4000-8000-000000000002',
  ot: 'OT-001',
  ubicacion: 'Nivel 1',
  comentarios: 'comentario independiente',
  descripcion: 'descripción independiente',
  estado: 'Pendiente',
  prioridad: 'Media',
  responsable: '',
  rubro: 'Arquitectura',
  pos_x: null,
  pos_y: null,
  plano_ref_url: '',
  campos: { prueba: 0 },
  conflict_flag: false,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z',
  costo: 0,
  porcentaje_avance: 0,
  en_garantia: false,
};

const local = rowToOrden(baseRow, 1234);
assert.equal(local.pos_x, null, 'Una OT sin ubicar no debe convertirse en (0,0).');
assert.equal(local.pos_y, null, 'Una OT sin ubicar no debe convertirse en (0,0).');
assert.equal(local.comentarios, 'comentario independiente');
assert.equal(local.descripcion, 'descripción independiente');
assert.equal(local.costo, 0);
assert.equal(local._last_fetched, 1234);

const insert = ordenToRow(local);
assert.equal(insert.comentarios, 'comentario independiente');
assert.equal(insert.descripcion, 'descripción independiente');
assert.equal(insert.pos_x, null);
assert.equal(insert.costo, 0);
assert.equal('_synced' in insert, false, 'Los metadatos locales no deben salir a Supabase.');

const patch = ordenPatchToRow({
  costo: 0,
  en_garantia: false,
  descripcion: undefined,
  comentarios: '',
}, {
  updated_at: '2026-09-20T01:00:00.000Z',
  updated_by: null,
});
assert.deepEqual(patch, {
  updated_at: '2026-09-20T01:00:00.000Z',
  updated_by: null,
  comentarios: '',
  en_garantia: false,
  costo: 0,
});

console.log('OK: mapper canónico conserva campos, null, cero, false y updates parciales.');
