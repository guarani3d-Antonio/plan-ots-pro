import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const actor = '11111111-1111-4111-8111-111111111111';
const intruso = '11111111-1111-4111-8111-222222222222';
const revisor = '11111111-1111-4111-8111-333333333333';
const tenant = '22222222-2222-4222-8222-222222222222';
const proyecto = '33333333-3333-4333-8333-333333333333';
const orden = '44444444-4444-4444-8444-444444444444';
const uuid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const one = async sql => (await db.query(sql)).rows[0];
const call = async (name, args) => (await db.query(`select (public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})).*`, args)).rows[0];
const rejectsCode = async (fn, code) => {
  await assert.rejects(fn, error => {
    assert.equal(error.code, code, error.message);
    return true;
  });
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create schema storage;
    grant usage on schema auth to authenticated;
    create table storage.buckets(id text primary key, public boolean not null);
    create table storage.objects(bucket_id text not null, name text not null,
      primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    create table auth.users(id uuid primary key, email text);
    create table public.tenants(id uuid primary key, nombre text not null default 'Empresa ficticia QA', activo boolean not null default true);
    create table public.proyectos(
      id uuid primary key, tenant_id uuid not null references public.tenants(id),
      nombre text, cliente text, descripcion text,
      plano_url text not null default 'storage://planos/qa/plano.pdf',
      deleted_at timestamptz, unique(tenant_id,id));
    create table public.ordenes(
      id uuid primary key, proyecto_id uuid not null references public.proyectos(id),
      ot text not null, costo numeric, deleted_at timestamptz, unique(proyecto_id,id));
    create table public.fotos(
      id uuid primary key, orden_id uuid not null, proyecto_id uuid not null,
      categoria text not null, label text, descripcion text,
      descripcion_observacion text, anotaciones jsonb,
      edicion jsonb, revision bigint, uploaded_at timestamptz, file_path text not null);
    create table public.plan_foto_originales(
      foto_id uuid primary key references public.fotos(id),
      proyecto_id uuid not null, file_path text not null);
    create table public.plan_ot_eventos(
      id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      proyecto_id uuid not null, orden_id uuid not null, ot text not null,
      actor_id uuid, actor_email text, tipo text not null, cambios jsonb not null,
      solicitud_id uuid unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.plan_es_miembro_proyecto(uuid) returns boolean
      language sql stable as $$select auth.uid() = '${actor}'::uuid$$;
    create function public.plan_puede_editar_proyecto(uuid) returns boolean
      language sql stable as $$select auth.uid() = '${actor}'::uuid$$;
    create function public.plan_es_supervisor_proyecto(uuid) returns boolean
      language sql stable as $$select auth.uid() in ('${actor}'::uuid,'${revisor}'::uuid)$$;
    create function public.plan_es_creador() returns boolean
      language sql stable as $$select auth.uid() = '${actor}'::uuid$$;
  `);
  assert.equal((await one('select current_user as rol')).rol, 'postgres');
  assert.equal((await one("select encode(pg_catalog.sha256(convert_to('a','UTF8')),'hex') as hash")).hash.length, 64);

  for (const name of ['202609230009_document_policies.sql', '202609230010_document_identity.sql',
    '202609230011_order_service_export_audit.sql', '202609280021_visit_document.sql']) {
    const migration = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
    await db.exec(migration);
  }
  await db.query('insert into auth.users(id,email) values($1,$2)', [actor, 'creador@prueba.test']);
  await db.query('insert into auth.users(id) values($1)', [intruso]);
  await db.query('insert into auth.users(id) values($1)', [revisor]);
  await db.query('insert into public.tenants(id) values($1)', [tenant]);
  await db.query('insert into public.proyectos(id,tenant_id) values($1,$2)', [proyecto, tenant]);
  await db.query('insert into public.ordenes(id,proyecto_id,ot) values($1,$2,$3)', [orden, proyecto, 'OT-001']);
  const foto = uuid(60);
  await db.query('insert into public.fotos(id,orden_id,proyecto_id,categoria,file_path,edicion,revision) values($1,$2,$3,$4,$5,$6,$7)',
    [foto, orden, proyecto, 'ANTES', `${tenant}/${proyecto}/${orden}/original.jpg`, {}, 0]);
  await db.query('insert into public.plan_foto_originales(foto_id,proyecto_id,file_path) values($1,$2,$3)',
    [foto, proyecto, `${tenant}/${proyecto}/${orden}/original.jpg`]);
  await db.query('insert into storage.buckets(id,public) values($1,$2)', ['fotos', false]);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',
    ['fotos', `${tenant}/${proyecto}/${orden}/original.jpg`]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec('set role authenticated;');

  const reserve = (tipo, solicitud, ciclo = 1) => call('plan_documento_reservar', [orden, tipo, ciclo, solicitud]);
  const save = (doc, data, version, solicitud) => call('plan_documento_borrador_guardar', [doc, data, version, solicitud]);
  const freeze = (doc, version, motivo, solicitud) => call('plan_documento_revision_congelar', [doc, version, motivo, 1, 'plantilla-1', solicitud]);
  const decide = (estado, solicitud, autoridad = null, respaldo = null, fecha = null) =>
    db.query('select public.plan_politica_decidir($1,$2,$3,$4,$5,$6,$7,$8) as id',
      [tenant, 'firma', estado, autoridad, respaldo, null, fecha, solicitud]);
  const exportar = (tipo, solicitud) => db.query(
    'select public.plan_solicitar_exportacion($1,$2,$3,$4) as id', [orden, tipo, 'PDF', solicitud]);

  const inicial = (await db.query('select public.plan_politicas_listar($1) as modulos', [tenant])).rows[0].modulos;
  assert.equal(inicial.length, 6);
  assert.equal(inicial.find(m => m.modulo === 'firma').estado, 'pendiente');
  await rejectsCode(() => decide('aprobada', uuid(30)), '23514');
  const decision = (await decide('aprobada', uuid(31), 'BBC', 'Acta 1', '2026-09-23')).rows[0].id;
  assert.equal((await decide('aprobada', uuid(31), 'BBC', 'Acta 1', '2026-09-23')).rows[0].id, decision);
  await rejectsCode(() => decide('no_aprobada', uuid(31)), '22023');
  await decide('suspendida', uuid(32));
  const vigente = (await db.query('select public.plan_politicas_listar($1) as modulos', [tenant])).rows[0].modulos;
  assert.equal(vigente.find(m => m.modulo === 'firma').estado, 'suspendida');
  assert.equal(Number(vigente.find(m => m.modulo === 'firma').version), 2);
  const exportacion = (await exportar('orden_servicio', uuid(40))).rows[0].id;
  assert.equal((await exportar('orden_servicio', uuid(40))).rows[0].id, exportacion);
  await rejectsCode(() => exportar('relevamiento', uuid(40)), '22023');
  await rejectsCode(() => exportar('otro', uuid(41)), '22023');
  assert.ok((await exportar('visita', uuid(43))).rows[0].id);
  assert.ok((await exportar('encuesta', uuid(44))).rows[0].id);

  const os = await reserve('orden_servicio', uuid(1));
  assert.match(os.codigo, /^POT-\d{4}-OS-\d{8,}$/);
  assert.equal((await reserve('orden_servicio', uuid(1))).id, os.id);
  assert.equal((await reserve('orden_servicio', uuid(2))).id, os.id);
  await rejectsCode(() => reserve('avance', uuid(1)), '22023');
  const rel1 = await reserve('relevamiento', uuid(3));
  const rel2 = await reserve('relevamiento', uuid(4));
  assert.notEqual(rel1.id, rel2.id);
  assert.notEqual(rel1.codigo, rel2.codigo);
  const visita1 = await reserve('visita', uuid(16));
  const visita2 = await reserve('visita', uuid(17));
  assert.match(visita1.codigo, /^POT-\d{4}-VIS-\d{8,}$/);
  assert.notEqual(visita1.id, visita2.id);
  const encuesta1 = await reserve('encuesta', uuid(18));
  const encuesta2 = await reserve('encuesta', uuid(19));
  assert.match(encuesta1.codigo, /^POT-\d{4}-ENC-\d{8,}$/);
  assert.notEqual(encuesta1.id, encuesta2.id);
  assert.equal((await reserve('cierre', uuid(5))).id, (await reserve('cierre', uuid(6))).id);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [intruso]);
  await rejectsCode(() => db.query('select public.plan_politicas_listar($1)', [tenant]), '42501');
  await rejectsCode(() => decide('aprobada', uuid(33), 'BBC', 'Acta 2', '2026-09-23'), '42501');
  await rejectsCode(() => exportar('orden_servicio', uuid(42)), '42501');
  await rejectsCode(() => reserve('avance', uuid(21)), '42501');
  await rejectsCode(() => save(os.id, { observaciones: 'Intrusión' }, 0, uuid(22)), '42501');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await rejectsCode(() => db.query('insert into public.plan_documentos(tenant_id,proyecto_id,orden_id,tipo,folio,codigo,creado_por,solicitud_id) values($1,$2,$3,$4,$5,$6,$7,$8)',
    [tenant, proyecto, orden, 'avance', 900, 'FALSO', actor, uuid(20)]), '42501');

  const first = await save(os.id, { observaciones: 'Recibido' }, 0, uuid(7));
  assert.equal(Number(first.version), 1);
  assert.equal(Number((await save(os.id, { observaciones: 'Recibido' }, 0, uuid(7))).version), 1);
  await rejectsCode(() => save(os.id, { observaciones: 'Distinto' }, 0, uuid(7)), '22023');
  await rejectsCode(() => save(os.id, { observaciones: 'Tarde' }, 0, uuid(8)), '40001');
  const rev0 = await freeze(os.id, 1, null, uuid(9));
  assert.equal(rev0.revision, 0);
  await db.exec('set role postgres;');
  await db.exec(await readFile(new URL('../supabase/migrations/202609290022_document_sources.sql', import.meta.url), 'utf8'));
  try {
    await db.exec(await readFile(new URL('../supabase/migrations/202609290023_document_issue.sql', import.meta.url), 'utf8'));
  } catch (error) {
    console.error('Migración de emisión:', error.message, 'posición', error.position);
    throw new Error('Falló la migración de emisión');
  }
  await db.exec('set role authenticated;');
  assert.equal((await one(`select count(*)::int as n from public.plan_documento_fuentes where revision_id='${rev0.id}'`)).n, 0);
  await rejectsCode(() => db.query('update public.plan_documento_fuentes set fuentes=$1 where revision_id=$2',
    [{ alterado: true }, rev0.id]), '42501');
  assert.equal((await freeze(os.id, 1, null, uuid(9))).id, rev0.id);
  await rejectsCode(() => freeze(os.id, 1, null, uuid(10)), '23505');
  const second = await save(os.id, { observaciones: 'Corregido' }, 1, uuid(11));
  assert.equal(Number(second.version), 2);
  await rejectsCode(() => freeze(os.id, 2, null, uuid(12)), '22023');
  const rev1 = await freeze(os.id, 2, 'Corrección de redacción', uuid(13));
  assert.equal(rev1.revision, 1);
  assert.notEqual(rev0.contenido_sha256, rev1.contenido_sha256);
  const fuente1 = await one(`select fuentes,fuentes_sha256 from public.plan_documento_fuentes where revision_id='${rev1.id}'`);
  assert.equal(fuente1.fuentes.revision.datos_sha256, rev1.contenido_sha256);
  assert.equal(fuente1.fuentes.orden.ot, 'OT-001');
  assert.equal(fuente1.fuentes.fotos.length, 0);
  assert.equal(fuente1.fuentes_sha256.length, 64);
  const preparado = await call('plan_documento_preparar', [rev1.id, uuid(70)]);
  assert.equal(preparado.estado, 'preparando');
  assert.equal((await call('plan_documento_preparar', [rev1.id, uuid(70)])).id, preparado.id);
  await rejectsCode(() => call('plan_documento_preparar', [rev0.id, uuid(71)]), '22023');
  const tokenRender = uuid(81);
  await rejectsCode(() => db.query('select public.plan_documento_render_reclamar($1,$2)',
    [preparado.id, tokenRender]), '42501');
  await rejectsCode(() => call('plan_documento_pdf_listo', [preparado.id, tokenRender,
    'falso', 'a'.repeat(64), 500, []]), '42501');
  const pdfHash = 'a'.repeat(64);
  const pdfPath = `${tenant}/${proyecto}/documentos/${rev1.id}/${pdfHash}.pdf`;
  await db.exec('set role postgres;');
  await db.query('insert into storage.buckets(id,public) values($1,$2)', ['exports', false]);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['exports', pdfPath]);
  await db.exec('set role service_role;');
  assert.equal((await db.query('select public.plan_documento_render_reclamar($1,$2) as ok',
    [preparado.id, tokenRender])).rows[0].ok, true);
  assert.equal((await db.query('select public.plan_documento_render_reclamar($1,$2) as ok',
    [preparado.id, uuid(83)])).rows[0].ok, false);
  await rejectsCode(() => call('plan_documento_pdf_listo', [preparado.id,
    tokenRender, pdfPath, pdfHash, 500, null]), '22023');
  const listo = await call('plan_documento_pdf_listo', [preparado.id,
    tokenRender, pdfPath, pdfHash, 500, []]);
  assert.equal(listo.estado, 'listo');
  assert.deepEqual(listo.fuentes_binarias, []);
  assert.equal((await call('plan_documento_pdf_listo', [preparado.id,
    tokenRender, pdfPath, pdfHash, 500, []])).id, listo.id);
  await rejectsCode(() => call('plan_documento_pdf_listo', [preparado.id,
    tokenRender, pdfPath, 'b'.repeat(64), 500, []]), '22023');
  await db.exec('set role authenticated;');
  await rejectsCode(() => call('plan_documento_revisar_pdf', [preparado.id, pdfHash, 'aprobado', null, uuid(72)]), '42501');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [revisor]);
  await rejectsCode(() => call('plan_documento_revisar_pdf', [preparado.id, 'b'.repeat(64), 'aprobado', null, uuid(73)]), '40001');
  const aprobado = await call('plan_documento_revisar_pdf', [preparado.id, pdfHash, 'aprobado', null, uuid(74)]);
  assert.equal((await call('plan_documento_revisar_pdf', [preparado.id, pdfHash, 'aprobado', null, uuid(74)])).id, aprobado.id);
  await rejectsCode(() => call('plan_documento_emitir', [preparado.id, uuid(75)]), '22023');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  for (const [index, modulo] of ['identidad', 'revision', 'conservacion'].entries()) {
    await db.query('select public.plan_politica_decidir($1,$2,$3,$4,$5,$6,$7,$8)',
      [tenant, modulo, 'aprobada', 'BBC', 'Procedimiento de prueba', null, '2026-09-23', uuid(76 + index)]);
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [revisor]);
  const emitido = await call('plan_documento_emitir', [preparado.id, uuid(79)]);
  assert.equal(emitido.pdf_sha256, pdfHash);
  assert.deepEqual(emitido.fuentes_binarias, []);
  assert.ok(emitido.politicas.identidad && emitido.politicas.revision && emitido.politicas.conservacion);
  assert.equal((await call('plan_documento_emitir', [preparado.id, uuid(79)])).id, emitido.id);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  const luegoDeEmitir = await save(os.id, { observaciones: 'Intento posterior' }, 2, uuid(85));
  await rejectsCode(() => freeze(os.id, luegoDeEmitir.version, 'Cambio posterior', uuid(86)), '42501');
  await db.exec('set role postgres;');
  await rejectsCode(() => db.query('update public.plan_documento_fuentes set fuentes=$1 where revision_id=$2',
    [{ alterado: true }, rev1.id]), '42501');
  await rejectsCode(() => db.query('delete from public.plan_documento_aprobaciones where id=$1',
    [aprobado.id]), '42501');
  await rejectsCode(() => db.query('delete from public.plan_documento_emisiones where id=$1',
    [emitido.id]), '42501');
  await db.exec('set role authenticated;');
  await db.exec('set role postgres;');
  await db.query('update public.ordenes set costo=123456 where id=$1', [orden]);
  await db.exec('set role authenticated;');
  const visita = await save(visita1.id, { fotoIds: [foto], observaciones: 'Visita' }, 0, uuid(61));
  const revisionVisita = await freeze(visita1.id, visita.version, null, uuid(62));
  const fuenteVisita = await one(`select fuentes from public.plan_documento_fuentes where revision_id='${revisionVisita.id}'`);
  assert.equal(fuenteVisita.fuentes.fotos[0].id, foto);
  assert.equal(fuenteVisita.fuentes.fotos[0].original_path, `${tenant}/${proyecto}/${orden}/original.jpg`);
  assert.equal('costo' in fuenteVisita.fuentes.orden, false);
  assert.equal((await one(`select public.plan_documento_foto_referida('${tenant}/${proyecto}/${orden}/original.jpg') as protegida`)).protegida, true);
  assert.equal((await one("select public.plan_documento_foto_referida('otra-foto.jpg') as protegida")).protegida, false);
  const candidatoVisita = await call('plan_documento_preparar', [revisionVisita.id, uuid(82)]);
  const tokenVisita = uuid(84);
  const fotoHash = 'd'.repeat(64);
  const fotoOrigen = `${tenant}/${proyecto}/${orden}/original.jpg`;
  const fotoBase = `${tenant}/${proyecto}/documentos/${revisionVisita.id}/fotos/${foto}`;
  const fotoManifiesto = [{ id: foto,
    original: { fuente_path: fotoOrigen, path: `${fotoBase}/original/${fotoHash}`,
      sha256: fotoHash, bytes: 1000 },
    edicion: { fuente_path: fotoOrigen, path: `${fotoBase}/edicion/${fotoHash}`,
      sha256: fotoHash, bytes: 1000 } }];
  const pdfVisitaHash = 'e'.repeat(64);
  const pdfVisitaPath = `${tenant}/${proyecto}/documentos/${revisionVisita.id}/${pdfVisitaHash}.pdf`;
  await db.exec('set role postgres;');
  for (const name of [fotoManifiesto[0].original.path,
    fotoManifiesto[0].edicion.path, pdfVisitaPath])
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['exports', name]);
  await db.exec('set role service_role;');
  assert.equal((await db.query('select public.plan_documento_render_reclamar($1,$2) as ok',
    [candidatoVisita.id, tokenVisita])).rows[0].ok, true);
  await rejectsCode(() => call('plan_documento_pdf_listo', [candidatoVisita.id,
    tokenVisita, pdfVisitaPath, pdfVisitaHash, 700, [{ ...fotoManifiesto[0],
      original: { ...fotoManifiesto[0].original, fuente_path: 'ajena.jpg' } }]]), '22023');
  const visitaLista = await call('plan_documento_pdf_listo',
    [candidatoVisita.id, tokenVisita, pdfVisitaPath, pdfVisitaHash, 700, fotoManifiesto]);
  assert.deepEqual(visitaLista.fuentes_binarias, fotoManifiesto);
  await db.exec('set role authenticated;');
  const fotoSinBinario = uuid(68);
  await db.exec('set role postgres;');
  await db.query('insert into public.fotos(id,orden_id,proyecto_id,categoria,file_path,edicion,revision) values($1,$2,$3,$4,$5,$6,$7)',
    [fotoSinBinario, orden, proyecto, 'ANTES', `${tenant}/${proyecto}/${orden}/falta.jpg`, {}, 0]);
  await db.query('insert into public.plan_foto_originales(foto_id,proyecto_id,file_path) values($1,$2,$3)',
    [fotoSinBinario, proyecto, `${tenant}/${proyecto}/${orden}/falta.jpg`]);
  await db.exec('set role authenticated;');
  const sinBinario = await save(rel2.id, { fotoIds: [fotoSinBinario] }, 0, uuid(69));
  await rejectsCode(() => freeze(rel2.id, sinBinario.version, null, uuid(80)), '22023');
  const incorrecto = await save(visita2.id, { fotoIds: [uuid(63)] }, 0, uuid(64));
  await rejectsCode(() => freeze(visita2.id, incorrecto.version, null, uuid(65)), '42501');
  assert.equal((await one(`select count(*)::int as n from public.plan_documento_revisiones where documento_id='${visita2.id}'`)).n, 0);
  const repetido = await save(rel1.id, { fotoIds: [foto, foto] }, 0, uuid(66));
  await rejectsCode(() => freeze(rel1.id, repetido.version, null, uuid(67)), '22023');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [intruso]);
  assert.equal((await one(`select count(*)::int as n from public.plan_documento_fuentes where revision_id='${revisionVisita.id}'`)).n, 0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await rejectsCode(() => db.query('update public.plan_documento_revisiones set motivo=$1 where id=$2', ['Alterado', rev0.id]), '42501');
  const persisted = await one(`select datos->>'observaciones' as texto from public.plan_documento_revisiones where id='${rev0.id}'`);
  assert.equal(persisted.texto, 'Recibido');
  await db.exec('set role postgres;');
  await db.query("select setval('public.plan_documento_folio_seq',99999999,false)");
  await db.exec('set role authenticated;');
  const largo = await reserve('avance', uuid(14));
  assert.match(largo.codigo, /-99999999$/);
  const mayor = await reserve('avance', uuid(15));
  assert.match(mayor.codigo, /-100000000$/);
  assert.notEqual(largo.codigo, mayor.codigo);
  // La regla de piloto aprobada restringe la decision al Creador en el servidor.
  await db.exec('set role postgres;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610040025_pilot_document_review.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202610040026_document_issuer_snapshot.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202610070001_document_plan_location.sql', import.meta.url), 'utf8'));
  await db.exec(`create or replace function public.plan_es_creador() returns boolean
    language sql stable as $$select auth.uid() = '${revisor}'::uuid$$;`);
  await db.exec('set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await rejectsCode(() => call('plan_documento_revisar_pdf', [visitaLista.id, pdfVisitaHash, 'aprobado', null, uuid(101)]), '42501');
  await rejectsCode(() => call('plan_documento_emitir', [visitaLista.id, uuid(102)]), '42501');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [revisor]);
  await call('plan_documento_revisar_pdf', [visitaLista.id, pdfVisitaHash, 'aprobado', null, uuid(103)]);
  const emisionPiloto = await call('plan_documento_emitir', [visitaLista.id, uuid(104)]);
  assert.equal(emisionPiloto.emitido_por, revisor);
  assert.equal((await call('plan_documento_emitir', [visitaLista.id, uuid(104)])).id, emisionPiloto.id);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  const pendiente = await reserve('cierre', uuid(105));
  const pendienteDraft = await save(pendiente.id, {fotoIds: [], observaciones: 'Original'}, 0, uuid(106));
  const pendienteRevision = await freeze(pendiente.id, pendienteDraft.version, null, uuid(107));
  assert.equal((await one(`select fuentes->'empresa'->>'nombre' as nombre from public.plan_documento_fuentes where revision_id='${pendienteRevision.id}'`)).nombre,'Empresa ficticia QA');
  const fuentePlano = await one(`select fuentes->'proyecto'->>'plano_url' as plano_url from public.plan_documento_fuentes where revision_id='${pendienteRevision.id}'`);
  assert.equal(fuentePlano.plano_url, 'storage://planos/qa/plano.pdf');
  const pendientePdf = await call('plan_documento_preparar', [pendienteRevision.id, uuid(108)]);
  const pendientePath = `${tenant}/${proyecto}/documentos/${pendienteRevision.id}/${pdfHash}.pdf`;
  await db.exec('set role postgres;');
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['exports', pendientePath]);
  await db.exec('set role service_role;');
  await db.query('select public.plan_documento_render_reclamar($1,$2)', [pendientePdf.id, uuid(109)]);
  await call('plan_documento_pdf_listo', [pendientePdf.id, uuid(109), pendientePath, pdfHash, 700, []]);
  await db.exec('set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [revisor]);
  await call('plan_documento_revisar_pdf', [pendientePdf.id, pdfHash, 'aprobado', null, uuid(110)]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await save(pendiente.id, {fotoIds: [], observaciones: 'Correccion posterior'}, pendienteDraft.version, uuid(111));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [revisor]);
  await rejectsCode(() => call('plan_documento_emitir', [pendientePdf.id, uuid(112)]), '40001');

  // New rollout: additional closing events and corrected issued revisions.
  await db.exec('set role postgres;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610080001_ot_document_stages.sql', import.meta.url), 'utf8'));
  await db.exec('set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
  const otherClose=await reserve('cierre',uuid(120));
  assert.notEqual(otherClose.id,pendiente.id);
  assert.notEqual(otherClose.codigo,pendiente.codigo);
  assert.equal((await reserve('orden_servicio',uuid(121))).id,os.id);
  const correction=await save(os.id,{fotoIds:[],observaciones:'Corrected issued OS'},luegoDeEmitir.version,uuid(122));
  await rejectsCode(()=>freeze(os.id,correction.version,null,uuid(123)),'22023');
  const correctedRev=await freeze(os.id,correction.version,'Correction QA, original preserved',uuid(124));
  assert.ok(correctedRev.revision>rev1.revision);
  const correctedCandidate=await call('plan_documento_preparar',[correctedRev.id,uuid(125)]);
  const correctedPath=`${tenant}/${proyecto}/documentos/${correctedRev.id}/${pdfHash}.pdf`;
  await db.exec('set role postgres;');
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['exports',correctedPath]);
  await db.exec('set role service_role;');
  await db.query('select public.plan_documento_render_reclamar($1,$2)',[correctedCandidate.id,uuid(126)]);
  await call('plan_documento_pdf_listo',[correctedCandidate.id,uuid(126),correctedPath,pdfHash,700,[]]);
  await db.exec('set role authenticated;');
  await rejectsCode(()=>call('plan_documento_emitir',[correctedCandidate.id,uuid(127)]),'42501');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[revisor]);
  await rejectsCode(()=>call('plan_documento_emitir',[correctedCandidate.id,uuid(128)]),'22023');
  await call('plan_documento_revisar_pdf',[correctedCandidate.id,pdfHash,'aprobado',null,uuid(129)]);
  const secondEmission=await call('plan_documento_emitir',[correctedCandidate.id,uuid(130)]);
  assert.notEqual(secondEmission.id,emitido.id);
  assert.equal((await call('plan_documento_emitir',[correctedCandidate.id,uuid(130)])).id,secondEmission.id);
  await db.exec('set role postgres;');
  assert.equal((await one(`select count(*)::int as n from public.plan_documento_emisiones where documento_id='${os.id}'`)).n,2);
  assert.equal((await one(`select pdf_path from public.plan_documento_emisiones where id='${emitido.id}'`)).pdf_path,emitido.pdf_path);
  await rejectsCode(()=>db.query('delete from public.plan_documento_emisiones where id=$1',[emitido.id]),'42501');
  await rejectsCode(()=>db.query('update public.plan_documento_revisiones set motivo=$1 where id=$2',['overwrite',rev1.id]),'42501');
  await db.exec('set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[intruso]);
  await rejectsCode(()=>reserve('cierre',uuid(131)),'42501');
  console.log('Corrected issued revisions retain prior PDF; new approval mandatory; closing events and permissions: OK');
  console.log('Expediente: identidad, fuentes, doble persona, emision exclusiva del Creador y bloqueo de borrador posterior OK');
} finally {
  await db.close();
}
