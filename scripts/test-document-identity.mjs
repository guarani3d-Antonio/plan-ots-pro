import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const actor = '11111111-1111-4111-8111-111111111111';
const intruso = '11111111-1111-4111-8111-222222222222';
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
    create role anon; create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table public.tenants(id uuid primary key);
    create table public.proyectos(
      id uuid primary key, tenant_id uuid not null references public.tenants(id),
      deleted_at timestamptz, unique(tenant_id,id));
    create table public.ordenes(
      id uuid primary key, proyecto_id uuid not null references public.proyectos(id),
      deleted_at timestamptz, unique(proyecto_id,id));
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.plan_es_miembro_proyecto(uuid) returns boolean
      language sql stable as $$select auth.uid() = '${actor}'::uuid$$;
    create function public.plan_puede_editar_proyecto(uuid) returns boolean
      language sql stable as $$select auth.uid() = '${actor}'::uuid$$;
    create function public.plan_es_supervisor_proyecto(uuid) returns boolean
      language sql stable as $$select auth.uid() = '${actor}'::uuid$$;
  `);
  assert.equal((await one('select current_user as rol')).rol, 'postgres');
  assert.equal((await one("select encode(pg_catalog.sha256(convert_to('a','UTF8')),'hex') as hash")).hash.length, 64);

  const migration = await readFile(new URL('../supabase/migrations/202609230010_document_identity.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.query('insert into auth.users(id) values($1)', [actor]);
  await db.query('insert into auth.users(id) values($1)', [intruso]);
  await db.query('insert into public.tenants(id) values($1)', [tenant]);
  await db.query('insert into public.proyectos(id,tenant_id) values($1,$2)', [proyecto, tenant]);
  await db.query('insert into public.ordenes(id,proyecto_id) values($1,$2)', [orden, proyecto]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec('set role authenticated;');

  const reserve = (tipo, solicitud, ciclo = 1) => call('plan_documento_reservar', [orden, tipo, ciclo, solicitud]);
  const save = (doc, data, version, solicitud) => call('plan_documento_borrador_guardar', [doc, data, version, solicitud]);
  const freeze = (doc, version, motivo, solicitud) => call('plan_documento_revision_congelar', [doc, version, motivo, 1, 'plantilla-1', solicitud]);

  const os = await reserve('orden_servicio', uuid(1));
  assert.match(os.codigo, /^POT-\d{4}-OS-\d{8,}$/);
  assert.equal((await reserve('orden_servicio', uuid(1))).id, os.id);
  assert.equal((await reserve('orden_servicio', uuid(2))).id, os.id);
  await rejectsCode(() => reserve('avance', uuid(1)), '22023');
  const rel1 = await reserve('relevamiento', uuid(3));
  const rel2 = await reserve('relevamiento', uuid(4));
  assert.notEqual(rel1.id, rel2.id);
  assert.notEqual(rel1.codigo, rel2.codigo);
  assert.equal((await reserve('cierre', uuid(5))).id, (await reserve('cierre', uuid(6))).id);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [intruso]);
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
  assert.equal((await freeze(os.id, 1, null, uuid(9))).id, rev0.id);
  await rejectsCode(() => freeze(os.id, 1, null, uuid(10)), '23505');
  const second = await save(os.id, { observaciones: 'Corregido' }, 1, uuid(11));
  assert.equal(Number(second.version), 2);
  await rejectsCode(() => freeze(os.id, 2, null, uuid(12)), '22023');
  const rev1 = await freeze(os.id, 2, 'Corrección de redacción', uuid(13));
  assert.equal(rev1.revision, 1);
  assert.notEqual(rev0.contenido_sha256, rev1.contenido_sha256);
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
  console.log('Identidad documental: reservas, unicidad, borradores, concurrencia y revisiones OK');
} finally {
  await db.close();
}
