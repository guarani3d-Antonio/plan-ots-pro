begin;
set local lock_timeout='10s';
set local statement_timeout='90s';

-- Metadata is private: internal client classification is never exposed by OT/report RPCs.
create table public.plan_contactos (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 nombre text not null check(length(btrim(nombre)) between 1 and 160),
 telefono text,correo text,activo boolean not null default true,
 creado_por uuid references auth.users(id),creado_en timestamptz not null default now(),actualizado_en timestamptz not null default now(),
 unique(tenant_id,id)
);
create table public.plan_directorio_perfiles (
 tipo text not null check(tipo in ('empresa','obra','cliente','contratista','contacto')),
 id uuid not null,tenant_id uuid not null references public.tenants(id),codigo bigint generated always as identity,
 empresa_id uuid references public.tenants(id),obra_id uuid references public.proyectos(id),
 cliente_id uuid references public.plan_clientes(id),contratista_id uuid references public.plan_contratistas(id),contacto_id uuid references public.plan_contactos(id),
 datos jsonb not null default '{}',completa boolean not null default false,activo boolean not null default true,
 creado_por uuid references auth.users(id),creado_en timestamptz not null default now(),
 actualizado_por uuid references auth.users(id),actualizado_en timestamptz not null default now(),
 primary key(tipo,id),check(num_nonnulls(empresa_id,obra_id,cliente_id,contratista_id,contacto_id)=1)
);
create table public.plan_contacto_vinculos (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 contacto_id uuid not null, empresa_id uuid references public.tenants(id),obra_id uuid references public.proyectos(id),
 cliente_id uuid references public.plan_clientes(id),contratista_id uuid references public.plan_contratistas(id),ubicacion_id uuid references public.plan_cliente_ubicaciones(id),
 funcion text not null check(length(btrim(funcion)) between 1 and 160),
 activo boolean not null default true,principal boolean not null default false,
 actualizado_por uuid references auth.users(id),actualizado_en timestamptz not null default now(),
 foreign key(tenant_id,contacto_id) references public.plan_contactos(tenant_id,id),
 check(num_nonnulls(empresa_id,obra_id,cliente_id,contratista_id,ubicacion_id)=1)
);
create unique index plan_contacto_vinculo_unico on public.plan_contacto_vinculos(contacto_id,coalesce(empresa_id,obra_id,cliente_id,contratista_id,ubicacion_id));
create index plan_contacto_vinculos_tenant on public.plan_contacto_vinculos(tenant_id);
create table public.plan_directorio_eventos (
 id bigint generated always as identity primary key,tipo text not null,ficha_id uuid not null,
 tenant_id uuid not null,actor uuid references auth.users(id),fecha timestamptz not null default now(),datos jsonb not null
);
alter table public.plan_contactos enable row level security;
alter table public.plan_directorio_perfiles enable row level security;
alter table public.plan_contacto_vinculos enable row level security;
alter table public.plan_directorio_eventos enable row level security;
revoke all on public.plan_contactos,public.plan_directorio_perfiles,public.plan_contacto_vinculos,public.plan_directorio_eventos from public,anon,authenticated;

-- Preserve legacy work-contact IDs. No automatic merging by name.
insert into public.plan_contactos(id,tenant_id,nombre,telefono,correo,activo)
 select c.id,p.tenant_id,c.nombre,c.telefono,c.correo,c.activo from public.plan_obra_contactos c join public.proyectos p on p.id=c.obra_id;
alter table public.plan_obra_contactos add column contacto_id uuid references public.plan_contactos(id);
update public.plan_obra_contactos set contacto_id=id where contacto_id is null;
insert into public.plan_contacto_vinculos(tenant_id,contacto_id,obra_id,funcion,activo)
 select p.tenant_id,c.contacto_id,c.obra_id,coalesce(nullif(c.cargo,''),'Contacto de obra'),c.activo from public.plan_obra_contactos c join public.proyectos p on p.id=c.obra_id;

create function public.plan_directorio_entidad_tenant(p_tipo text,p_id uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
 return case p_tipo
  when 'empresa' then (select id from public.tenants where id=p_id)
  when 'obra' then (select tenant_id from public.proyectos where id=p_id and proyecto_padre_id is null and deleted_at is null)
  when 'cliente' then (select tenant_id from public.plan_clientes where id=p_id)
  when 'contratista' then (select tenant_id from public.plan_contratistas where id=p_id)
  when 'contacto' then (select tenant_id from public.plan_contactos where id=p_id)
  when 'ubicacion' then (select tenant_id from public.plan_cliente_ubicaciones where id=p_id)
  else null end;
end $$;

create function public.plan_vincular_contacto(p_tenant uuid,p_contacto uuid,p_tipo text,p_entidad uuid,p_funcion text,p_activo boolean default true,p_principal boolean default false) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v uuid;c public.plan_contactos;col text;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para administrar contactos' using errcode='42501';end if;
 if public.plan_directorio_entidad_tenant('contacto',p_contacto) is distinct from p_tenant or public.plan_directorio_entidad_tenant(p_tipo,p_entidad) is distinct from p_tenant then raise exception 'El contacto y su vínculo deben pertenecer a la misma empresa' using errcode='42501';end if;
 col:=case p_tipo when 'empresa' then 'empresa_id' when 'obra' then 'obra_id' when 'cliente' then 'cliente_id' when 'contratista' then 'contratista_id' when 'ubicacion' then 'ubicacion_id' else null end;
 if col is null or nullif(btrim(p_funcion),'') is null or length(p_funcion)>160 then raise exception 'Elegí una entidad y la función del contacto' using errcode='22023';end if;
 select * into c from public.plan_contactos where id=p_contacto for update;
 if p_activo and not c.activo and not exists(select 1 from public.plan_contacto_vinculos where contacto_id=p_contacto and coalesce(empresa_id,obra_id,cliente_id,contratista_id,ubicacion_id)=p_entidad and activo) then raise exception 'Seleccioná un contacto activo' using errcode='22023';end if;
 if p_activo and exists(select 1 from public.plan_directorio_perfiles where tipo=p_tipo and id=p_entidad and not activo)
 and not exists(select 1 from public.plan_contacto_vinculos where contacto_id=p_contacto and coalesce(empresa_id,obra_id,cliente_id,contratista_id,ubicacion_id)=p_entidad and activo) then
  raise exception 'La ficha está inactiva para nuevos vínculos' using errcode='22023';end if;
 -- Lock the target as well: concurrent primary selections must serialize.
 perform 1 from public.tenants where id=p_tenant for update;
 if p_principal and p_activo then execute format('update public.plan_contacto_vinculos set principal=false where %I=$1 and principal',col) using p_entidad;end if;
 execute format('select id from public.plan_contacto_vinculos where contacto_id=$1 and %I=$2',col) into v using p_contacto,p_entidad;
 if v is null then
  v:=gen_random_uuid();execute format('insert into public.plan_contacto_vinculos(id,tenant_id,contacto_id,%I,funcion,activo,principal,actualizado_por) values($1,$2,$3,$4,$5,$6,$7,$8)',col) using v,p_tenant,p_contacto,p_entidad,btrim(p_funcion),p_activo,p_principal,auth.uid();
 else update public.plan_contacto_vinculos set funcion=btrim(p_funcion),activo=p_activo,principal=p_principal,actualizado_por=auth.uid(),actualizado_en=now() where id=v;end if;
 if p_tipo='obra' then
  if exists(select 1 from public.plan_obra_contactos where obra_id=p_entidad and contacto_id=p_contacto) then
   update public.plan_obra_contactos set nombre=c.nombre,cargo=btrim(p_funcion),telefono=c.telefono,correo=c.correo,activo=p_activo and c.activo,actualizado_en=now() where obra_id=p_entidad and contacto_id=p_contacto;
  else insert into public.plan_obra_contactos(obra_id,contacto_id,nombre,cargo,telefono,correo,activo) values(p_entidad,p_contacto,c.nombre,btrim(p_funcion),c.telefono,c.correo,p_activo and c.activo);end if;
 end if;
 return v;
end $$;

-- Scoped legacy contact edits remain supported, but cannot alter a shared person
-- outside the supervisor's scope. Creator master edits update all work copies.
create function public.plan_contacto_legado_sync() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;
begin
 if pg_trigger_depth()>1 then return new;end if;
 select tenant_id into tid from public.proyectos where id=new.obra_id;
 if new.contacto_id is null then new.contacto_id:=gen_random_uuid();end if;
 if not public.plan_es_creador() and exists(select 1 from public.plan_contacto_vinculos where contacto_id=new.contacto_id and (obra_id is distinct from new.obra_id or cliente_id is not null or empresa_id is not null or contratista_id is not null or ubicacion_id is not null)) then
  raise exception 'Este contacto es compartido. Su ficha se edita desde Administración con permiso.' using errcode='42501';end if;
 insert into public.plan_contactos(id,tenant_id,nombre,telefono,correo,activo,creado_por) values(new.contacto_id,tid,new.nombre,new.telefono,new.correo,new.activo,auth.uid())
 on conflict(id) do update set nombre=excluded.nombre,telefono=excluded.telefono,correo=excluded.correo,actualizado_en=now();
 -- Availability of a work link must not deactivate the shared person.
 update public.plan_obra_contactos set nombre=new.nombre,telefono=new.telefono,correo=new.correo,actualizado_en=now()
 where contacto_id=new.contacto_id and id<>new.id;
 insert into public.plan_contacto_vinculos(tenant_id,contacto_id,obra_id,funcion,activo,actualizado_por) values(tid,new.contacto_id,new.obra_id,coalesce(nullif(new.cargo,''),'Contacto de obra'),new.activo,auth.uid())
 on conflict(contacto_id,coalesce(empresa_id,obra_id,cliente_id,contratista_id,ubicacion_id)) do update set funcion=excluded.funcion,activo=case when (select activo from public.plan_contactos where id=excluded.contacto_id) then excluded.activo else plan_contacto_vinculos.activo end,actualizado_por=auth.uid(),actualizado_en=now();
 return new;
end $$;
create trigger plan_contacto_legado_sync before insert or update of nombre,cargo,telefono,correo,activo on public.plan_obra_contactos for each row execute function public.plan_contacto_legado_sync();
create function public.plan_contacto_maestro_sync() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if pg_trigger_depth()>1 then return new;end if;
 if not new.activo then
  update public.plan_directorio_perfiles set completa=false,actualizado_en=now()
  where tipo in ('empresa','obra','contratista') and id in (select coalesce(empresa_id,obra_id,contratista_id) from public.plan_contacto_vinculos where contacto_id=new.id and principal);
 end if;
 update public.plan_obra_contactos c set nombre=new.nombre,telefono=new.telefono,correo=new.correo,activo=new.activo and v.activo,actualizado_en=now()
 from public.plan_contacto_vinculos v where c.contacto_id=new.id and v.contacto_id=new.id and v.obra_id=c.obra_id;
 return new;
end $$;
create trigger plan_contacto_maestro_sync after update of nombre,telefono,correo,activo on public.plan_contactos for each row execute function public.plan_contacto_maestro_sync();

create function public.plan_directorio_listar(p_tipo text,p_tenant uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para administrar directorios' using errcode='42501';end if;
 if p_tipo not in ('empresa','obra','cliente','contratista','contacto') then raise exception 'Tipo inválido' using errcode='22023';end if;
 with base as (
  select t.id,t.id tenant_id,jsonb_build_object('nombre',t.nombre,'activo',t.activo) datos from public.tenants t where p_tipo='empresa'
  union all select p.id,p.tenant_id,jsonb_build_object('nombre',p.nombre,'direccion',f.direccion,'color',f.color,'activo',true) from public.proyectos p left join public.plan_obra_fichas f on f.obra_id=p.id where p_tipo='obra' and p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null
  union all select c.id,c.tenant_id,to_jsonb(c)-'creado_por' from public.plan_clientes c where p_tipo='cliente' and c.tenant_id=p_tenant
  union all select k.id,k.tenant_id,coalesce(to_jsonb(f)-'contratista_id','{}')||jsonb_build_object('nombre',k.nombre,'activo',coalesce(f.activo,true)) from public.plan_contratistas k left join public.plan_contratista_fichas f on f.contratista_id=k.id where p_tipo='contratista' and k.tenant_id=p_tenant
  union all select c.id,c.tenant_id,to_jsonb(c)-'creado_por' from public.plan_contactos c where p_tipo='contacto' and c.tenant_id=p_tenant
 ) select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'tenant_id',b.tenant_id,
   'datos',coalesce(f.datos,'{}')||b.datos||jsonb_build_object('activo',case when p_tipo in ('empresa','obra') then coalesce(f.activo,(b.datos->>'activo')::boolean,true) else coalesce((b.datos->>'activo')::boolean,true) end),
   'completa',coalesce(f.completa,false),'codigo',f.codigo,'actualizado_en',f.actualizado_en,
   'vinculos',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('contacto_nombre',c.nombre,'telefono',c.telefono,'correo',c.correo,'contacto_activo',c.activo)) from public.plan_contacto_vinculos v join public.plan_contactos c on c.id=v.contacto_id where case when p_tipo='contacto' then v.contacto_id=b.id else coalesce(v.empresa_id,v.obra_id,v.cliente_id,v.contratista_id)=b.id end),'[]')) order by b.datos->>'nombre'),'[]') into result from base b left join public.plan_directorio_perfiles f on f.tipo=p_tipo and f.id=b.id;
 return result;
end $$;

create function public.plan_directorio_guardar(p_tipo text,p_tenant uuid,p_id uuid,p_datos jsonb,p_completa boolean default true) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v uuid:=p_id;tid uuid:=p_tenant;d jsonb:=p_datos;kv record;required text[]:=array['nombre'];k text;c public.plan_contactos;contact uuid;func text;old_active boolean;cl public.plan_clientes;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para editar fichas maestras' using errcode='42501';end if;
 if p_tipo not in ('empresa','obra','cliente','contratista','contacto') or jsonb_typeof(d) is distinct from 'object' or length(d::text)>24000 then raise exception 'Ficha inválida' using errcode='22023';end if;
 for kv in select * from jsonb_each(d) loop
  if kv.key not in ('nombre','tipo','razon_social','identificacion','rubro','direccion','ciudad','pais','telefono','correo','contacto','contacto_principal_id','funcion_contacto','color','barrio','mapa','acceso','horarios','descripcion','whatsapp','web','direccion_operativa','observaciones','canal','potencialmente_conflictivo','especialidad','especialidades','zonas','telefono_alternativo','correo_alternativo','activo','vinculo_tipo','vinculo_id','funcion') or jsonb_typeof(kv.value) not in ('string','boolean','null') or length(kv.value::text)>4002 then raise exception 'Campo no permitido o demasiado largo: %',kv.key using errcode='22023';end if;
 end loop;
 if jsonb_typeof(d->'activo') is distinct from 'boolean' then raise exception 'Elegí Activo o Inactivo' using errcode='22023';end if;
 if nullif(btrim(d->>'nombre'),'') is null or length(d->>'nombre')>160 then raise exception 'Revisá el nombre de la ficha' using errcode='22023';end if;
 if p_tipo<>'empresa' and not exists(select 1 from public.tenants where id=tid) then raise exception 'Empresa no disponible' using errcode='42501';end if;
 if v is not null and public.plan_directorio_entidad_tenant(p_tipo,v) is distinct from (case when p_tipo='empresa' then v else tid end) then raise exception 'La ficha no pertenece a esta empresa' using errcode='42501';end if;
 if p_tipo='empresa' and v is not null and tid is distinct from v then raise exception 'Seleccioná esta empresa antes de editarla' using errcode='42501';end if;
 if v is null and p_tipo<>'empresa' and exists(select 1 from public.plan_directorio_perfiles where tipo='empresa' and id=tid and not activo) then raise exception 'La empresa está inactiva. Reactivala antes de crear nuevas fichas.' using errcode='22023';end if;
 foreach k in array array['correo','correo_alternativo'] loop
  if nullif(btrim(d->>k),'') is not null and d->>k !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Revisá el correo' using errcode='22023';end if;
 end loop;
 if p_tipo='cliente' and d ? 'potencialmente_conflictivo' and jsonb_typeof(d->'potencialmente_conflictivo') not in ('boolean','null') then raise exception 'Elegí Sí o No en potencialmente conflictivo' using errcode='22023';end if;
 if (p_tipo='cliente' and d->>'tipo' not in ('persona','empresa')) or (p_tipo='contratista' and d->>'tipo' not in ('independiente','empresa')) then raise exception 'Tipo de persona inválido' using errcode='22023';end if;
 if p_tipo='empresa' then required:=required||array['razon_social','identificacion','rubro','direccion','ciudad','pais','telefono','correo','contacto_principal_id','funcion_contacto'];
 elsif p_tipo='obra' then required:=required||array['tipo','direccion','ciudad','color','contacto_principal_id','funcion_contacto'];
 elsif p_tipo='cliente' then required:=required||array['tipo'];if d->>'tipo'='empresa' then required:=required||array['razon_social','identificacion'];end if;
 elsif p_tipo='contratista' then required:=required||array['tipo','identificacion','especialidad','contacto_principal_id','funcion_contacto','telefono','correo'];if d->>'tipo'='empresa' then required:=required||array['razon_social'];end if;
 elsif p_tipo='contacto' then required:=required||array['vinculo_tipo','vinculo_id','funcion'];end if;
 if coalesce(p_completa,true) then
  foreach k in array required loop if nullif(btrim(d->>k),'') is null then raise exception 'Falta completar: %',k using errcode='22023';end if;end loop;
  if p_tipo in ('cliente','contacto') and nullif(btrim(d->>'telefono'),'') is null and nullif(btrim(d->>'correo'),'') is null then raise exception 'Completá al menos teléfono o correo' using errcode='22023';end if;
  if p_tipo='cliente' and jsonb_typeof(d->'potencialmente_conflictivo') is distinct from 'boolean' then raise exception 'Elegí Sí o No en potencialmente conflictivo' using errcode='22023';end if;
 end if;
 if nullif(d->>'contacto_principal_id','') is not null then
  if p_tipo='empresa' and v is null then raise exception 'Guardá primero la empresa pendiente y luego vinculá su contacto' using errcode='22023';end if;
  contact:=(d->>'contacto_principal_id')::uuid;select * into c from public.plan_contactos where id=contact and tenant_id=tid;
  if c.id is null or not c.activo or nullif(btrim(d->>'funcion_contacto'),'') is null then raise exception 'Revisá el contacto principal y su función' using errcode='22023';end if;
  if p_tipo='obra' and p_completa and nullif(c.telefono,'') is null and nullif(c.correo,'') is null then raise exception 'El contacto de obra debe tener teléfono o correo' using errcode='22023';end if;
  d:=d||jsonb_build_object('contacto',c.nombre);
 end if;
 if p_tipo='empresa' then
  -- Business availability does not revoke existing authentication or permissions.
  select activo into old_active from public.tenants where id=v;
  v:=public.plan_admin_empresa(d->>'nombre',v,coalesce(old_active,true));tid:=v;
 elsif p_tipo='obra' then v:=public.plan_guardar_ficha_obra(tid,v,d->>'nombre',d->>'direccion',coalesce(nullif(d->>'color',''),'#3B82F6'));
 elsif p_tipo='cliente' then select * into cl from public.plan_guardar_cliente(tid,v,d->>'nombre',d->>'identificacion',d->>'contacto',d->>'telefono',d->>'correo',d->>'direccion',(d->>'activo')::boolean);v:=cl.id;
 elsif p_tipo='contratista' then
  if v is null and exists(select 1 from public.plan_contratistas where tenant_id=tid and nombre_clave=lower(btrim(d->>'nombre'))) then raise exception 'Ya existe un contratista con ese nombre. Abrí su ficha para editar.' using errcode='23505';end if;
  v:=public.plan_guardar_contratista_ficha(tid,v,d->>'nombre',d->>'identificacion',d->>'contacto',d->>'telefono',d->>'correo',d->>'direccion',(d->>'activo')::boolean);
 else
  if v is null then insert into public.plan_contactos(tenant_id,nombre,telefono,correo,activo,creado_por) values(tid,btrim(d->>'nombre'),nullif(btrim(d->>'telefono'),''),nullif(btrim(d->>'correo'),''),(d->>'activo')::boolean,auth.uid()) returning id into v;
  else update public.plan_contactos set nombre=btrim(d->>'nombre'),telefono=nullif(btrim(d->>'telefono'),''),correo=nullif(btrim(d->>'correo'),''),activo=(d->>'activo')::boolean,actualizado_en=now() where id=v;end if;
  if nullif(d->>'vinculo_id','') is not null then perform public.plan_vincular_contacto(tid,v,d->>'vinculo_tipo',(d->>'vinculo_id')::uuid,d->>'funcion',coalesce((select activo from public.plan_contacto_vinculos where contacto_id=v and coalesce(empresa_id,obra_id,cliente_id,contratista_id,ubicacion_id)=(d->>'vinculo_id')::uuid),true));end if;
 end if;
 if contact is not null then perform public.plan_vincular_contacto(tid,contact,p_tipo,v,d->>'funcion_contacto',true,true);
 elsif p_tipo<>'contacto' then update public.plan_contacto_vinculos set principal=false where coalesce(empresa_id,obra_id,cliente_id,contratista_id)=v and principal;end if;
 insert into public.plan_directorio_perfiles(tipo,id,tenant_id,empresa_id,obra_id,cliente_id,contratista_id,contacto_id,datos,completa,activo,creado_por,actualizado_por)
 values(p_tipo,v,tid,case when p_tipo='empresa' then v end,case when p_tipo='obra' then v end,case when p_tipo='cliente' then v end,case when p_tipo='contratista' then v end,case when p_tipo='contacto' then v end,d,p_completa,(d->>'activo')::boolean,auth.uid(),auth.uid())
 on conflict(tipo,id) do update set datos=excluded.datos,completa=excluded.completa,activo=excluded.activo,actualizado_por=auth.uid(),actualizado_en=now();
 insert into public.plan_directorio_eventos(tipo,ficha_id,tenant_id,actor,datos) values(p_tipo,v,tid,auth.uid(),d||jsonb_build_object('completa',p_completa));
 return v;
end $$;

-- Dependencies in polymorphic links are protected by typed foreign keys above.
alter function public.plan_directorio_bloqueo(text,uuid) rename to plan_directorio_bloqueo_base;
create function public.plan_directorio_bloqueo(p_tipo text,p_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare target regclass;c record;n bigint;es_ficha boolean;nombre text;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para administrar directorios' using errcode='42501';end if;
 target:=case p_tipo when 'empresa' then 'public.tenants'::regclass when 'obra' then 'public.proyectos'::regclass when 'cliente' then 'public.plan_clientes'::regclass when 'contratista' then 'public.plan_contratistas'::regclass when 'contacto' then 'public.plan_contactos'::regclass end;
 if target is null then raise exception 'Tipo inválido' using errcode='22023';end if;
 execute format('select count(*) from %s where id=$1',target) into n using p_id;if n=0 then return 'Ficha no disponible';end if;
 if p_tipo='obra' then select es_ficha_obra and proyecto_padre_id is null and deleted_at is null into es_ficha from public.proyectos where id=p_id;if not coalesce(es_ficha,false) then return 'Esta obra contiene un plano. Administrá el proyecto desde Proyectos.';end if;end if;
 for c in select con.conrelid::regclass tabla,a.attname columna from pg_constraint con cross join lateral unnest(con.conkey,con.confkey) k(local_col,foreign_col) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.local_col join pg_attribute b on b.attrelid=con.confrelid and b.attnum=k.foreign_col where con.contype='f' and con.confrelid=target and b.attname='id' and con.conrelid not in ('public.plan_obra_fichas'::regclass,'public.plan_contratista_fichas'::regclass,'public.plan_directorio_perfiles'::regclass)
 loop execute format('select count(*) from %s where %I=$1',c.tabla,c.columna) into n using p_id;if n>0 then return 'Tiene registros asociados. Conservá la ficha y su historial.';end if;end loop;
 if p_tipo='contratista' then select k.nombre into nombre from public.plan_contratistas k where id=p_id;select count(*) into n from public.ordenes o join public.proyectos p on p.id=o.proyecto_id join public.plan_contratistas k on k.tenant_id=p.tenant_id and k.id=p_id where nombre=any(coalesce(o.contratistas,'{}'));if n>0 then return 'El contratista está registrado en órdenes de trabajo.';end if;end if;
 return null;
end $$;
create or replace function public.plan_eliminar_directorio(p_tipo text,p_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target regclass;reason text;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para eliminar registros' using errcode='42501';end if;
 target:=case p_tipo when 'empresa' then 'public.tenants'::regclass when 'obra' then 'public.proyectos'::regclass when 'cliente' then 'public.plan_clientes'::regclass when 'contratista' then 'public.plan_contratistas'::regclass when 'contacto' then 'public.plan_contactos'::regclass end;
 if target is null then raise exception 'Tipo inválido' using errcode='22023';end if;
 execute format('select id from %s where id=$1 for update',target) using p_id;
 reason:=public.plan_directorio_bloqueo(p_tipo,p_id);if reason is not null then raise exception '%',reason using errcode='23503';end if;
 delete from public.plan_directorio_perfiles where tipo=p_tipo and id=p_id;
 delete from public.plan_directorio_fotos where tipo=p_tipo and ficha_id=p_id;
 if p_tipo='contratista' then delete from public.plan_contratista_fichas where contratista_id=p_id;end if;
 if p_tipo='obra' then update public.proyectos set deleted_at=now(),updated_at=now() where id=p_id;else execute format('delete from %s where id=$1',target) using p_id;end if;
end $$;

-- Logos/contact portraits use the same private photo service.
alter table public.plan_directorio_fotos drop constraint plan_directorio_fotos_tipo_check;
alter table public.plan_directorio_fotos add constraint plan_directorio_fotos_tipo_check check(tipo in ('empresa','obra','cliente','contratista','contacto'));
alter function public.plan_directorio_acceso(text,uuid) rename to plan_directorio_acceso_base;
create function public.plan_directorio_acceso(p_tipo text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
 if p_tipo in ('empresa','contacto') then return auth.uid() is not null and public.plan_es_creador() and public.plan_directorio_entidad_tenant(p_tipo,p_id) is not null;end if;
 return public.plan_directorio_acceso_base(p_tipo,p_id);
end $$;
create or replace function public.plan_directorio_archivo_permitido(p_name text,p_escritura boolean default false) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare kind text;fid uuid;
begin
 if p_name is null or p_name !~ '^(empresa|obra|cliente|contratista|contacto)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false;end if;
 kind:=split_part(p_name,'/',1);fid:=split_part(p_name,'/',2)::uuid;if not public.plan_directorio_acceso(kind,fid) then return false;end if;
 return public.plan_es_creador() or (not p_escritura and exists(select 1 from public.plan_directorio_fotos where tipo=kind and ficha_id=fid and file_path=p_name));
end $$;

-- Availability blocks new work, not consultation or updates of existing OTs.
create function public.plan_directorio_disponibilidad() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;root uuid;
begin
 if tg_table_name='plan_contactos' and exists(select 1 from public.plan_contactos where id=new.id) then return new;end if;
 if tg_table_name='proyectos' then tid:=new.tenant_id;root:=new.proyecto_padre_id;
 elsif tg_table_name not in ('ordenes','plan_cliente_ubicaciones') then tid:=new.tenant_id;
 else select p.tenant_id,coalesce(p.proyecto_padre_id,p.id) into tid,root from public.proyectos p where p.id=new.proyecto_id;
  if tg_table_name='plan_cliente_ubicaciones' then
   tid:=new.tenant_id;
   if tg_op='INSERT' and exists(select 1 from public.plan_clientes where id=new.cliente_id and not activo) then raise exception 'El cliente está inactivo para nuevas ubicaciones' using errcode='22023';end if;
  end if;
  if tg_op='UPDATE' and new.proyecto_id is not distinct from old.proyecto_id then return new;end if;
 end if;
 if exists(select 1 from public.plan_directorio_perfiles where (tipo='empresa' and id=tid or tipo='obra' and id=root) and not activo) then raise exception 'La empresa o la obra está inactiva para nuevos registros' using errcode='22023';end if;
 return new;
end $$;
create trigger plan_nueva_obra_disponible before insert on public.proyectos for each row execute function public.plan_directorio_disponibilidad();
create trigger plan_nueva_ot_disponible before insert or update of proyecto_id on public.ordenes for each row execute function public.plan_directorio_disponibilidad();
create trigger plan_nuevo_cliente_disponible before insert on public.plan_clientes for each row execute function public.plan_directorio_disponibilidad();
create trigger plan_nuevo_contratista_disponible before insert on public.plan_contratistas for each row execute function public.plan_directorio_disponibilidad();
create trigger plan_nuevo_contacto_disponible before insert on public.plan_contactos for each row execute function public.plan_directorio_disponibilidad();
create trigger plan_nueva_ubicacion_disponible before insert or update of proyecto_id on public.plan_cliente_ubicaciones for each row execute function public.plan_directorio_disponibilidad();

revoke all on function public.plan_directorio_entidad_tenant(text,uuid),public.plan_vincular_contacto(uuid,uuid,text,uuid,text,boolean,boolean),public.plan_contacto_legado_sync(),public.plan_contacto_maestro_sync(),public.plan_directorio_listar(text,uuid),public.plan_directorio_guardar(text,uuid,uuid,jsonb,boolean),public.plan_directorio_bloqueo(text,uuid),public.plan_directorio_acceso(text,uuid),public.plan_directorio_disponibilidad() from public,anon,authenticated;
grant execute on function public.plan_vincular_contacto(uuid,uuid,text,uuid,text,boolean,boolean),public.plan_directorio_listar(text,uuid),public.plan_directorio_guardar(text,uuid,uuid,jsonb,boolean),public.plan_directorio_bloqueo(text,uuid) to authenticated;

-- Extend locations without replacing their IDs or changing existing OT links.
alter table public.plan_cliente_ubicaciones add column datos_adicionales jsonb not null default '{}';
alter table public.plan_cliente_ubicaciones add column actualizado_por uuid references auth.users(id);
create function public.plan_directorio_ubicacion_guardar(p_tenant uuid,p_cliente uuid,p_id uuid,p_datos jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare u public.plan_cliente_ubicaciones;k record;d jsonb:=p_datos;contact uuid;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para editar ubicaciones' using errcode='42501';end if;
 if jsonb_typeof(d) is distinct from 'object' or length(d::text)>14000 then raise exception 'Ubicación inválida' using errcode='22023';end if;
 for k in select * from jsonb_each(d) loop
  if k.key not in ('proyecto_id','tipo_inmueble','nombre_obra','direccion','piso','unidad','sector','torre','horarios','acceso','contacto_principal_id','funcion_contacto','activo') or jsonb_typeof(k.value) not in ('string','boolean','null') or length(k.value::text)>4002 then raise exception 'Campo de ubicación inválido' using errcode='22023';end if;
 end loop;
 if nullif(btrim(d->>'direccion'),'') is null or jsonb_typeof(d->'activo') is distinct from 'boolean' then raise exception 'Completá la dirección y el estado' using errcode='22023';end if;
 if nullif(d->>'contacto_principal_id','') is not null then
  contact:=(d->>'contacto_principal_id')::uuid;
  if not exists(select 1 from public.plan_contactos where id=contact and tenant_id=p_tenant and activo) or nullif(btrim(d->>'funcion_contacto'),'') is null then raise exception 'Revisá el contacto y su función' using errcode='22023';end if;
 end if;
 select * into u from public.plan_guardar_cliente_ubicacion(p_tenant,p_id,p_cliente,nullif(d->>'proyecto_id','')::uuid,d->>'tipo_inmueble',d->>'nombre_obra',d->>'direccion',d->>'piso',d->>'unidad',d->>'sector',(d->>'activo')::boolean);
 update public.plan_cliente_ubicaciones set datos_adicionales=d-ARRAY['proyecto_id','tipo_inmueble','nombre_obra','direccion','piso','unidad','sector','activo'],actualizado_por=auth.uid() where id=u.id;
 if contact is not null then perform public.plan_vincular_contacto(p_tenant,contact,'ubicacion',u.id,d->>'funcion_contacto',true,true);end if;
 insert into public.plan_directorio_eventos(tipo,ficha_id,tenant_id,actor,datos) values('ubicacion',u.id,p_tenant,auth.uid(),d);
 return u.id;
end $$;
revoke all on function public.plan_directorio_ubicacion_guardar(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plan_directorio_ubicacion_guardar(uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
