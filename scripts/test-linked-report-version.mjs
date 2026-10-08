import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {materializarHtmlControlado as anterior} from '../supabase/functions/_shared/controlled-report-20261008.mjs';
import {materializarHtmlControlado as actual,PLANTILLA_CONTROLADA_VERSION} from '../supabase/functions/_shared/controlled-report.mjs';
const frozen=await readFile(new URL('../supabase/functions/_shared/controlled-report-20261008.mjs',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(frozen.replace(/\r\n/g,'\n')).digest('hex'),'f3863317b756fbf6dd21026aabbd1ad164813d73e3679acec9ad032a0d51c998','La plantilla previamente publicada debe conservarse');
const orden={id:'ot',proyecto_id:'plan',ot:'OT-QA',estado:'Pendiente',prioridad:'Media',obra:'Obra QA',rubro:'RUBRO INTERNO QA',responsable:'SUPERVISOR INTERNO QA',descripcion:'Pedido del cliente QA',campos:{},pos_x:null,pos_y:null};
function html(render,version){const revision={id:'rev',documento_id:'doc',revision:0,contenido_sha256:'a'.repeat(64),plantilla_version:version,datos:{incluirFotos:false,observaciones:'',origen:{}}};const fuentes={version:1,empresa:{id:'tenant',nombre:'Emisor QA'},documento:{id:'doc',codigo:'POT-2026-OS-00000001',tipo:'orden_servicio',orden_id:'ot',proyecto_id:'plan',tenant_id:'tenant'},revision:{id:'rev',numero:0,datos_sha256:revision.contenido_sha256,plantilla_version:version},orden,proyecto:{id:'plan',tenant_id:'tenant',nombre:'Plano QA'},fotos:[]};return render(revision,fuentes,{})}
const nuevo=html(actual,PLANTILLA_CONTROLADA_VERSION),previo=html(anterior,'expediente-controlado-2026-10-08');
assert.match(nuevo,/Pedido del cliente QA/);assert.doesNotMatch(nuevo,/RUBRO INTERNO QA|SUPERVISOR INTERNO QA|Clasificación y seguimiento/);assert.match(previo,/RUBRO INTERNO QA/);assert.match(previo,/SUPERVISOR INTERNO QA/);
console.log('Orden de Servicio separada de gestión interna; plantilla anterior conservada: OK');

