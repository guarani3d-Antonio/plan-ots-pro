begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
create table public.plan_presupuestos(
 id uuid primary key default gen_random_uuid(),codigo bigint generated always as identity unique,
 tenant_id uuid not null references public.tenants,proyecto_id uuid not null references public.proyectos,
 orden_id uuid not null references public.ordenes,contratista_id uuid not null references public.plan_contratistas,
 creado_por uuid not null references auth.users,creado_en timestamptz not null default now()
);
create table public.plan_presupuesto_versiones(
 id uuid primary key default gen_random_uuid(),presupuesto_id uuid not null references public.plan_presupuestos,
 version integer not null,datos jsonb not null,fuentes jsonb not null,moneda text not null check(moneda in ('PYG','USD')),
 base numeric not null,iva numeric not null,total numeric not null,contenido_sha256 text not null,
 creada_por uuid not null references auth.users,creada_en timestamptz not null default now(),
 solicitud_id uuid not null,solicitud_sha256 text not null,unique(presupuesto_id,version),unique(creada_por,solicitud_id)
);
create table public.plan_presupuesto_eventos(
 id uuid primary key default gen_random_uuid(),revision_id uuid not null references public.plan_presupuesto_versiones,
 estado text not null check(estado in ('Presentado','Adjudicado','No adjudicado')),fundamento text not null,
 actor uuid not null references auth.users,registrado_en timestamptz not null default now(),solicitud_id uuid not null,
 unique(actor,solicitud_id),unique(revision_id,estado)
);
create unique index plan_presupuesto_decision_unica on public.plan_presupuesto_eventos(revision_id) where estado in ('Adjudicado','No adjudicado');
create table public.plan_presupuesto_comprobantes(
 id uuid primary key default gen_random_uuid(),presupuesto_id uuid not null references public.plan_presupuestos,
 revision_id uuid not null references public.plan_presupuesto_versiones,referencia text not null,importe numeric not null check(importe>0),
 fecha date not null,vence date not null check(vence>=fecha),creado_por uuid not null references auth.users,
 creado_en timestamptz not null default now(),solicitud_id uuid not null,unique(presupuesto_id,referencia),unique(creado_por,solicitud_id)
);
create table public.plan_presupuesto_pagos(
 id uuid primary key default gen_random_uuid(),presupuesto_id uuid not null references public.plan_presupuestos,
 comprobante_id uuid references public.plan_presupuesto_comprobantes,importe numeric not null check(importe>=0),
 anticipo_aplicado numeric not null default 0 check(anticipo_aplicado>=0),referencia text not null,medio text not null,
 fecha date not null,creado_por uuid not null references auth.users,creado_en timestamptz not null default now(),solicitud_id uuid not null,
 check(importe+anticipo_aplicado>0),check(comprobante_id is not null or anticipo_aplicado=0),unique(creado_por,solicitud_id)
);
create table public.plan_presupuesto_firmas(
 id uuid primary key default gen_random_uuid(),revision_id uuid not null references public.plan_presupuesto_versiones,
 espacio_id uuid not null,rol text not null,contenido_sha256 text not null,imagen_png text not null,
 imagen_sha256 text not null,registrada_por uuid not null references auth.users,registrada_en timestamptz not null default now(),
 solicitud_id uuid not null,unique(revision_id,espacio_id),unique(registrada_por,solicitud_id)
);
alter table public.plan_presupuestos enable row level security;
alter table public.plan_presupuesto_versiones enable row level security;
alter table public.plan_presupuesto_eventos enable row level security;
alter table public.plan_presupuesto_comprobantes enable row level security;
alter table public.plan_presupuesto_pagos enable row level security;
alter table public.plan_presupuesto_firmas enable row level security;
revoke all on public.plan_presupuestos,public.plan_presupuesto_versiones,public.plan_presupuesto_eventos,public.plan_presupuesto_comprobantes,public.plan_presupuesto_pagos,public.plan_presupuesto_firmas from public,anon,authenticated;
grant select on public.plan_presupuestos,public.plan_presupuesto_versiones,public.plan_presupuesto_eventos,public.plan_presupuesto_comprobantes,public.plan_presupuesto_pagos,public.plan_presupuesto_firmas to service_role;

-- Only RPCs mutate these append-only records. Every operation checks the current work scope.
create function public.plan_comercio_orden(p_orden uuid,p_permiso text) returns public.ordenes
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes;
begin
 select * into o from public.ordenes where id=p_orden and deleted_at is null;
 if auth.uid() is null or o.id is null or not exists(select 1 from public.proyectos where id=o.proyecto_id and deleted_at is null)
 or not public.plan_permiso_proyecto(p_permiso,o.proyecto_id) then raise exception 'Sin permiso para esta OT' using errcode='42501';end if;
 return o;
end $$;
create function public.plan_presupuesto_aceptada(p_presupuesto uuid) returns public.plan_presupuesto_versiones
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select v.* from public.plan_presupuesto_versiones v join public.plan_presupuesto_eventos e on e.revision_id=v.id and e.estado='Adjudicado'
 where v.presupuesto_id=p_presupuesto order by v.version desc limit 1
$$;

create function public.plan_presupuesto_guardar(p_orden uuid,p_contratista uuid,p_datos jsonb,p_presupuesto uuid,p_base uuid,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes;p public.proyectos;w public.proyectos;c public.plan_contratistas;b public.plan_presupuestos;
 v public.plan_presupuesto_versiones;previous public.plan_presupuesto_versiones;d jsonb;item jsonb;slot jsonb;seen uuid[]:='{}';
 units numeric;price numeric;subtotal numeric:=0;tax numeric;grand numeric;prec integer;fuentes jsonb;request_hash text;logo text;attached text;doc public.plan_documento_revisiones;
begin
 o:=public.plan_comercio_orden(p_orden,'costos.editar');
 select * into p from public.proyectos where id=o.proyecto_id;
 select * into w from public.proyectos where id=coalesce(p.proyecto_padre_id,p.id);
 select * into c from public.plan_contratistas where id=p_contratista and tenant_id=p.tenant_id;
 if c.id is null then raise exception 'Contratista fuera de esta empresa' using errcode='42501';end if;
 if p_solicitud is null or p_datos is null or jsonb_typeof(p_datos)<>'object' or octet_length(p_datos::text)>150000 then raise exception 'Presupuesto inválido' using errcode='22023';end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_orden,p_contratista,p_datos,p_presupuesto,p_base)::text,'UTF8')),'hex');
 select * into v from public.plan_presupuesto_versiones where creada_por=auth.uid() and solicitud_id=p_solicitud;
 if v.id is not null then if v.solicitud_sha256<>request_hash then raise exception 'Solicitud reutilizada con otros datos' using errcode='22023';end if;return to_jsonb(v);end if;
 -- Serialize versions, decisions, invoices and payments on the same budget.
 if p_presupuesto is null then
  if not coalesce((select activo from public.plan_directorio_perfiles where tipo='contratista' and id=c.id),true) or not exists(select 1 from public.plan_orden_contratistas where orden_id=o.id and contratista_id=c.id) then raise exception 'Vinculá un contratista activo a esta OT antes de presupuestar' using errcode='22023';end if;
  insert into public.plan_presupuestos(tenant_id,proyecto_id,orden_id,contratista_id,creado_por) values(p.tenant_id,p.id,o.id,c.id,auth.uid()) returning * into b;
 else
  select * into b from public.plan_presupuestos where id=p_presupuesto for update;
  if b.orden_id is distinct from o.id or b.contratista_id is distinct from c.id or b.tenant_id is distinct from p.tenant_id then raise exception 'Presupuesto fuera de esta OT' using errcode='42501';end if;
  select * into previous from public.plan_presupuesto_versiones where presupuesto_id=b.id order by version desc limit 1;
  if previous.id is distinct from p_base then raise exception 'Otra persona guardó una versión. Actualizá antes de continuar' using errcode='40001';end if;
 end if;
 if coalesce(p_datos->>'moneda','') not in ('PYG','USD') or coalesce(p_datos->>'iva','') not in ('incluido','agregar') or
 jsonb_typeof(p_datos->'items') is distinct from 'array' or jsonb_array_length(p_datos->'items') not between 1 and 100 or
 jsonb_typeof(p_datos->'firmantes') is distinct from 'array' or jsonb_array_length(p_datos->'firmantes') not between 2 and 4 or
 coalesce(length(btrim(p_datos->>'condiciones')),0) not between 1 and 6000 or coalesce(p_datos->>'vence','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Revisá moneda, IVA, ítems, condiciones y firmantes' using errcode='22023';end if;
 if (p_datos->>'vence')::date<(now() at time zone 'America/Asuncion')::date then raise exception 'La validez no puede ser anterior a hoy' using errcode='22023';end if;
 if previous.id is not null and previous.moneda<>p_datos->>'moneda' then raise exception 'Una revisión conserva la moneda original' using errcode='22023';end if;
 prec:=case when p_datos->>'moneda'='PYG' then 0 else 2 end;
 for item in select value from jsonb_array_elements(p_datos->'items') loop
  if coalesce(length(btrim(item->>'descripcion')),0) not between 1 and 2000 or coalesce(length(btrim(item->>'unidad')),0) not between 1 and 30 or
  jsonb_typeof(item->'cantidad') is distinct from 'number' or jsonb_typeof(item->'precio') is distinct from 'number' then raise exception 'Ítem incompleto' using errcode='22023';end if;
  units:=(item->>'cantidad')::numeric;price:=(item->>'precio')::numeric;
  if units<=0 or units>1000000 or price<0 or price>1000000000000 then raise exception 'Cantidad o precio fuera de rango' using errcode='22023';end if;
  subtotal:=subtotal+round(units*price,prec);
 end loop;
 if subtotal<=0 or subtotal>1000000000000 then raise exception 'Revisá el importe total' using errcode='22023';end if;
 if p_datos->>'iva'='incluido' then grand:=subtotal;subtotal:=round(grand/1.10,prec);tax:=grand-subtotal;else tax:=round(subtotal*0.10,prec);grand:=subtotal+tax;end if;
 for slot in select value from jsonb_array_elements(p_datos->'firmantes') loop
  if coalesce(slot->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
  coalesce(slot->>'rol','') not in ('Jefe / Supervisor','Técnico','Cliente','Contacto','Contratista') or (slot->>'id')::uuid=any(seen) then raise exception 'Firmantes inválidos' using errcode='22023';end if;
  seen:=seen||(slot->>'id')::uuid;
 end loop;
 if not exists(select 1 from jsonb_array_elements(p_datos->'firmantes') x where x->>'rol'='Jefe / Supervisor') or not exists(select 1 from jsonb_array_elements(p_datos->'firmantes') x where x->>'rol'='Técnico') then raise exception 'Se requieren Jefe / Supervisor y Técnico' using errcode='22023';end if;
 attached:=nullif(p_datos->'adjunto'->>'path','');
 if attached is not null and (attached not like p.tenant_id::text||'/'||o.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='contractor-files' and name=attached)) then raise exception 'Adjunto no disponible en esta OT' using errcode='22023';end if;
 if nullif(p_datos->>'documento_revision','') is not null then
  select r.* into doc from public.plan_documento_revisiones r join public.plan_documentos x on x.id=r.documento_id where r.id=(p_datos->>'documento_revision')::uuid and x.orden_id=o.id;
  if doc.id is null then raise exception 'La versión del informe no pertenece a esta OT' using errcode='22023';end if;
 end if;
 select file_path into logo from public.plan_directorio_fotos where tipo='empresa' and ficha_id=p.tenant_id;
 fuentes:=jsonb_build_object('orden',jsonb_build_object('id',o.id,'ot',o.ot,'descripcion',o.descripcion,'rubro',o.rubro,'ubicacion',o.ubicacion,'estado',o.estado,'actualizada_en',o.updated_at),
  'obra',jsonb_build_object('id',w.id,'nombre',w.nombre),'empresa',jsonb_build_object('nombre',(select nombre from public.tenants where id=p.tenant_id))||coalesce((select jsonb_build_object('razon_social',datos->>'razon_social','identificacion',datos->>'identificacion','direccion',datos->>'direccion','correo',datos->>'correo','telefono',datos->>'telefono') from public.plan_directorio_perfiles where tipo='empresa' and id=p.tenant_id),'{}'),
  'contratista',jsonb_build_object('id',c.id,'nombre',c.nombre)||coalesce((select jsonb_build_object('razon_social',datos->>'razon_social','identificacion',datos->>'identificacion','telefono',datos->>'telefono','correo',datos->>'correo') from public.plan_directorio_perfiles where tipo='contratista' and id=c.id),'{}'),
  'logo_path',logo,'documento_revision',case when doc.id is not null then jsonb_build_object('id',doc.id,'version',doc.borrador_version,'sha256',doc.contenido_sha256) else null end);
 d:=jsonb_build_object('moneda',p_datos->>'moneda','iva',p_datos->>'iva','items',p_datos->'items','firmantes',p_datos->'firmantes','condiciones',btrim(p_datos->>'condiciones'),'vence',p_datos->>'vence','adjunto',case when attached is null then null else jsonb_build_object('path',attached,'nombre',left(p_datos->'adjunto'->>'nombre',220)) end,'documento_revision',doc.id);
 insert into public.plan_presupuesto_versiones(presupuesto_id,version,datos,fuentes,moneda,base,iva,total,contenido_sha256,creada_por,solicitud_id,solicitud_sha256)
 values(b.id,coalesce(previous.version,0)+1,d,fuentes,p_datos->>'moneda',subtotal,tax,grand,encode(sha256(convert_to(jsonb_build_object('datos',d,'fuentes',fuentes,'version',coalesce(previous.version,0)+1,'base',subtotal,'iva',tax,'total',grand)::text,'UTF8')),'hex'),auth.uid(),p_solicitud,request_hash) returning * into v;
 return to_jsonb(v);
end $$;

create function public.plan_presupuesto_estado(p_revision uuid,p_estado text,p_fundamento text,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v public.plan_presupuesto_versiones;b public.plan_presupuestos;e public.plan_presupuesto_eventos;o public.ordenes;
begin
 select * into v from public.plan_presupuesto_versiones where id=p_revision;
 select * into b from public.plan_presupuestos where id=v.presupuesto_id for update;
 o:=public.plan_comercio_orden(b.orden_id,'costos.editar');
 if p_solicitud is null or p_estado not in ('Presentado','Adjudicado','No adjudicado') or coalesce(length(btrim(p_fundamento)),0) not between 1 and 4000 then raise exception 'Decisión incompleta' using errcode='22023';end if;
 if p_estado<>'Presentado' and not public.plan_permiso_proyecto('informe.aprobar',b.proyecto_id) then raise exception 'Sin permiso para adjudicar' using errcode='42501';end if;
 select * into e from public.plan_presupuesto_eventos where actor=auth.uid() and solicitud_id=p_solicitud;
 if e.id is not null then if e.revision_id<>v.id or e.estado<>p_estado or e.fundamento<>btrim(p_fundamento) then raise exception 'Solicitud reutilizada' using errcode='22023';end if;return to_jsonb(e);end if;
 if exists(select 1 from public.plan_presupuesto_versiones where presupuesto_id=b.id and version>v.version) then raise exception 'Existe una revisión posterior' using errcode='40001';end if;
 if exists(select 1 from public.plan_presupuesto_eventos where revision_id=v.id and estado in ('Adjudicado','No adjudicado')) or
 (p_estado<>'Presentado' and not exists(select 1 from public.plan_presupuesto_eventos where revision_id=v.id and estado='Presentado')) then raise exception 'Primero presentá esta versión; una decisión registrada requiere nueva revisión' using errcode='22023';end if;
 if p_estado='Adjudicado' and (v.total<(select coalesce(sum(importe),0) from public.plan_presupuesto_comprobantes where presupuesto_id=b.id) or
 v.total<(select coalesce(sum(importe),0) from public.plan_presupuesto_pagos where presupuesto_id=b.id)) then raise exception 'El total no puede ser inferior a lo facturado o pagado' using errcode='22023';end if;
 insert into public.plan_presupuesto_eventos(revision_id,estado,fundamento,actor,solicitud_id) values(v.id,p_estado,btrim(p_fundamento),auth.uid(),p_solicitud) returning * into e;return to_jsonb(e);
end $$;

create function public.plan_presupuesto_comprobante(p_presupuesto uuid,p_referencia text,p_importe numeric,p_fecha date,p_vence date,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare b public.plan_presupuestos;v public.plan_presupuesto_versiones;c public.plan_presupuesto_comprobantes;o public.ordenes;prec integer;
begin
 select * into b from public.plan_presupuestos where id=p_presupuesto for update;o:=public.plan_comercio_orden(b.orden_id,'costos.editar');v:=public.plan_presupuesto_aceptada(b.id);prec:=case when v.moneda='PYG' then 0 else 2 end;
 if p_solicitud is null or v.id is null or coalesce(length(btrim(p_referencia)),0) not between 1 and 160 or p_importe is null or p_importe<=0 or p_importe>v.total or round(p_importe,prec)<>p_importe or p_fecha is null or p_vence is null or p_vence<p_fecha then raise exception 'Revisá el comprobante y el presupuesto adjudicado' using errcode='22023';end if;
 select * into c from public.plan_presupuesto_comprobantes where creado_por=auth.uid() and solicitud_id=p_solicitud;
 if c.id is not null then if c.presupuesto_id<>b.id or c.referencia<>btrim(p_referencia) or c.importe<>p_importe or c.fecha<>p_fecha or c.vence<>p_vence then raise exception 'Solicitud reutilizada' using errcode='22023';end if;return to_jsonb(c);end if;
 if p_importe+(select coalesce(sum(importe),0) from public.plan_presupuesto_comprobantes where presupuesto_id=b.id)>v.total then raise exception 'El importe supera lo adjudicado. Registrá primero una ampliación' using errcode='22023';end if;
 if exists(select 1 from public.plan_presupuesto_comprobantes where presupuesto_id=b.id and referencia=btrim(p_referencia)) then raise exception 'El comprobante ya está registrado' using errcode='22023';end if;
 insert into public.plan_presupuesto_comprobantes(presupuesto_id,revision_id,referencia,importe,fecha,vence,creado_por,solicitud_id) values(b.id,v.id,btrim(p_referencia),p_importe,p_fecha,p_vence,auth.uid(),p_solicitud) returning * into c;return to_jsonb(c);
end $$;

create function public.plan_presupuesto_pago(p_presupuesto uuid,p_comprobante uuid,p_importe numeric,p_aplicar_anticipo boolean,p_referencia text,p_medio text,p_fecha date,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare b public.plan_presupuestos;v public.plan_presupuesto_versiones;c public.plan_presupuesto_comprobantes;r public.plan_presupuesto_pagos;o public.ordenes;available numeric;pending numeric;applied numeric:=0;prec integer;
begin
 select * into b from public.plan_presupuestos where id=p_presupuesto for update;o:=public.plan_comercio_orden(b.orden_id,'costos.editar');v:=public.plan_presupuesto_aceptada(b.id);prec:=case when v.moneda='PYG' then 0 else 2 end;
 if v.id is null or p_solicitud is null or p_importe is null or p_importe<0 or p_importe>v.total or round(p_importe,prec)<>p_importe or coalesce(length(btrim(p_referencia)),0) not between 1 and 160 or coalesce(p_medio,'') not in ('Transferencia','Efectivo','Otro') or p_fecha is null or p_aplicar_anticipo is null then raise exception 'Revisá el pago o anticipo' using errcode='22023';end if;
 select * into r from public.plan_presupuesto_pagos where creado_por=auth.uid() and solicitud_id=p_solicitud;
 if r.id is not null then if r.presupuesto_id<>b.id or r.comprobante_id is distinct from p_comprobante or r.importe<>p_importe or r.referencia<>btrim(p_referencia) or r.fecha<>p_fecha or r.medio<>p_medio or (r.anticipo_aplicado>0 and not p_aplicar_anticipo) then raise exception 'Solicitud reutilizada' using errcode='22023';end if;return to_jsonb(r);end if;
 available:=(select coalesce(sum(case when comprobante_id is null then importe else -anticipo_aplicado end),0) from public.plan_presupuesto_pagos where presupuesto_id=b.id);
 if p_comprobante is not null then
  select * into c from public.plan_presupuesto_comprobantes where id=p_comprobante and presupuesto_id=b.id;
  if c.id is null then raise exception 'Comprobante fuera del presupuesto' using errcode='42501';end if;
  pending:=c.importe-(select coalesce(sum(importe+anticipo_aplicado),0) from public.plan_presupuesto_pagos where comprobante_id=c.id);
  if p_aplicar_anticipo then applied:=least(available,pending);end if;
  if p_importe+applied>pending then raise exception 'El pago y el anticipo superan el saldo' using errcode='22023';end if;
 elsif p_aplicar_anticipo then raise exception 'Elegí un comprobante para aplicar el anticipo' using errcode='22023';end if;
 if p_importe+applied<=0 or p_importe+(select coalesce(sum(importe),0) from public.plan_presupuesto_pagos where presupuesto_id=b.id)>v.total then raise exception 'Importe vacío o superior al total adjudicado' using errcode='22023';end if;
 insert into public.plan_presupuesto_pagos(presupuesto_id,comprobante_id,importe,anticipo_aplicado,referencia,medio,fecha,creado_por,solicitud_id) values(b.id,c.id,p_importe,applied,btrim(p_referencia),p_medio,p_fecha,auth.uid(),p_solicitud) returning * into r;return to_jsonb(r);
end $$;

create function public.plan_presupuesto_firmar(p_revision uuid,p_hash text,p_espacio uuid,p_imagen text,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v public.plan_presupuesto_versiones;b public.plan_presupuestos;o public.ordenes;f public.plan_presupuesto_firmas;role_name text;raw bytea;ih text;width bigint;height bigint;
begin
 select * into v from public.plan_presupuesto_versiones where id=p_revision;select * into b from public.plan_presupuestos where id=v.presupuesto_id for update;
 o:=public.plan_comercio_orden(b.orden_id,'costos.editar');
 if p_hash is distinct from v.contenido_sha256 or p_solicitud is null or p_espacio is null or p_imagen is null or length(p_imagen)>160000 or p_imagen !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$' then raise exception 'Firma o versión inválida' using errcode='22023';end if;
 raw:=decode(substring(p_imagen from 23),'base64');
 if octet_length(raw)<65 or encode(substring(raw from 1 for 8),'hex')<>'89504e470d0a1a0a' or convert_from(substring(raw from 13 for 4),'SQL_ASCII')<>'IHDR' then raise exception 'PNG inválido' using errcode='22023';end if;
 width:=get_byte(raw,16)::bigint*16777216+get_byte(raw,17)*65536+get_byte(raw,18)*256+get_byte(raw,19);height:=get_byte(raw,20)::bigint*16777216+get_byte(raw,21)*65536+get_byte(raw,22)*256+get_byte(raw,23);
 if width not between 32 and 2048 or height not between 16 and 1024 then raise exception 'Dimensiones inválidas' using errcode='22023';end if;
 ih:=encode(sha256(raw),'hex');select * into f from public.plan_presupuesto_firmas where registrada_por=auth.uid() and solicitud_id=p_solicitud;
 if f.id is not null then if f.revision_id<>v.id or f.espacio_id<>p_espacio or f.imagen_sha256<>ih then raise exception 'Solicitud reutilizada' using errcode='22023';end if;return to_jsonb(f);end if;
 if exists(select 1 from public.plan_presupuesto_versiones where presupuesto_id=b.id and version>v.version) then raise exception 'Abrí la versión vigente para firmar' using errcode='40001';end if;
 select x->>'rol' into role_name from jsonb_array_elements(v.datos->'firmantes') x where x->>'id'=p_espacio::text;
 if role_name is null then raise exception 'Espacio no configurado' using errcode='22023';end if;
 if exists(select 1 from public.plan_presupuesto_firmas where revision_id=v.id and espacio_id=p_espacio) then raise exception 'Ese espacio ya tiene una firma conservada' using errcode='22023';end if;
 insert into public.plan_presupuesto_firmas(revision_id,espacio_id,rol,contenido_sha256,imagen_png,imagen_sha256,registrada_por,solicitud_id) values(v.id,p_espacio,role_name,v.contenido_sha256,p_imagen,ih,auth.uid(),p_solicitud) returning * into f;return to_jsonb(f);
end $$;

create function public.plan_presupuestos_leer(p_contratista uuid default null,p_orden uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or (p_contratista is null and p_orden is null) then raise exception 'Indicá contratista u OT' using errcode='42501';end if;
 with visibles as materialized(select b.* from public.plan_presupuestos b where (p_contratista is null or b.contratista_id=p_contratista) and (p_orden is null or b.orden_id=p_orden)
 and public.plan_permiso_proyecto('costos.ver',b.proyecto_id) and exists(select 1 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id where o.id=b.orden_id and o.deleted_at is null and p.deleted_at is null)),
 ordenes as materialized(select o.id,o.proyecto_id,o.ot,o.descripcion,o.rubro,o.estado,p.tenant_id,w.nombre obra,
 public.plan_permiso_proyecto('costos.editar',p.id) editar,public.plan_permiso_proyecto('informe.aprobar',p.id) adjudicar,
 coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre) order by c.nombre) from public.plan_orden_contratistas x join public.plan_contratistas c on c.id=x.contratista_id where x.orden_id=o.id and coalesce((select activo from public.plan_directorio_perfiles where tipo='contratista' and id=c.id),true)),'[]') contratistas,
 coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'codigo',d.codigo,'tipo',d.tipo,'version',r.borrador_version,'hash',r.contenido_sha256) order by r.creada_en desc) from public.plan_documentos d join public.plan_documento_revisiones r on r.documento_id=d.id where d.orden_id=o.id),'[]') documentos
 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id)
 where o.deleted_at is null and p.deleted_at is null and w.deleted_at is null and public.plan_permiso_proyecto('costos.ver',p.id)
 and (p_orden is null or o.id=p_orden) and (p_contratista is null or exists(select 1 from public.plan_orden_contratistas x where x.orden_id=o.id and x.contratista_id=p_contratista) or exists(select 1 from visibles b where b.orden_id=o.id)))
 select jsonb_build_object('presupuestos',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('versiones',(select coalesce(jsonb_agg(to_jsonb(v) order by v.version),'[]') from public.plan_presupuesto_versiones v where v.presupuesto_id=b.id),'eventos',(select coalesce(jsonb_agg(to_jsonb(e) order by e.registrado_en),'[]') from public.plan_presupuesto_eventos e join public.plan_presupuesto_versiones v on v.id=e.revision_id where v.presupuesto_id=b.id),'firmas',(select coalesce(jsonb_agg(to_jsonb(f) order by f.registrada_en),'[]') from public.plan_presupuesto_firmas f join public.plan_presupuesto_versiones v on v.id=f.revision_id where v.presupuesto_id=b.id)) order by b.codigo desc) from visibles b),'[]'),
 'comprobantes',coalesce((select jsonb_agg(to_jsonb(c) order by c.fecha desc,c.id) from public.plan_presupuesto_comprobantes c join visibles b on b.id=c.presupuesto_id),'[]'),
 'pagos',coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha,x.id) from public.plan_presupuesto_pagos x join visibles b on b.id=x.presupuesto_id),'[]'),
 'ordenes',coalesce((select jsonb_agg(to_jsonb(o) order by o.ot desc) from ordenes o),'[]')) into result;
 return result;
end $$;

-- Private supplier attachments. No public URLs and no deletion of preserved sources.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('contractor-files','contractor-files',false,8388608,array['application/pdf','image/png','image/jpeg']);
create function public.plan_comercio_archivo(p_name text,p_escribir boolean) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;oid uuid;
begin
 if auth.uid() is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false;end if;
 tid:=split_part(p_name,'/',1)::uuid;oid:=split_part(p_name,'/',2)::uuid;
 return exists(select 1 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id where o.id=oid and p.tenant_id=tid and o.deleted_at is null and p.deleted_at is null and public.plan_permiso_proyecto(case when p_escribir then 'costos.editar' else 'costos.ver' end,p.id));
 exception when invalid_text_representation then return false;
end $$;
create policy plan_contractor_files_read on storage.objects for select to authenticated using(bucket_id='contractor-files' and public.plan_comercio_archivo(name,false));
create policy plan_contractor_files_insert on storage.objects for insert to authenticated with check(bucket_id='contractor-files' and owner_id=auth.uid()::text and public.plan_comercio_archivo(name,true));
create function public.plan_presupuesto_logo_leer(p_path text) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and (exists(select 1 from public.plan_presupuesto_versiones v join public.plan_presupuestos b on b.id=v.presupuesto_id where v.fuentes->>'logo_path'=p_path and public.plan_permiso_proyecto('costos.ver',b.proyecto_id)))
$$;
create policy plan_presupuesto_logo_read on storage.objects for select to authenticated using(bucket_id='directory-photos' and public.plan_presupuesto_logo_leer(name));
create function public.plan_presupuesto_conservar_logo(p_path text) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select not exists(select 1 from public.plan_presupuesto_versiones where fuentes->>'logo_path'=p_path)
$$;
create policy plan_presupuesto_logo_no_borrar on storage.objects as restrictive for delete to authenticated using(bucket_id<>'directory-photos' or public.plan_presupuesto_conservar_logo(name));

revoke all on function public.plan_comercio_orden(uuid,text),public.plan_presupuesto_aceptada(uuid),public.plan_presupuesto_guardar(uuid,uuid,jsonb,uuid,uuid,uuid),public.plan_presupuesto_estado(uuid,text,text,uuid),public.plan_presupuesto_comprobante(uuid,text,numeric,date,date,uuid),public.plan_presupuesto_pago(uuid,uuid,numeric,boolean,text,text,date,uuid),public.plan_presupuesto_firmar(uuid,text,uuid,text,uuid),public.plan_presupuestos_leer(uuid,uuid),public.plan_comercio_archivo(text,boolean),public.plan_presupuesto_logo_leer(text),public.plan_presupuesto_conservar_logo(text) from public,anon,authenticated;
grant execute on function public.plan_presupuesto_guardar(uuid,uuid,jsonb,uuid,uuid,uuid),public.plan_presupuesto_estado(uuid,text,text,uuid),public.plan_presupuesto_comprobante(uuid,text,numeric,date,date,uuid),public.plan_presupuesto_pago(uuid,uuid,numeric,boolean,text,text,date,uuid),public.plan_presupuesto_firmar(uuid,text,uuid,text,uuid),public.plan_presupuestos_leer(uuid,uuid),public.plan_comercio_archivo(text,boolean),public.plan_presupuesto_logo_leer(text),public.plan_presupuesto_conservar_logo(text) to authenticated;
notify pgrst,'reload schema';
commit;
