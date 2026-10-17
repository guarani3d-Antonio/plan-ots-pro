import assert from 'node:assert/strict';
import {empresaDelDirectorio,puedeVerDirectorio,unirObrasDirectorio} from '../src/services/directoryNavigationModel.ts';
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
console.log('PASS Directorio: empresa única, selección explícita, permisos por empresa y unión de obras sin pérdida.');
