begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Backups initially belong exclusively to the platform Creator. No role inheritance.
create table public.plan_respaldo_config (
 id boolean primary key default true check(id), activo boolean not null default false,
 intervalo_horas integer not null default 24 check(intervalo_horas in (6,12,24)),
 siguiente_en timestamptz, destino text not null default 'pendiente',
 max_bytes bigint not null default 8000000000 check(max_bytes between 1000000 and 8000000000),
 conservacion jsonb not null default '{"diarias":7,"semanales":4,"mensuales":3}',
 actualizado_en timestamptz not null default now()
);
insert into public.plan_respaldo_config(id) values(true);
create table public.plan_respaldos (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),
 solicitado_por uuid references auth.users(id), solicitud_id uuid not null unique,
 creado_en timestamptz not null default now(), corte_en timestamptz,
 estado text not null default 'pendiente' check(estado in ('pendiente','procesando','creada','incompleta','error')),
 tarea text not null default 'crear' check(tarea in ('crear','verificar')),
 lease uuid, lease_hasta timestamptz, intentos integer not null default 0,
 paquete_path text, paquete_sha256 text, bytes bigint, objetos integer, filas bigint,
 integridad_en timestamptz, recuperacion_en timestamptz, informe jsonb,
 error text, terminado_en timestamptz,
 check(bytes is null or bytes>=0),check(objetos is null or objetos>=0),
 check(estado<>'creada' or (paquete_path is not null and paquete_sha256 ~ '^[a-f0-9]{64}$' and bytes>0 and integridad_en is not null))
);
create index plan_respaldos_pendientes on public.plan_respaldos(creado_en) where estado in ('pendiente','procesando');
alter table public.plan_respaldos enable row level security;
alter table public.plan_respaldo_config enable row level security;
revoke all on public.plan_respaldos,public.plan_respaldo_config from public,anon,authenticated;
grant select on public.plan_respaldos,public.plan_respaldo_config to authenticated;
grant all on public.plan_respaldos,public.plan_respaldo_config to service_role;
create policy respaldo_creador on public.plan_respaldos for select to authenticated using(public.plan_es_creador());
create policy respaldo_config_creador on public.plan_respaldo_config for select to authenticated using(public.plan_es_creador());

create function public.plan_respaldo_solicitar(p_tenant uuid,p_solicitud uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v uuid;begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Solo el Creador puede administrar respaldos' using errcode='42501';end if;
 if not exists(select 1 from public.plan_respaldo_config where destino='r2_verificado') then raise exception 'Conectá y verificá R2 antes de crear copias' using errcode='22023';end if;
 if p_solicitud is null then raise exception 'Falta identificador de solicitud' using errcode='22023';end if;
 if p_tenant is not null and not exists(select 1 from public.tenants where id=p_tenant) then raise exception 'Empresa no encontrada' using errcode='22023';end if;
 insert into public.plan_respaldos(tenant_id,solicitado_por,solicitud_id) values(p_tenant,auth.uid(),p_solicitud) on conflict(solicitud_id) do nothing returning id into v;
 if v is null then select id into v from public.plan_respaldos where solicitud_id=p_solicitud and tenant_id is not distinct from p_tenant;end if;
 if v is null then raise exception 'La solicitud corresponde a otro alcance' using errcode='22023';end if;
 return v;
end$$;
create function public.plan_respaldo_verificar(p_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 update public.plan_respaldos set estado='pendiente',tarea='verificar',lease=null,lease_hasta=null,intentos=0,error=null
 where id=p_id and estado='creada';
 if not found then raise exception 'La copia no está disponible para verificar' using errcode='22023';end if;
end$$;
create function public.plan_respaldo_programar(p_activo boolean,p_horas integer) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_activo and not exists(select 1 from public.plan_respaldo_config where destino='r2_verificado') then raise exception 'Conectá y verificá el destino independiente antes de activar' using errcode='22023';end if;
 update public.plan_respaldo_config set activo=p_activo,intervalo_horas=p_horas,siguiente_en=now()+make_interval(hours=>p_horas),actualizado_en=now() where id;
end$$;
create function public.plan_respaldo_inventario() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare r record;v bigint;tables jsonb:='[]';begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not exists(select 1 from pg_inherits i where i.inhrelid=c.oid) order by c.relname loop
  execute format('select count(*) from public.%I',r.relname) into v;
  tables:=tables||jsonb_build_array(jsonb_build_object('nombre',r.relname,'filas',v,'columnas',(select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name=r.relname)));
 end loop;
 return jsonb_build_object('capturado_en',now(),'alcance','plataforma','tablas',tables,'buckets',
 (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select b.id,count(o.id) objetos,coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0) bytes,count(o.id) filter(where not coalesce((o.metadata->>'size') ~ '^[0-9]+$',false)) sin_tamano from storage.buckets b left join storage.objects o on o.bucket_id=b.id group by b.id) t));
end$$;
create function public.plan_respaldo_tomar() returns public.plan_respaldos
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v public.plan_respaldos;c public.plan_respaldo_config;begin
 select * into c from public.plan_respaldo_config where id for update;
 update public.plan_respaldos set estado='error',error='El servicio no completó el trabajo después de cinco intentos',lease=null,lease_hasta=null,terminado_en=now()
 where estado='procesando' and lease_hasta<now() and intentos>=5;
 -- One active job across instances also serializes the storage budget.
 if exists(select 1 from public.plan_respaldos where estado='procesando' and lease_hasta>=now()) then return null;end if;
 if c.activo and c.destino='r2_verificado' and c.siguiente_en<=now() then
   insert into public.plan_respaldos(solicitud_id) values(gen_random_uuid());
   update public.plan_respaldo_config set siguiente_en=now()+make_interval(hours=>c.intervalo_horas) where id;
 end if;
 select * into v from public.plan_respaldos where (estado='pendiente' or (estado='procesando' and lease_hasta<now())) and intentos<5 order by creado_en for update skip locked limit 1;
 if v.id is null then return null;end if;
 update public.plan_respaldos set estado='procesando',lease=gen_random_uuid(),lease_hasta=now()+interval '10 minutes',intentos=intentos+1,error=null where id=v.id returning * into v;
 return v;
end$$;
create function public.plan_respaldo_snapshot() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare r record;v jsonb;d jsonb:='{}';precise text;begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relname not in ('plan_respaldos','plan_respaldo_config') and not exists(select 1 from pg_inherits i where i.inhrelid=c.oid) order by c.relname loop
   -- Decimal and bigint columns travel as strings to avoid JavaScript rounding.
   select string_agg(format('%L,t.%I::text',a.attname,a.attname),',') into precise from pg_attribute a
   where a.attrelid=('public.'||quote_ident(r.relname))::regclass and a.attnum>0 and not a.attisdropped and a.atttypid in ('int8'::regtype,'numeric'::regtype);
   execute format('select coalesce(jsonb_agg(to_jsonb(t)%s),''[]''::jsonb) from public.%I t',case when precise is null then '' else '||jsonb_build_object('||precise||')' end,r.relname) into v;d:=d||jsonb_build_object(r.relname,v);
 end loop;
 return jsonb_build_object('corte_en',now(),'tablas',d,
 'storage',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from storage.objects o),
 'buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from storage.buckets b),
 'columnas',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public'),
 'relaciones',(select jsonb_agg(jsonb_build_object('restriccion',f.oid::text,'tabla',s.relname,'columna',a.attname,'padre',p.relname,'esquema_padre',pn.nspname,'clave',b.attname)) from pg_constraint f join pg_class s on s.oid=f.conrelid join pg_namespace n on n.oid=s.relnamespace join pg_class p on p.oid=f.confrelid join pg_namespace pn on pn.oid=p.relnamespace cross join lateral unnest(f.conkey,f.confkey) k(child,parent) join pg_attribute a on a.attrelid=s.oid and a.attnum=k.child join pg_attribute b on b.attrelid=p.oid and b.attnum=k.parent where f.contype='f' and n.nspname='public'));
end$$;
create function public.plan_respaldo_objeto(p_bucket text,p_path text) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$select to_jsonb(o) from storage.objects o where bucket_id=p_bucket and name=p_path$$;

revoke all on function public.plan_respaldo_solicitar(uuid,uuid),public.plan_respaldo_verificar(uuid),public.plan_respaldo_programar(boolean,integer),public.plan_respaldo_tomar(),public.plan_respaldo_snapshot(),public.plan_respaldo_objeto(text,text) from public,anon,authenticated;
revoke all on function public.plan_respaldo_inventario() from public,anon,authenticated;
grant execute on function public.plan_respaldo_inventario() to authenticated;
grant execute on function public.plan_respaldo_solicitar(uuid,uuid),public.plan_respaldo_verificar(uuid),public.plan_respaldo_programar(boolean,integer) to authenticated;
grant execute on function public.plan_respaldo_tomar(),public.plan_respaldo_snapshot(),public.plan_respaldo_objeto(text,text) to service_role;
commit;
