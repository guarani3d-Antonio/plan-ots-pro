import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('src/services/reportDraftComparison.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { borradorModificado } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const actual = { identificacion: { nombre: 'Cliente', telefono: '', direccion: 'Torre A' }, fotoIds: ['a','b'] };
const persisted = JSON.stringify({ fotoIds: ['a','b'], identificacion: { direccion: 'Torre A', telefono: '', nombre: 'Cliente' } });
assert.equal(borradorModificado(persisted, actual), false, 'jsonb key order must not block the document selector');
assert.equal(borradorModificado(persisted, {...actual, identificacion: {...actual.identificacion, nombre: 'Otro'}}), true);
assert.equal(borradorModificado(persisted, {...actual, fotoIds: ['b','a']}), true, 'photo order is a real edit');
assert.equal(borradorModificado(persisted, {...actual, identificacion: {...actual.identificacion, telefono: '123'}}), true);
assert.equal(borradorModificado(JSON.stringify({identificacion:{nombre:'Cliente'}}), actual), true, 'newly populated fields must be saved');
assert.equal(borradorModificado(null, actual), true);
console.log('PASS: unchanged JSONB, actual edits, photo order, empty values, new fields and unsaved draft');
