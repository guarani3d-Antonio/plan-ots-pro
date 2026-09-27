import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const creator = '11111111-1111-4111-8111-111111111111';
const editor = '11111111-1111-4111-8111-222222222222';
const tenant = '22222222-2222-4222-8222-222222222222';
const otherTenant = '22222222-2222-4222-8222-333333333333';
const project = '33333333-3333-4333-8333-333333333333';
const otherProject = '33333333-3333-4333-8333-444444444444';
const order = '44444444-4444-4444-8444-444444444444';
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const denied = async (callback, code) => assert.rejects(callback, e => e.code === code);

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant execute on function auth.uid() to authenticated;
    create table public.tenants(id uuid primary key, activo boolean not null default true);
    create table public.tenant_miembros(tenant_id uuid, user_id uuid, activo boolean not null default true);
    create table public.proyectos(id uuid primary key, tenant_id uuid not null,
      deleted_at timestamptz, unique(tenant_id,id));
    create table public.ordenes(id uuid primary key, proyecto_id uuid not null,
      created_at timestamptz not null default now());
    grant select,update on public.ordenes to authenticated;
    create table public.plan_contratistas(id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null, nombre text not null,
      nombre_clave text generated always as (lower(btrim(nombre))) stored,
      creado_por uuid, unique(tenant_id,nombre_clave));
    create function public.plan_es_creador() returns boolean language sql stable as $$
      select auth.uid()='${creator}'::uuid $$;
    create function public.plan_es_admin_tenant(uuid) returns boolean language sql stable as $$
      select false $$;
    create function public.plan_puede_editar_proyecto(p uuid) returns boolean language sql stable as $$
      select auth.uid() in ('${creator}'::uuid,'${editor}'::uuid)
        and p='${project}'::uuid $$;
  `);
  const migration = await readFile(new URL('../supabase/migrations/202609270018_creator_directories.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.query('insert into auth.users(id) values($1),($2)', [creator, editor]);
  await db.query('insert into tenants(id) values($1),($2)', [tenant, otherTenant]);
  await db.query('insert into tenant_miembros(tenant_id,user_id) values($1,$2)', [tenant, editor]);
  await db.query('insert into proyectos(id,tenant_id) values($1,$2),($3,$4)',
    [project, tenant, otherProject, otherTenant]);
  await db.query('insert into ordenes(id,proyecto_id) values($1,$2)', [order, project]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [creator]);
  await db.exec('set role authenticated');

  const customer = await one('select (public.plan_guardar_cliente($1,$2,$3,$4,$5,$6,$7,$8,$9)).id as id',
    [tenant, null, 'Cliente A', 'RUC-1', 'Contacto', '0991', 'a@example.test', 'Domicilio', true]);
  const location = await one('select (public.plan_guardar_cliente_ubicacion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)).id as id',
    [tenant, null, customer.id, project, 'residencial_altura', 'Edificio A', 'Obra 1', '4', '401', null, true]);
  assert.ok(location.id);
  await denied(() => db.query('select public.plan_guardar_cliente_ubicacion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [tenant, null, customer.id, otherProject, 'industrial', 'Fábrica', null, null, null, null, true]), '42501');
  await db.query('update ordenes set cliente_id=$1,cliente_ubicacion_id=$2 where id=$3',
    [customer.id, location.id, order]);
  assert.equal((await one('select count(*)::int as n from ordenes where cliente_id=$1', [customer.id])).n, 1);
  await denied(() => db.query('select public.plan_guardar_cliente_ubicacion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [tenant, location.id, customer.id, null, 'residencial_altura', 'Edificio A', 'Obra 1', '4', '401', null, true]), '23503');
  await denied(() => db.query('update ordenes set cliente_ubicacion_id=null where id=$1', [order]), '23503');
  const contractor = await one('select public.plan_guardar_contratista_ficha($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
    [tenant, null, 'Contratista A', 'RUC-C', 'Persona', '0981', 'c@example.test', 'Dirección', true]);
  assert.equal((await one('select identificacion from plan_contratista_fichas where contratista_id=$1', [contractor.id])).identificacion, 'RUC-C');
  await denied(() => db.query('select public.plan_guardar_cliente($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [tenant, null, 'Duplicado', 'ruc-1', null, null, null, null, true]), '23505');
  await db.query('select public.plan_guardar_contratista_ficha($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [tenant, contractor.id, 'Contratista A', 'RUC-C', 'Persona', '0981', 'c@example.test', 'Dirección', false]);

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [editor]);
  await denied(() => db.query('select public.plan_guardar_cliente($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [tenant, null, 'Intruso', null, null, null, null, null, true]), '42501');
  assert.equal((await one('select count(*)::int as n from public.plan_clientes')).n, 0);
  const options = await db.query('select * from public.plan_clientes_para_obra($1)', [project]);
  assert.equal(options.rows.length, 1);
  assert.equal(options.rows[0].unidad, '401');
  assert.equal((await db.query('select * from public.plan_contratistas_activos($1)', [tenant])).rows.length, 0);
  await denied(() => db.query('select * from public.plan_contratistas_activos($1)', [otherTenant]), '42501');
  await denied(() => db.query('select * from public.plan_clientes_para_obra($1)', [otherProject]), '42501');
  console.log('Directorios de Creador: escritura, aislamiento y selección por obra OK');
} finally {
  await db.close();
}
