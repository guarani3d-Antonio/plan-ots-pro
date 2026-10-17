import assert from 'node:assert/strict';
import {empresaDelDirectorio,puedeVerDirectorio,unirObrasDirectorio,iniciarHistorialDirectorio,visitarDirectorio,recorrerDirectorio} from '../src/services/directoryNavigationModel.ts';
const empresa=(id,permisos=[])=>({id,nombre:id,rol:'tecnico',puede_crear:false,permisos});
const cuenta={creador:false,empresas:[empresa('a',['cliente.ver','equipo.ver'])],obras:[]};
assert.equal(empresaDelDirectorio(cuenta,''),'a');
assert.equal(empresaDelDirectorio(cuenta,'empresa-ajena'),'a');
assert.equal(puedeVerDirectorio(cuenta,'a','clientes'),true);
assert.equal(puedeVerDirectorio(cuenta,'a','responsables'),true);
assert.equal(puedeVerDirectorio(cuenta,'a','contratistas'),false);
assert.equal(puedeVerDirectorio(cuenta,'empresa-ajena','clientes'),false);
const multi={...cuenta,empresas:[...cuenta.empresas,empresa('b',['contratista.ver'])]};
assert.equal(empresaDelDirectorio(multi,''),''); // No asumir una empresa arbitraria.
assert.equal(empresaDelDirectorio(multi,'b'),'b');
assert.equal(puedeVerDirectorio(multi,'a','contratistas'),false);
assert.equal(puedeVerDirectorio(multi,'b','contratistas'),true);
const creador={...multi,creador:true};
assert.equal(empresaDelDirectorio(creador,''),'');
assert.equal(empresaDelDirectorio(creador,'a'),'a');
assert.equal(puedeVerDirectorio(creador,'a','contactos'),true);
assert.equal(puedeVerDirectorio(creador,'ajena','contactos'),false);
assert.equal(puedeVerDirectorio(null),false);
const previas=[['obra-a','Edificio A']],nuevas=[['obra-b','Casa B']];
assert.deepEqual(unirObrasDirectorio(previas,nuevas,previas),[['obra-b','Casa B'],['obra-a','Edificio A']]);
assert.deepEqual(previas,[['obra-a','Edificio A']]);
assert.deepEqual(unirObrasDirectorio(previas,[]),previas); // Una categoría sin registros no pierde la obra previa.
const inicio=iniciarHistorialDirectorio();
assert.strictEqual(recorrerDirectorio(inicio,-1),inicio);
let historial=visitarDirectorio(inicio,'clientes');
assert.strictEqual(visitarDirectorio(historial,'clientes'),historial);
assert.strictEqual(recorrerDirectorio(historial,1),historial);
historial=recorrerDirectorio(historial,-1);
assert.equal(historial.entradas[historial.indice],null);
assert.equal(recorrerDirectorio(historial,1).entradas[1],'clientes');
historial=visitarDirectorio(historial,'contratistas');
assert.deepEqual(historial.entradas,[null,'contratistas']); // Nueva visita descarta el camino hacia adelante.
assert.deepEqual(inicio,{entradas:[null],indice:0}); // No mutar estados anteriores.
const directo=iniciarHistorialDirectorio('responsables');
assert.equal(recorrerDirectorio(directo,-1).entradas[0],null);
assert.equal(directo.indice,1);
console.log('PASS Directorio: permisos, empresa y obras; atrás/adelante, límites, visita directa e historial sin mutaciones.');
