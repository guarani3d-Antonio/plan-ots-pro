import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ids = {
  creator: '11111111-1111-4111-8111-111111111111',
  supervisor: '11111111-1111-4111-8111-222222222222',
  tech: '11111111-1111-4111-8111-333333333333',
  tenant: '22222222-2222-4222-8222-222222222222',
  tenant2: '22222222-2222-4222-8222-333333333333',
  obra1: '33333333-3333-4333-8333-111111111111',
  obra2: '33333333-3333-4333-8333-222222222222',
};
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const first = async (sql, params = []) => (await query(sql, params))[0];
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const denied = async (fn, code) => assert.rejects(fn, e => e.code === code);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.tenants(id uuid primary key, activo boolean default true);
    create table public.tenant_miembros(tenant_id uuid,user_id uuid,rol text,activo boolean);
    create table public.plataforma_administradores(user_id uuid,activo boolean);
    create table public.proyectos(id uuid primary key default gen_random_uuid(),tenant_id uuid,
      nombre text,plano_url text,cliente text,descripcion text,rubros text[],tecnicos text[],
      created_by uuid,deleted_at timestamptz,proyecto_padre_id uuid);
    create table public.proyecto_miembros(proyecto_id uuid,user_id uuid,rol text,invitado_por uuid,
      primary key(proyecto_id,user_id));
    create table public.plan_archivos_legados(bucket_id text,object_name text,proyecto_id uuid);
    create table storage.objects(bucket_id text,name text,owner_id text);
    grant select on public.proyectos,public.proyecto_miembros,public.tenant_miembros,
      public.tenants,public.plataforma_administradores,storage.objects to authenticated;
    create function public.plan_es_creador() returns boolean language sql stable as $$
      select auth.uid()='${ids.creator}'::uuid $$;
    create function public.plan_es_miembro_proyecto(p uuid) returns boolean language sql stable as $$
      select public.plan_es_creador() or exists(select 1 from public.proyecto_miembros pm
      join public.proyectos pr on pr.id=pm.proyecto_id
      join public.tenant_miembros tm on tm.tenant_id=pr.tenant_id and tm.user_id=auth.uid() and tm.activo
      where pm.proyecto_id=p and pm.user_id=auth.uid()) $$;
    create function public.plan_puede_editar_proyecto(p uuid) returns boolean language sql stable as $$
      select public.plan_es_creador() or exists(select 1 from public.proyecto_miembros pm
      join public.proyectos pr on pr.id=pm.proyecto_id
      join public.tenant_miembros tm on tm.tenant_id=pr.tenant_id and tm.user_id=auth.uid() and tm.activo
      where pm.proyecto_id=p and pm.user_id=auth.uid() and pm.rol in ('supervisor','tecnico')) $$;
    create function public.plan_es_supervisor_proyecto(p uuid) returns boolean language sql stable as $$
      select public.plan_es_creador() or exists(select 1 from public.proyecto_miembros pm
      join public.proyectos pr on pr.id=pm.proyecto_id
      join public.tenant_miembros tm on tm.tenant_id=pr.tenant_id and tm.user_id=auth.uid() and tm.activo
      where pm.proyecto_id=p and pm.user_id=auth.uid() and pm.rol='supervisor') $$;
    create function public.plan_storage_proyecto(bucket text,path text) returns uuid language sql stable as $$
      select nullif(split_part(path,'/',2),'')::uuid $$;
    create function public.plan_storage_path(ref text,bucket text) returns text language sql stable as $$
      select case when ref like 'storage://' || bucket || '/%' then substr(ref,length('storage://' || bucket || '/')+1) end $$;
    create function public.plan_archivo_de_proyecto(bucket text,path text,p uuid) returns boolean language sql stable as $$
      select public.plan_storage_proyecto(bucket,path)=p $$;
    insert into auth.users values ('${ids.creator}'),('${ids.supervisor}'),('${ids.tech}');
    insert into tenants values ('${ids.tenant}',true),('${ids.tenant2}',true);
    insert into tenant_miembros values ('${ids.tenant}','${ids.supervisor}','supervisor',true),
      ('${ids.tenant}','${ids.tech}','tecnico',true);
    insert into proyectos(id,tenant_id,nombre,plano_url,created_by) values
      ('${ids.obra1}','${ids.tenant}','Güembé','pending://plan-upload-required','${ids.creator}'),
      ('${ids.obra2}','${ids.tenant}','Eleva 1','pending://plan-upload-required','${ids.creator}');
    insert into proyecto_miembros values
      ('${ids.obra1}','${ids.supervisor}','supervisor','${ids.creator}'),
      ('${ids.obra2}','${ids.supervisor}','supervisor','${ids.creator}'),
      ('${ids.obra1}','${ids.tech}','tecnico','${ids.creator}');
  `);
  const migration = await readFile(new URL('../supabase/migrations/202610060001_project_folders.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const folderActions = await readFile(new URL('../supabase/migrations/202610060002_folder_rename_delete.sql', import.meta.url), 'utf8');
  await db.exec(folderActions);

  let parent = null;
  const folders = [];
  await as(ids.supervisor, async () => {
    for (let n = 1; n <= 5; n++) {
      const folder = await first('select (public.plan_crear_carpeta($1,$2,$3)).*', [ids.tenant, parent, `Nivel ${n}`]);
      folders.push(folder); parent = folder.id;
    }
    await denied(() => query('select public.plan_crear_carpeta($1,$2,$3)', [ids.tenant, parent, 'Nivel 6']), '22023');
    const child = await first('select (public.plan_crear_plano_en_carpeta($1,$2,$3)).*', [ids.obra2, 'Plano de Eleva', parent]);
    assert.equal(child.carpeta_id, parent);
    assert.equal(child.proyecto_padre_id, ids.obra2);
    await denied(() => query('select public.plan_mover_carpeta($1,$2)', [folders[0].id, folders[4].id]), '22023');
    await denied(() => query('select public.plan_mover_carpeta($1,$2)', [folders[1].id, folders[4].id]), '22023');
    assert.equal((await first('select (public.plan_renombrar_carpeta($1,$2)).nombre as nombre', [folders[0].id, '  Distrito  '])).nombre, 'Distrito');
    await denied(() => query('select public.plan_renombrar_carpeta($1,$2)', [folders[0].id, '  ']), '22023');
    assert.equal((await first('select public.plan_puede_eliminar_carpeta($1) as permitido', [folders[0].id])).permitido, false);
    assert.equal((await first('select public.plan_puede_eliminar_carpeta($1) as permitido', [folders[4].id])).permitido, false);
    await denied(() => query('select public.plan_eliminar_carpeta($1)', [folders[0].id]), '23503');
    await denied(() => query('select public.plan_eliminar_carpeta($1)', [folders[4].id]), '23503');
    const empty = await first('select (public.plan_crear_carpeta($1,$2,$3)).*', [ids.tenant, null, 'Temporal']);
    assert.equal((await first('select public.plan_puede_eliminar_carpeta($1) as permitido', [empty.id])).permitido, true);
    await query('select public.plan_eliminar_carpeta($1)', [empty.id]);
    assert.equal((await first('select count(*)::int as total from plan_carpetas where id=$1', [empty.id])).total, 0);
  });
  await as(ids.tech, async () => {
    await denied(() => query('select public.plan_renombrar_carpeta($1,$2)', [folders[0].id, 'Cambio ajeno']), '42501');
    assert.equal((await first('select public.plan_puede_eliminar_carpeta($1) as permitido', [folders[0].id])).permitido, false);
    await denied(() => query('select public.plan_eliminar_carpeta($1)', [folders[0].id]), '42501');
    await denied(() => query('select public.plan_crear_plano_en_carpeta($1,$2,$3)', [ids.obra2, 'Ajeno', null]), '42501');
    const child = await first('select (public.plan_crear_plano_en_carpeta($1,$2,$3)).*', [ids.obra1, 'Plano de Güembé', null]);
    assert.equal((await first('select rol from proyecto_miembros where proyecto_id=$1 and user_id=$2', [child.id, ids.tech])).rol, 'tecnico');
    await denied(() => query('select public.plan_ubicar_proyecto($1,$2)', [ids.obra1, folders[0].id]), '42501');
    await denied(() => query('select public.plan_crear_carpeta($1,$2,$3)', [ids.tenant2, null, 'Otra empresa']), '42501');
    assert.equal((await first("select public.plan_storage_permitido('planos',$1,'write') as permitido", [`${ids.tenant}/${child.id}/archivo.pdf`])).permitido, true);
    assert.equal((await first("select public.plan_storage_permitido('exports',$1,'write') as permitido", [`${ids.tenant}/${child.id}/informe.pdf`])).permitido, false);
  });
  console.log('Carpetas: cinco niveles, renombrado, eliminación solo vacías, permisos por obra y Storage OK');
} finally { await db.close(); }
