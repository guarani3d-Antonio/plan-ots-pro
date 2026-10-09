-- Preserve legacy name limits and validate new plan-to-work associations.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.plan_directorio_guardar(p_tipo text,p_tenant uuid,p_id uuid,p_datos jsonb,p_completa boolean default true) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v uuid:=p_id;tid uuid:=p_tenant;d jsonb:=p_datos;kv record;required text[]:=array['nombre'];k text;c public.plan_contactos;contact uuid;func text;old_active boolean;cl public.plan_clientes;
begin
 if auth.uid() is null or not public.plan_es_creador() then raise exception 'Sin permiso para editar fichas maestras' using errcode='42501';end if;
 if p_tipo not in ('empresa','obra','cliente','contratista','contacto') or jsonb_typeof(d) is distinct from 'object' or length(d::text)>24000 then raise exception 'Ficha inválida' using errcode='22023';end if;
 for kv in select * from jsonb_each(d) loop
  if kv.key not in ('nombre','tipo','razon_social','identificacion','rubro','direccion','ciudad','pais','telefono','correo','contacto','contacto_principal_id','funcion_contacto','color','barrio','mapa','acceso','horarios','descripcion','whatsapp','web','direccion_operativa','observaciones','canal','potencialmente_conflictivo','especialidad','especialidades','zonas','telefono_alternativo','correo_alternativo','activo','vinculo_tipo','vinculo_id','funcion') or jsonb_typeof(kv.value) not in ('string','boolean','null') or length(kv.value::text)>4002 then raise exception 'Campo no permitido o demasiado largo: %',kv.key using errcode='22023';end if;
 end loop;
 if jsonb_typeof(d->'activo') is distinct from 'boolean' then raise exception 'Elegí Activo o Inactivo' using errcode='22023';end if;
 if nullif(btrim(d->>'nombre'),'') is null or length(d->>'nombre')>(case when p_tipo in ('empresa','obra') then 180 else 160 end) then raise exception 'Revisá el nombre de la ficha' using errcode='22023';end if;
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

create or replace function public.plan_directorio_disponibilidad() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;root uuid;
begin
 if tg_table_name='plan_contactos' and exists(select 1 from public.plan_contactos where id=new.id) then return new;end if;
 if tg_table_name='proyectos' then
  if tg_op='UPDATE' and new.proyecto_padre_id is not distinct from old.proyecto_padre_id then return new;end if;
  tid:=new.tenant_id;root:=new.proyecto_padre_id;
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
drop trigger plan_nueva_obra_disponible on public.proyectos;
create trigger plan_nueva_obra_disponible before insert or update of proyecto_padre_id on public.proyectos for each row execute function public.plan_directorio_disponibilidad();
commit;
