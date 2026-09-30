import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const creator = '11111111-1111-4111-8111-111111111111';
const ariel = '11111111-1111-4111-8111-222222222222';
const teammate = '11111111-1111-4111-8111-333333333333';
const tenant = '22222222-2222-4222-8222-222222222222';
const work1 = '33333333-3333-4333-8333-111111111111';
const work2 = '33333333-3333-4333-8333-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const denied = async (fn, code) => assert.rejects(fn, e => e.code === code);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.tenants(id uuid primary key, activo boolean not null default true);
    create table public.tenant_miembros(tenant_id uuid, user_id uuid, rol text, activo boolean,
      created_by uuid, primary key(tenant_id,user_id));
    create table public.proyectos(id uuid primary key default gen_random_uuid(), tenant_id uuid,
      nombre text not null default 'Obra', plano_url text not null default 'pending://plan-upload-required',
      cliente text, descripcion text, rubros text[], tecnicos text[], created_by uuid,
      deleted_at timestamptz);
    create table public.proyecto_miembros(proyecto_id uuid, user_id uuid, rol text,
      invitado_por uuid, primary key(proyecto_id,user_id));
    grant select on public.proyectos to authenticated;
    create table public.plataforma_administradores(user_id uuid, activo boolean);
    grant select on public.tenant_miembros, public.proyecto_miembros to service_role;
    create function public.plan_es_creador() returns boolean language sql stable as $$
      select auth.uid()='${creator}'::uuid $$;
    create function public.plan_es_supervisor_proyecto(p uuid) returns boolean language sql stable as $$
      select public.plan_es_creador() or exists(select 1 from public.proyecto_miembros
        where proyecto_id=p and user_id=auth.uid() and rol='supervisor') $$;
    insert into auth.users values
      ('${creator}','creator@example.test'),
      ('${ariel}','ajara@example.test'),
      ('${teammate}','teammate@example.test');
    insert into public.tenants values('${tenant}',true);
    insert into public.tenant_miembros values('${tenant}','${ariel}','supervisor',true,null);
    insert into public.proyectos(id,tenant_id) values
      ('${work1}','${tenant}'),('${work2}','${tenant}'),
      ('${other}','${tenant}');
    insert into public.proyecto_miembros values
      ('${work1}','${ariel}','supervisor',null),
      ('${work2}','${ariel}','supervisor',null);
  `);
  const migration = await readFile(new URL('../supabase/migrations/202609280019_delegated_team_invitations.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const scopedPlans = await readFile(new URL('../supabase/migrations/202609280020_scoped_work_plans.sql', import.meta.url), 'utf8');
  await db.exec(scopedPlans);
  const technicianInvites = await readFile(new URL('../supabase/migrations/202609300024_team_invites_as_technicians.sql', import.meta.url), 'utf8');
  await db.exec(technicianInvites);

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ariel]);
  await db.exec('set role authenticated');
  await denied(() => db.query('select public.plan_configurar_delegacion_invitacion($1,$2,$3,$4)',
    [tenant, 'ajara@example.test', 4, true]), '42501');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [creator]);
  await db.exec('set role authenticated');
  await db.query('select public.plan_configurar_delegacion_invitacion($1,$2,$3,$4)',
    [tenant, 'ajara@example.test', 4, true]);
  await denied(() => db.query('select public.plan_configurar_delegacion_invitacion($1,$2,$3,$4)',
    [tenant, 'ajara@example.test', 5, true]), '22023');

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ariel]);
  await denied(() => db.query('select public.plan_reservar_invitacion_equipo($1,$2,$3)',
    [tenant, other, 'other@example.test']), '42501');
  assert.equal((await one('select public.plan_puede_crear_proyecto($1) as allowed', [tenant])).allowed, false);
  const child = await one('select (public.plan_crear_plano_en_obra($1,$2)).id as id', [work1, 'Planta 1']);
  assert.equal((await one('select proyecto_padre_id from proyectos where id=$1', [child.id])).proyecto_padre_id, work1);
  const first = await one('select public.plan_reservar_invitacion_equipo($1,$2,$3) as id',
    [tenant, work1, 'teammate@example.test']);
  for (let i = 2; i <= 4; i++) await db.query('select public.plan_reservar_invitacion_equipo($1,$2,$3)',
    [tenant, work2, `teammate${i}@example.test`]);
  await denied(() => db.query('select public.plan_reservar_invitacion_equipo($1,$2,$3)',
    [tenant, work1, 'fifth@example.test']), '22023');
  await denied(() => db.query('select public.plan_confirmar_invitacion_equipo($1,$2)',
    [first.id, teammate]), '42501');

  await db.exec('reset role');
  await db.exec('set role service_role');
  await denied(() => db.query('select public.plan_confirmar_invitacion_equipo($1,$2)',
    [first.id, ariel]), '42501');
  await db.query('select public.plan_confirmar_invitacion_equipo($1,$2)', [first.id, teammate]);
  assert.equal((await one('select rol from tenant_miembros where user_id=$1', [teammate])).rol, 'tecnico');
  assert.equal((await one('select rol from proyecto_miembros where user_id=$1', [teammate])).rol, 'tecnico');
  assert.equal((await one('select count(*)::int as n from proyecto_miembros where user_id=$1', [teammate])).n, 2);
  assert.equal((await one('select rol from proyecto_miembros where user_id=$1 and proyecto_id=$2', [teammate, child.id])).rol, 'tecnico');
  await db.exec('reset role');
  const fourth = await one('select id from plan_invitaciones_equipo where email=$1', ['teammate4@example.test']);
  await db.exec('set role service_role');
  await db.query('select public.plan_cancelar_reserva_invitacion($1)', [fourth.id]);
  await db.exec('reset role');
  await db.exec('set role authenticated');
  await db.query('select public.plan_reservar_invitacion_equipo($1,$2,$3)',
    [tenant, work1, 'replacement@example.test']);
  console.log('Invitaciones delegadas: límite, aislamiento, confirmación y reversión de reserva OK');
} finally {
  await db.close();
}
