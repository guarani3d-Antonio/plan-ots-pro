begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Explicit grants augment existing work membership; organization never grants work access.
create table public.plan_permiso_catalogo(
 clave text primary key, grupo text not null, nombre text not null,
 base_roles text[] not null default '{}', solo_creador boolean not null default false
);
create table public.plan_equipo_nodos(
 tenant_id uuid not null, user_id uuid not null, superior_id uuid,
 perfil text not null check(perfil in ('jefe','tecnico','ayudante','lector')),
 cargo text not null default '', cupos_tecnicos integer not null default 0 check(cupos_tecnicos between 0 and 10000),
 cupos_ayudantes integer not null default 0 check(cupos_ayudantes between 0 and 10000),
 revision bigint not null default 1, actualizado_en timestamptz not null default now(),
 primary key(tenant_id,user_id),
 foreign key(tenant_id,user_id) references public.tenant_miembros(tenant_id,user_id),
 foreign key(tenant_id,superior_id) references public.plan_equipo_nodos(tenant_id,user_id) deferrable initially deferred,
 check(user_id is distinct from superior_id)
);
create table public.plan_equipo_permisos(
 tenant_id uuid not null,user_id uuid not null,clave text not null references public.plan_permiso_catalogo,
 permitido boolean not null,delegable boolean not null default false,
 primary key(tenant_id,user_id,clave),foreign key(tenant_id,user_id) references public.plan_equipo_nodos,
 check(not delegable or permitido)
);
create table public.plan_equipo_eventos(
 id bigint generated always as identity primary key,tenant_id uuid not null references public.tenants,
 usuario_id uuid,actor_id uuid,fecha timestamptz not null default now(),accion text not null,antes jsonb,despues jsonb
);
create table public.plan_equipo_invitaciones(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,superior_id uuid not null,
 email text not null,perfil text not null check(perfil in ('tecnico','ayudante','lector')),
 obras uuid[] not null,estado text not null default 'reservada' check(estado in ('reservada','enviada','cancelada','fallida')),
 usuario_id uuid references auth.users,creado_por uuid not null references auth.users,
 creado_en timestamptz not null default now(),actualizado_en timestamptz not null default now(),
 foreign key(tenant_id,superior_id) references public.plan_equipo_nodos,
 check(email=lower(btrim(email)))
);
create unique index plan_equipo_invitacion_pendiente on public.plan_equipo_invitaciones(tenant_id,email) where estado in ('reservada','enviada');
create index plan_equipo_superior on public.plan_equipo_nodos(tenant_id,superior_id);
create index plan_equipo_invitacion_superior on public.plan_equipo_invitaciones(tenant_id,superior_id);
alter table public.plan_permiso_catalogo enable row level security;
alter table public.plan_equipo_nodos enable row level security;
alter table public.plan_equipo_permisos enable row level security;
alter table public.plan_equipo_eventos enable row level security;
alter table public.plan_equipo_invitaciones enable row level security;
revoke all on public.plan_permiso_catalogo,public.plan_equipo_nodos,public.plan_equipo_permisos,public.plan_equipo_eventos,public.plan_equipo_invitaciones from public,anon,authenticated;

-- Catalog is populated below before membership backfill.
insert into public.plan_permiso_catalogo(clave,grupo,nombre,base_roles,solo_creador) values
('empresa.ver','Empresas','Ver ficha',array[]::text[],false),
('empresa.crear','Empresas','Crear empresas',array[]::text[],true),
('empresa.editar','Empresas','Editar ficha',array[]::text[],false),
('empresa.estado','Empresas','Activar o desactivar',array[]::text[],false),
('empresa.eliminar','Empresas','Eliminar sin dependencias',array[]::text[],true),
('obra.ver','Obras','Ver obras',array['administrador']::text[],false),
('obra.crear','Obras','Crear obras',array['administrador']::text[],false),
('obra.editar','Obras','Editar datos, foto y color',array[]::text[],false),
('obra.estado','Obras','Activar o desactivar',array[]::text[],false),
('obra.eliminar','Obras','Eliminar sin dependencias',array[]::text[],false),
('cliente.ver','Clientes','Consultar clientes',array[]::text[],false),
('cliente.crear','Clientes','Crear clientes',array[]::text[],false),
('cliente.editar','Clientes','Editar clientes',array[]::text[],false),
('cliente.estado','Clientes','Activar o desactivar',array[]::text[],false),
('cliente.eliminar','Clientes','Eliminar sin dependencias',array[]::text[],false),
('cliente.ubicaciones','Clientes','Administrar ubicaciones',array[]::text[],false),
('contratista.ver','Contratistas','Consultar contratistas',array[]::text[],false),
('contratista.crear','Contratistas','Crear contratistas',array[]::text[],false),
('contratista.editar','Contratistas','Editar contratistas',array[]::text[],false),
('contratista.estado','Contratistas','Activar o desactivar',array[]::text[],false),
('contratista.eliminar','Contratistas','Eliminar sin dependencias',array[]::text[],false),
('contacto.ver','Contactos','Consultar contactos',array[]::text[],false),
('contacto.crear','Contactos','Crear contactos',array[]::text[],false),
('contacto.editar','Contactos','Editar datos y vínculos',array[]::text[],false),
('contacto.estado','Contactos','Activar o desactivar',array[]::text[],false),
('contacto.eliminar','Contactos','Eliminar sin dependencias',array[]::text[],false),
('equipo.ver','Equipo','Ver organigrama y usuarios',array['administrador','supervisor','tecnico','viewer']::text[],false),
('equipo.invitar','Equipo','Invitar personas',array[]::text[],false),
('equipo.editar','Equipo','Administrar integrantes',array[]::text[],false),
('equipo.permisos','Equipo','Asignar permisos',array[]::text[],false),
('equipo.alcances','Equipo','Asignar obras',array[]::text[],false),
('proyecto.ver','Proyectos y planos','Ver proyectos',array['administrador','supervisor','tecnico','viewer']::text[],false),
('proyecto.crear','Proyectos y planos','Crear planos',array['administrador','supervisor','tecnico']::text[],false),
('proyecto.editar','Proyectos y planos','Editar proyectos y planos',array['administrador','supervisor']::text[],false),
('proyecto.mover','Proyectos y planos','Mover proyectos',array['administrador','supervisor','tecnico']::text[],false),
('proyecto.eliminar','Proyectos y planos','Eliminar proyectos',array['administrador','supervisor']::text[],false),
('carpeta.ver','Carpetas','Ver carpetas',array['administrador','supervisor','tecnico','viewer']::text[],false),
('carpeta.crear','Carpetas','Crear carpetas',array['administrador','supervisor','tecnico']::text[],false),
('carpeta.editar','Carpetas','Renombrar carpetas',array['administrador','supervisor','tecnico']::text[],false),
('carpeta.mover','Carpetas','Mover carpetas',array['administrador','supervisor','tecnico']::text[],false),
('carpeta.eliminar','Carpetas','Eliminar carpetas vacías',array['administrador','supervisor','tecnico']::text[],false),
('ot.ver','Órdenes de trabajo','Consultar OTs',array['administrador','supervisor','tecnico','viewer']::text[],false),
('ot.crear','Órdenes de trabajo','Crear OTs',array['administrador','supervisor','tecnico']::text[],false),
('ot.editar','Órdenes de trabajo','Editar datos del reclamo',array['administrador','supervisor','tecnico']::text[],false),
('ot.clasificar','Órdenes de trabajo','Clasificar rubros, prioridad y riesgo',array['administrador','supervisor','tecnico']::text[],false),
('ot.asignar','Órdenes de trabajo','Asignar responsables y contratistas',array['administrador','supervisor','tecnico']::text[],false),
('ot.estado','Órdenes de trabajo','Cambiar estado',array['administrador','supervisor','tecnico']::text[],false),
('ot.cerrar','Órdenes de trabajo','Cerrar OTs',array['administrador','supervisor','tecnico']::text[],false),
('ot.reabrir','Órdenes de trabajo','Reabrir OTs',array['administrador','supervisor','tecnico']::text[],false),
('ot.eliminar','Órdenes de trabajo','Eliminar OTs',array['administrador','supervisor']::text[],false),
('ot.ubicacion','Órdenes de trabajo','Modificar ubicación en el plano',array['administrador','supervisor','tecnico']::text[],false),
('ot.historial','Órdenes de trabajo','Consultar historial',array['administrador','supervisor','tecnico','viewer']::text[],false),
('ot.restaurar','Órdenes de trabajo','Restaurar versiones',array['administrador','supervisor']::text[],false),
('foto.ver','Fotos y evidencias','Ver fotos',array['administrador','supervisor','tecnico','viewer']::text[],false),
('foto.cargar','Fotos y evidencias','Cargar fotos',array['administrador','supervisor','tecnico']::text[],false),
('foto.editar','Fotos y evidencias','Editar anotaciones y descripciones',array['administrador','supervisor','tecnico']::text[],false),
('foto.eliminar','Fotos y evidencias','Eliminar fotos',array['administrador','supervisor','tecnico']::text[],false),
('conversacion.ver','Conversaciones','Leer conversaciones',array['administrador','supervisor','tecnico','viewer']::text[],false),
('conversacion.crear','Conversaciones','Agregar comentarios',array['administrador','supervisor','tecnico']::text[],false),
('conversacion.editar','Conversaciones','Editar comentarios propios',array['administrador','supervisor','tecnico']::text[],false),
('conversacion.eliminar','Conversaciones','Eliminar comentarios propios',array['administrador','supervisor','tecnico']::text[],false),
('informe.ver','Informes','Ver documentos',array['administrador','supervisor','tecnico','viewer']::text[],false),
('informe.crear','Informes','Crear documento o versión corregida',array['administrador','supervisor','tecnico']::text[],false),
('informe.editar','Informes','Editar borradores',array['administrador','supervisor','tecnico']::text[],false),
('informe.imprimir','Informes','Imprimir y descargar borradores',array['administrador','supervisor','tecnico']::text[],false),
('informe.preparar','Informes','Preparar PDF definitivo',array['administrador','supervisor']::text[],false),
('informe.aprobar','Informes','Revisar y aprobar PDF',array['administrador','supervisor']::text[],false),
('informe.emitir','Informes','Emitir documento definitivo',array['administrador','supervisor']::text[],false),
('costos.ver','Costos','Consultar costos',array['administrador','supervisor']::text[],false),
('costos.editar','Costos','Editar costos',array['administrador','supervisor']::text[],false),
('grilla.ver','Grilla','Ver y filtrar',array['administrador','supervisor','tecnico','viewer']::text[],false),
('grilla.editar','Grilla','Editar OTs desde la grilla',array['administrador','supervisor','tecnico']::text[],false),
('grilla.exportar','Grilla','Exportar CSV y PDF',array['administrador','supervisor','tecnico']::text[],false),
('dashboard.ver','Dashboard','Ver indicadores',array['administrador','supervisor','tecnico','viewer']::text[],false),
('dashboard.personalizar','Dashboard','Personalizar su dashboard',array[]::text[],true),
('dashboard.configurar','Dashboard','Configurar dashboards de otros',array[]::text[],true),
('gantt.ver','Gantt','Ver planificación',array['administrador','supervisor','tecnico','viewer']::text[],false),
('gantt.editar','Gantt','Editar fechas de planificación',array[]::text[],true),
('calendario.ver','Calendario','Ver calendario',array['administrador','supervisor','tecnico','viewer']::text[],false),
('calendario.editar','Calendario','Editar fechas',array[]::text[],true),
('campo.ver','Campos adicionales','Ver campos',array['administrador','supervisor','tecnico','viewer']::text[],false),
('campo.editar','Campos adicionales','Completar valores',array['administrador','supervisor','tecnico']::text[],false),
('campo.configurar','Campos adicionales','Crear y editar definiciones',array['administrador','supervisor']::text[],false),
('notificacion.ver','Notificaciones','Ver notificaciones',array['administrador','supervisor','tecnico','viewer']::text[],false),
('notificacion.configurar','Notificaciones','Configurar reglas de empresa',array[]::text[],true),
('auditoria.ver','Auditoría','Ver cambios de permisos',array[]::text[],true);

create function public.plan_equipo_activo(p_tenant uuid,p_usuario uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.tenant_miembros m join public.tenants t on t.id=m.tenant_id
 where m.tenant_id=p_tenant and m.user_id=p_usuario and m.activo and t.activo)
 and not exists(with recursive camino as (
 select n.*,array[n.user_id] ids from public.plan_equipo_nodos n where n.tenant_id=p_tenant and n.user_id=p_usuario
 union all select n.*,c.ids||n.user_id from public.plan_equipo_nodos n join camino c on n.tenant_id=c.tenant_id and n.user_id=c.superior_id where not n.user_id=any(c.ids)
 ) select 1 from camino c left join public.tenant_miembros m on m.tenant_id=c.tenant_id and m.user_id=c.user_id where not coalesce(m.activo,false));
$$;
create function public.plan_equipo_descendiente(p_tenant uuid,p_usuario uuid,p_superior uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 with recursive camino as (
 select n.superior_id,array[n.user_id] ids from public.plan_equipo_nodos n where n.tenant_id=p_tenant and n.user_id=p_usuario
 union all select n.superior_id,c.ids||n.user_id from public.plan_equipo_nodos n join camino c on n.user_id=c.superior_id and n.tenant_id=p_tenant where not n.user_id=any(c.ids)
 ) select p_usuario<>p_superior and exists(select 1 from camino where superior_id=p_superior);
$$;
create function public.plan_equipo_permiso_usuario(p_tenant uuid,p_usuario uuid,p_clave text,p_delegar boolean default false) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare n public.plan_equipo_nodos;c public.plan_permiso_catalogo;v boolean;r text;seen uuid[]:='{}';u uuid:=p_usuario;first_node boolean:=true;
begin
 select * into c from public.plan_permiso_catalogo where clave=p_clave;
 if c.clave is null then return false;end if;
 if exists(select 1 from public.plataforma_administradores where user_id=p_usuario and activo) then return true;end if;
 if c.solo_creador or not public.plan_equipo_activo(p_tenant,p_usuario) then return false;end if;
 if split_part(p_clave,'.',2)<>'ver' and exists(select 1 from public.plan_permiso_catalogo where clave=split_part(p_clave,'.',1)||'.ver') and not public.plan_equipo_permiso_usuario(p_tenant,p_usuario,split_part(p_clave,'.',1)||'.ver') then return false;end if;
 loop
  if u=any(seen) or cardinality(seen)>32 then return false;end if;seen:=seen||u;
  select rol into r from public.tenant_miembros where tenant_id=p_tenant and user_id=u and activo;
  if r is null then return false;end if;
  select case when (p_delegar and first_node) or not first_node then permitido and delegable else permitido end into v
   from public.plan_equipo_permisos where tenant_id=p_tenant and user_id=u and clave=p_clave;
  if not found then v:=first_node and not p_delegar and r=any(c.base_roles);end if;
  if not coalesce(v,false) then return false;end if;
  select * into n from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=u;
  if n.superior_id is null then return true;end if;
  u:=n.superior_id;first_node:=false;
 end loop;
end $$;
create function public.plan_tiene_permiso(p_clave text,p_tenant uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and public.plan_equipo_permiso_usuario(p_tenant,auth.uid(),p_clave);
$$;
create function public.plan_equipo_obra_usuario(p_tenant uuid,p_usuario uuid,p_obra uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare u uuid:=p_usuario;n public.plan_equipo_nodos;seen uuid[]:='{}';
begin
 if not public.plan_equipo_activo(p_tenant,p_usuario) then return false;end if;
 loop
  if u=any(seen) or cardinality(seen)>32 then return false;end if;seen:=seen||u;
  if not exists(select 1 from public.proyectos p join public.proyecto_miembros m on m.proyecto_id=p.id and m.user_id=u where p.id=p_obra and p.tenant_id=p_tenant and p.deleted_at is null) then return false;end if;
  select * into n from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=u;
  if n.superior_id is null then return true;end if;u:=n.superior_id;
 end loop;
end $$;
create function public.plan_permiso_proyecto(p_clave text,p_proyecto uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select public.plan_es_creador() or exists(select 1 from public.proyectos p where p.id=p_proyecto and
 public.plan_equipo_obra_usuario(p.tenant_id,auth.uid(),p.id) and public.plan_tiene_permiso(p_clave,p.tenant_id));
$$;

-- Preserve existing memberships and granted operations. Only known inviter links
-- become reporting lines; never infer a superior from someone's display name.
insert into public.plan_equipo_nodos(tenant_id,user_id,perfil,cupos_tecnicos)
select m.tenant_id,m.user_id,case when m.rol in ('administrador','supervisor') then 'jefe' when m.rol='tecnico' then 'tecnico' else 'lector' end,
 coalesce((select limite from public.plan_delegaciones_invitacion d where d.tenant_id=m.tenant_id and d.supervisor_id=m.user_id and d.activa),0)
from public.tenant_miembros m where not exists(select 1 from public.plataforma_administradores a where a.user_id=m.user_id);
insert into public.plan_equipo_permisos(tenant_id,user_id,clave,permitido,delegable)
select n.tenant_id,n.user_id,c.clave,m.rol=any(c.base_roles) and not c.solo_creador,
 n.perfil='jefe' and m.rol=any(c.base_roles) and not c.solo_creador
from public.plan_equipo_nodos n join public.tenant_miembros m using(tenant_id,user_id) cross join public.plan_permiso_catalogo c;
update public.plan_equipo_permisos p set permitido=true,delegable=false where clave in ('equipo.invitar','equipo.editar','equipo.permisos','equipo.alcances') and exists(select 1 from public.plan_delegaciones_invitacion d where d.tenant_id=p.tenant_id and d.supervisor_id=p.user_id and d.activa);
-- Do not attach legacy users automatically: that could reduce their existing
-- work scope. The creator selects reporting lines after reviewing the graph.

create function public.plan_equipo_puede_gestionar(p_tenant uuid,p_usuario uuid,p_accion text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and not exists(select 1 from public.plataforma_administradores where user_id=p_usuario)
 and exists(select 1 from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=p_usuario)
 and (public.plan_es_creador() or (p_usuario<>auth.uid() and public.plan_tiene_permiso(p_accion,p_tenant) and public.plan_equipo_descendiente(p_tenant,p_usuario,auth.uid())));
$$;

create function public.plan_equipo_verificar_cupos(p_tenant uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare n record;usados integer;pendientes integer;k text;limite integer;
begin
 for n in select * from public.plan_equipo_nodos where tenant_id=p_tenant loop
  foreach k in array array['tecnico','ayudante'] loop
   limite:=case when k='tecnico' then n.cupos_tecnicos else n.cupos_ayudantes end;
   select count(*) into usados from public.plan_equipo_nodos d join public.tenant_miembros m using(tenant_id,user_id)
    where d.tenant_id=p_tenant and m.activo and (d.perfil=k or (k='tecnico' and d.perfil='lector')) and public.plan_equipo_descendiente(p_tenant,d.user_id,n.user_id);
   select count(*) into pendientes from public.plan_equipo_invitaciones i where i.tenant_id=p_tenant and i.estado='reservada'
    and (i.perfil=k or (k='tecnico' and i.perfil='lector')) and (i.superior_id=n.user_id or public.plan_equipo_descendiente(p_tenant,i.superior_id,n.user_id));
   if usados+pendientes>limite then raise exception 'Cupo de % insuficiente: % ocupados, % autorizados',k,usados+pendientes,limite using errcode='22023';end if;
  end loop;
 end loop;
end $$;

create function public.plan_equipo_guardar(p_tenant uuid,p_usuario uuid,p_revision bigint,p_datos jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare n public.plan_equipo_nodos;prev jsonb;parent uuid;v_perfil text;a record;keys text[];works uuid[];oldworks uuid[];v boolean;d boolean;changed boolean;newactive boolean;legado text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text,721));
 if not public.plan_equipo_puede_gestionar(p_tenant,p_usuario,'equipo.editar') then raise exception 'Sin permiso para gestionar esta persona' using errcode='42501';end if;
 select * into n from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=p_usuario for update;
 if n.revision<>p_revision then raise exception 'Los permisos cambiaron. Actualizá la ficha antes de guardar.' using errcode='40001';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or length(p_datos::text)>50000 then raise exception 'Ficha inválida' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('superior_id','perfil','cargo','activo','cupos_tecnicos','cupos_ayudantes','obras','permisos')) then raise exception 'Campo inválido' using errcode='22023';end if;
 if jsonb_typeof(p_datos->'obras') is distinct from 'array' or jsonb_typeof(p_datos->'permisos') is distinct from 'array' then raise exception 'Faltan obras o permisos' using errcode='22023';end if;
 parent:=nullif(p_datos->>'superior_id','')::uuid;v_perfil:=p_datos->>'perfil';newactive:=(p_datos->>'activo')::boolean;
 if v_perfil is null or v_perfil not in ('jefe','tecnico','ayudante','lector') or newactive is null or length(coalesce(p_datos->>'cargo',''))>100 then raise exception 'Perfil inválido' using errcode='22023';end if;
 if parent is not null and (parent=p_usuario or not exists(select 1 from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=parent) or public.plan_equipo_descendiente(p_tenant,parent,p_usuario)) then raise exception 'La jerarquía no puede contener ciclos ni otra empresa' using errcode='22023';end if;
 if not public.plan_es_creador() and (parent is distinct from n.superior_id or v_perfil<>n.perfil or (p_datos->>'cupos_tecnicos')::integer<>n.cupos_tecnicos or (p_datos->>'cupos_ayudantes')::integer<>n.cupos_ayudantes) then raise exception 'Solo la plataforma modifica jerarquía, perfil y cupos' using errcode='42501';end if;
 select coalesce(array_agg(x::uuid order by x::uuid),'{}') into works from jsonb_array_elements_text(p_datos->'obras') x;
 select coalesce(array_agg(p.id order by p.id),'{}') into oldworks from public.proyecto_miembros m join public.proyectos p on p.id=m.proyecto_id where m.user_id=p_usuario and p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null;
 if exists(select 1 from unnest(works) w where not exists(select 1 from public.proyectos p where p.id=w and p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null)) then raise exception 'Obra ajena o inexistente' using errcode='42501';end if;
 if not public.plan_es_creador() and works is distinct from oldworks and (not public.plan_tiene_permiso('equipo.alcances',p_tenant) or exists(select 1 from unnest(works) w where not public.plan_equipo_obra_usuario(p_tenant,auth.uid(),w))) then raise exception 'No podés asignar obras fuera de tu alcance' using errcode='42501';end if;
 if parent is not null and exists(select 1 from unnest(works) w where not public.plan_equipo_obra_usuario(p_tenant,parent,w)) then raise exception 'Las obras deben estar dentro del alcance del superior' using errcode='22023';end if;
 prev:=to_jsonb(n)||jsonb_build_object('obras',oldworks,'permisos',(select jsonb_agg(to_jsonb(p)) from public.plan_equipo_permisos p where tenant_id=p_tenant and user_id=p_usuario));
 if jsonb_typeof(p_datos->'permisos') is distinct from 'array' then raise exception 'Falta la matriz' using errcode='22023';end if;
 select array_agg(x->>'clave') into keys from jsonb_array_elements(p_datos->'permisos') x;
 if cardinality(keys)<>(select count(*) from public.plan_permiso_catalogo) or cardinality(keys)<>(select count(distinct x) from unnest(keys) x) then raise exception 'Matriz incompleta' using errcode='22023';end if;
 for a in select * from jsonb_to_recordset(p_datos->'permisos') as x(clave text,permitido boolean,delegable boolean) loop
  if a.permitido is null or a.delegable is null or (a.delegable and not a.permitido) or not exists(select 1 from public.plan_permiso_catalogo where clave=a.clave) then raise exception 'Permiso inválido' using errcode='22023';end if;
  select permitido,delegable into v,d from public.plan_equipo_permisos where tenant_id=p_tenant and user_id=p_usuario and clave=a.clave;
  changed:=a.permitido is distinct from v or a.delegable is distinct from d;
  if changed and not public.plan_es_creador() and (not public.plan_tiene_permiso('equipo.permisos',p_tenant) or not public.plan_equipo_permiso_usuario(p_tenant,auth.uid(),a.clave,true)) then raise exception 'No podés delegar %',a.clave using errcode='42501';end if;
  if a.permitido and exists(select 1 from public.plan_permiso_catalogo where clave=a.clave and solo_creador) then raise exception 'Permiso reservado a la plataforma' using errcode='42501';end if;
  if a.permitido and parent is not null and not public.plan_equipo_permiso_usuario(p_tenant,parent,a.clave,true) then
   if changed or parent is distinct from n.superior_id then raise exception 'El superior no puede delegar %',a.clave using errcode='22023';end if;
  end if;
  insert into public.plan_equipo_permisos values(p_tenant,p_usuario,a.clave,a.permitido,a.delegable) on conflict(tenant_id,user_id,clave) do update set permitido=excluded.permitido,delegable=excluded.delegable;
 end loop;
 update public.plan_equipo_nodos set superior_id=parent,perfil=v_perfil,cargo=coalesce(p_datos->>'cargo',''),cupos_tecnicos=(p_datos->>'cupos_tecnicos')::integer,cupos_ayudantes=(p_datos->>'cupos_ayudantes')::integer,revision=revision+1,actualizado_en=now() where tenant_id=p_tenant and user_id=p_usuario;
 legado:=case when v_perfil='jefe' then case when exists(select 1 from public.tenant_miembros where tenant_id=p_tenant and user_id=p_usuario and rol='administrador') then 'administrador' else 'supervisor' end when v_perfil='lector' then 'viewer' else 'tecnico' end;
 update public.tenant_miembros set activo=newactive,rol=legado,updated_at=now() where tenant_id=p_tenant and user_id=p_usuario;
 delete from public.proyecto_miembros m using public.proyectos p where m.proyecto_id=p.id and p.tenant_id=p_tenant and m.user_id=p_usuario and not coalesce(p.proyecto_padre_id,p.id)=any(works);
 if newactive then insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por) select w,p_usuario,case when v_perfil='jefe' then 'supervisor' when v_perfil='lector' then 'viewer' else 'tecnico' end,auth.uid() from unnest(works) w on conflict(proyecto_id,user_id) do update set rol=excluded.rol;end if;
 if exists(with recursive tree as (select user_id,superior_id,1 nivel from public.plan_equipo_nodos where tenant_id=p_tenant and superior_id is null union all select child.user_id,child.superior_id,t.nivel+1 from public.plan_equipo_nodos child join tree t on child.superior_id=t.user_id where child.tenant_id=p_tenant and t.nivel<33) select 1 from tree where nivel>16) then raise exception 'La jerarquía admite hasta 16 niveles' using errcode='22023';end if;
 perform public.plan_equipo_verificar_cupos(p_tenant);
 insert into public.plan_equipo_eventos(tenant_id,usuario_id,actor_id,accion,antes,despues) values(p_tenant,p_usuario,auth.uid(),'guardar',prev,p_datos);
end $$;

create function public.plan_equipo_listar(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if not public.plan_es_creador() and not public.plan_tiene_permiso('equipo.ver',p_tenant) then raise exception 'Sin acceso al equipo' using errcode='42501';end if;
 if not exists(select 1 from public.tenants where id=p_tenant) then raise exception 'Empresa inexistente' using errcode='22023';end if;
 select jsonb_build_object('usuarios',coalesce((select jsonb_agg(jsonb_build_object(
 'id',n.user_id,'nombre',coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email),
 'email',u.email,'superior_id',n.superior_id,'perfil',n.perfil,'cargo',n.cargo,'activo',m.activo,'revision',n.revision,
 'cupos_tecnicos',n.cupos_tecnicos,'cupos_ayudantes',n.cupos_ayudantes,
 'editable',public.plan_equipo_puede_gestionar(p_tenant,n.user_id,'equipo.editar'),
 'obras',coalesce((select jsonb_agg(p.id order by p.id) from public.proyecto_miembros a join public.proyectos p on p.id=a.proyecto_id where a.user_id=n.user_id and p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null),'[]'),
 'permisos',(select jsonb_agg(jsonb_build_object('clave',c.clave,'permitido',coalesce(v.permitido,false),'delegable',coalesce(v.delegable,false),'efectivo',public.plan_equipo_permiso_usuario(p_tenant,n.user_id,c.clave),'editable',public.plan_es_creador() or public.plan_equipo_permiso_usuario(p_tenant,auth.uid(),c.clave,true)) order by c.clave) from public.plan_permiso_catalogo c left join public.plan_equipo_permisos v on v.tenant_id=p_tenant and v.user_id=n.user_id and v.clave=c.clave)
 ) order by n.perfil,n.user_id) from public.plan_equipo_nodos n join public.tenant_miembros m using(tenant_id,user_id) join auth.users u on u.id=n.user_id
 where n.tenant_id=p_tenant and not exists(select 1 from public.plataforma_administradores where user_id=n.user_id)
 and (public.plan_es_creador() or n.user_id=auth.uid() or public.plan_equipo_descendiente(p_tenant,n.user_id,auth.uid()) or public.plan_equipo_descendiente(p_tenant,auth.uid(),n.user_id))),'[]'),
 'obras',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre)) from public.proyectos p where p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null and (public.plan_es_creador() or public.plan_equipo_obra_usuario(p_tenant,auth.uid(),p.id))),'[]'),
 'invitaciones',coalesce((select jsonb_agg(to_jsonb(i)-'creado_por') from public.plan_equipo_invitaciones i where i.tenant_id=p_tenant and (public.plan_es_creador() or i.superior_id=auth.uid() or public.plan_equipo_descendiente(p_tenant,i.superior_id,auth.uid()))),'[]'),
 'puede_invitar',public.plan_es_creador() or public.plan_tiene_permiso('equipo.invitar',p_tenant)) into result;
 return result;
end $$;

-- All internals are private: no arbitrary-user permission oracle over REST.
do $$ declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'plan_equipo_%' or proname in ('plan_tiene_permiso','plan_permiso_proyecto')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.plan_equipo_listar(uuid),public.plan_equipo_guardar(uuid,uuid,bigint,jsonb),public.plan_tiene_permiso(text,uuid),public.plan_permiso_proyecto(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
