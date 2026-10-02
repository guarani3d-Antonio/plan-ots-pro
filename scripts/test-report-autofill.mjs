import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Module, createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = process.argv[2] ?? '.';
const cache = new Map();
function load(path) {
  const abs = resolve(path); if(cache.has(abs))return cache.get(abs).exports;
  const mod = new Module(abs); cache.set(abs,mod);
  mod.require = id => id.startsWith('.') ? load(resolve(dirname(abs), `${id}.ts`)) : require(id);
  mod._compile(ts.transpileModule(readFileSync(abs,'utf8'), { compilerOptions: {
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText, abs); return mod.exports;
}
const { prepararAutocompletado, restaurarCampos, ordenParaInforme } = load(`${root}/src/services/reportAutofillService.ts`);
const report = load(`${root}/src/services/reportService.ts`);
const nota = '  Texto literal: ñ, & < > "\nSegunda línea\n' + 'contenido sin recortar '.repeat(120);
const orden = { id:'ot', proyecto_id:'p', ot:'OT-QA', estado:'Cerrada', prioridad:'Media',
  obra:'Torre ejemplo', unidad_amenities:'Dpto 12', ubicacion:'Baño de la unidad',
  rubro:'Plomería', responsable:'Responsable de prueba', descripcion:'Reclamo original exacto & completo',
  comentarios:nota, fecha_ingreso:'2026-10-01', fecha_inicio_trabajos:'2026-10-01T08:05',
  fecha_fin_trabajos:'2026-10-02T11:45', porcentaje_avance:0, cliente_id:'c',cliente_ubicacion_id:'u',
  campos:{ solicitante:'Solicitante original',contacto_solicitante:'0981 123 456',canal_solicitud:'Teléfono',fecha_solicitud:'2026-10-01T07:30' } };
const original = structuredClone(orden);
const cliente = { cliente_id:'c',ubicacion_id:'u',nombre:'Cliente de prueba',telefono:'0981 999 999',
  domicilio:'Domicilio exacto',correo:'cliente@example.test',identificacion:'RUC de prueba',piso:'12' };
const fuentes = {
  visita:{visita:{fechaVisita:'2026-10-01',responsableVisita:'Visitante de prueba',observacionesTecnicas:nota,restricciones:'Sin acceso a techo'}},
  relevamiento:{relevamiento:{planoReferencia:'Plano P-1'}, itemsAlcance:[{id:'A-01',trabajo:'Trabajo exacto',criterio:'Criterio exacto'}]},
  cierre:{cierre:{ejecucionPorItem:'Trabajo ejecutado declarado',entregables:'Manual de operación'}},
};
const p = prepararAutocompletado(orden,'Proyecto',cliente,fuentes);
assert.equal(p.observaciones,nota);
assert.equal(p.visita.observacionesTecnicas,nota);
assert.equal(p.relevamiento.hallazgos,nota);
assert.equal(p.cierre.inicioReal,orden.fecha_inicio_trabajos);
assert.equal(p.cierre.finReal,orden.fecha_fin_trabajos);
assert.equal(p.origen.solicitante,orden.campos.solicitante);
assert.equal(p.origen.contacto,orden.campos.contacto_solicitante);
assert.equal(p.avance.porcentaje,'0');
assert.equal(p.relevamiento.tecnico,'Visitante de prueba');
assert.equal(p.cierre.planoReferencia,'Plano P-1');
assert.equal(p.itemsCierre[0].resultado,'');
assert.equal(p.itemsCierre[0].criterio,'Criterio exacto');
assert.equal(p.acta.objetoEntrega,'Trabajo ejecutado declarado');
assert.equal(p.acta.decisionPreparada,undefined);
assert.equal(p.encuesta.resolucion,undefined);
assert.equal(p.cierre.verificacion,undefined);
assert.equal(p.cierre.alcanceReferencia,'');
console.log('PASS: fuentes exactas de OT, cliente y documentos; sin inventar verificaciones ni aceptación');
const otro = prepararAutocompletado(orden,'Proyecto',{...cliente,ubicacion_id:'otra'});
assert.equal(otro.identificacion.domicilio,'');
assert.equal(otro.identificacion.telefono,'');
const sinCliente = prepararAutocompletado({...orden,cliente_id:null,cliente_ubicacion_id:null},'Proyecto',cliente);
assert.equal(sinCliente.identificacion.domicilio,'');
console.log('PASS: no se mezclan ubicaciones del cliente ni clientes no vinculados');
const editado = restaurarCampos(p.identificacion,{cliente:'Nombre revisado',domicilio:'',descripcion:nota});
assert.equal(editado.cliente,'Nombre revisado');
assert.equal(editado.domicilio,'');
assert.equal(editado.descripcion,nota);
const salida = ordenParaInforme(orden,editado);
assert.deepEqual(orden,original);
assert.equal(salida.descripcion,nota);
assert.equal(salida.campos.identificacion_informe.cliente,'Nombre revisado');
assert.equal(orden.campos.identificacion_informe,undefined);
console.log('PASS: borrador conserva ediciones, vacíos intencionales y texto largo; OT original intacta');
const o = ordenParaInforme(orden,p.identificacion);
const cases = {
  orden_servicio: report.generarInformeOrdenServicio(o,'',p.origen),
  visita: report.generarFichaVisita(o,p.visita),
  relevamiento: report.generarInformeRelevamiento(o,p.observaciones,[],p.relevamiento),
  avance: report.generarInformeAvance(o,p.observaciones,[],[],p.avance,undefined,p.itemsAvance),
  cierre: report.generarInformeCierre(o,'Proyecto',p.observaciones,[],[],p.cierre,undefined,p.itemsCierre),
  acta: report.generarInformeActaConformidad(o,p.acta),
  encuesta: report.generarEncuestaSatisfaccion(o,p.encuesta),
};
const escaped = nota.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const [tipo,html] of Object.entries(cases)) {
  for(const value of ['Torre ejemplo','Dpto 12','Cliente de prueba','Domicilio exacto','0981 999 999'])
    assert.ok(html.includes(value),`${tipo}: falta ${value}`);
  if(['visita','relevamiento','avance','cierre'].includes(tipo)) assert.ok(html.includes(escaped),`${tipo}: texto recortado o alterado`);
  console.log(`PASS: ${tipo} incluye identificación y contenido heredado`);
}
