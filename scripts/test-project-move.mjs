import assert from 'node:assert/strict';
import { errorDestinoMovimiento, restriccionesCarpeta } from '../src/utils/moverElementosProyecto.ts';

const carpetas = [
  { id: 'a', tenant_id: 'empresa-1', padre_id: null, profundidad: 1 },
  { id: 'b', tenant_id: 'empresa-1', padre_id: 'a', profundidad: 2 },
  { id: 'c', tenant_id: 'empresa-1', padre_id: 'b', profundidad: 3 },
  { id: 'd', tenant_id: 'empresa-1', padre_id: 'c', profundidad: 4 },
  { id: 'e', tenant_id: 'empresa-1', padre_id: 'd', profundidad: 5 },
  { id: 'otra', tenant_id: 'empresa-1', padre_id: null, profundidad: 1 },
  { id: 'ajena', tenant_id: 'empresa-2', padre_id: null, profundidad: 1 },
];
const proyecto = { tipo: 'proyecto', id: 'plano', tenant_id: 'empresa-1', nombre: 'Plano', origen: null };
const carpeta = { tipo: 'carpeta', id: 'b', tenant_id: 'empresa-1', nombre: 'Subcarpeta', origen: 'a' };
assert.equal(errorDestinoMovimiento(proyecto, 'a', carpetas), null);
assert.equal(errorDestinoMovimiento(proyecto, 'e', carpetas), null); // Un proyecto no añade niveles de carpetas.
assert.match(errorDestinoMovimiento(proyecto, 'ajena', carpetas), /misma empresa/);
assert.match(errorDestinoMovimiento(proyecto, 'inexistente', carpetas), /disponible/);
assert.match(errorDestinoMovimiento(proyecto, null, carpetas), /ya está/);
assert.match(errorDestinoMovimiento({ ...proyecto, tenant_id: '' }, 'a', carpetas), /vinculado/);
assert.match(errorDestinoMovimiento(carpeta, 'b', carpetas), /sí misma/);
assert.match(errorDestinoMovimiento(carpeta, 'e', carpetas), /subcarpetas/);
assert.match(errorDestinoMovimiento({ ...carpeta, id: 'otra', origen: null }, 'e', carpetas), /cinco niveles/);
assert.equal(errorDestinoMovimiento(carpeta, 'otra', carpetas), null); // Rama de cuatro niveles + destino de uno.
assert.equal(errorDestinoMovimiento(carpeta, null, carpetas), null);
assert.equal(restriccionesCarpeta(carpetas, 'b').altura, 4);
assert.deepEqual([...restriccionesCarpeta(carpetas, 'b').prohibidos].sort(), ['b', 'c', 'd', 'e']);
assert.equal(restriccionesCarpeta([
  { id: 'x', padre_id: 'y', profundidad: 1 }, { id: 'y', padre_id: 'x', profundidad: 2 },
], 'x').altura, 2); // La lectura termina incluso ante datos corruptos con ciclos.
console.log('OK: destino, empresa, profundidad, descendientes, raíz y datos inválidos.');
