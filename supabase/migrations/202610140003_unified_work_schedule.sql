begin;
-- Runs only on the editable draft. Conserved revisions, artifacts and signatures are never updated.
create function public.plan_vincular_cronograma_reclamo(p_datos jsonb,p_orden uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes;c jsonb;campos jsonb:=coalesce(p_datos->'relevamiento','{}');items jsonb:=coalesce(p_datos->'itemsAlcance','[]');
 t jsonb;r jsonb;pred jsonb;item jsonb;d integer;s date;max_s date;desde date;hasta date;first_day date;last_day date;limite date;
 ids integer[]:='{}';actids text[]:='{}';links text[];relkey text;
begin
 select * into o from public.ordenes where id=p_orden;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>100 then raise exception 'Actividades inválidas' using errcode='22023';end if;
 -- Rubro and contractor names are snapshots of the OT, not free text from the report client.
 select coalesce(jsonb_agg(x||jsonb_build_object('rubro',coalesce(o.rubro,''),'contratista',coalesce(array_to_string(o.contratistas,' · '),'')) order by n),'[]') into items from jsonb_array_elements(items) with ordinality e(x,n);
 p_datos:=jsonb_set(p_datos,'{itemsAlcance}',items);
 if nullif(campos->>'cronogramaJSON','') is null then return p_datos;end if;
 if jsonb_typeof(campos->'cronogramaJSON') is distinct from 'string' or length(campos->>'cronogramaJSON')>200000 then raise exception 'Cronograma inválido' using errcode='22023';end if;
 c:=(campos->>'cronogramaJSON')::jsonb;
 if c->>'unificado' is distinct from 'true' then return p_datos;end if; -- Older clients remain compatible until explicitly linked.
 if c->>'version' is distinct from '1' or c->>'calendario' is distinct from 'corridos' or jsonb_typeof(c->'incluir') is distinct from 'boolean' or jsonb_typeof(c->'incluirMatriz') is distinct from 'boolean' or jsonb_typeof(c->'trabajos') is distinct from 'array' or jsonb_array_length(c->'trabajos')>100 then raise exception 'Configuración de cronograma inválida' using errcode='22023';end if;
 if jsonb_array_length(items)<>jsonb_array_length(c->'trabajos') or (c->>'incluir'='true' and jsonb_array_length(items)=0) then raise exception 'Las actividades y el cronograma no coinciden' using errcode='22023';end if;
 for t in select * from jsonb_array_elements(c->'trabajos') loop
  if jsonb_typeof(t->'id') is distinct from 'number' or (t->>'id') !~ '^[1-9][0-9]*$' or (t->>'id')::integer=any(ids) or coalesce(t->>'actividadId','') !~ '^A-[0-9]{2,}$' or (t->>'actividadId')=any(actids) or jsonb_typeof(t->'nombre') is distinct from 'string' or length(t->>'nombre')>240 or nullif(btrim(t->>'nombre'),'') is null then raise exception 'Identidad de actividad inválida o duplicada' using errcode='22023';end if;
  ids:=array_append(ids,(t->>'id')::integer);actids:=array_append(actids,t->>'actividadId');
  if coalesce(t->>'inicio','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or coalesce(t->>'fin','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'Fechas del trabajo inválidas' using errcode='22023';end if;
  desde:=(t->>'inicio')::date;hasta:=(t->>'fin')::date;d:=hasta-desde+1;
  if d<1 or d>3660 then raise exception 'Duración inválida' using errcode='22023';end if;
  first_day:=least(first_day,desde);last_day:=greatest(last_day,hasta);
  select x into item from jsonb_array_elements(items) x where x->>'id'=t->>'actividadId';
  if item is null or btrim(item->>'trabajo') is distinct from t->>'nombre' then raise exception 'El nombre del Gantt no coincide con su actividad' using errcode='22023';end if;
 end loop;
 if (select count(distinct x->>'id') from jsonb_array_elements(items) x)<>jsonb_array_length(items) or last_day-first_day>3660 then raise exception 'Actividades repetidas o cronograma fuera de rango' using errcode='22023';end if;
 for t in select * from jsonb_array_elements(c->'trabajos') loop
  if jsonb_typeof(t->'relaciones') is distinct from 'array' or jsonb_array_length(t->'relaciones')>100 then raise exception 'Dependencias inválidas' using errcode='22023';end if;
  links:='{}';max_s:=null;d:=(t->>'fin')::date-(t->>'inicio')::date+1;
  for r in select * from jsonb_array_elements(t->'relaciones') loop
   if jsonb_typeof(r->'predecesora') is distinct from 'number' or coalesce(r->>'predecesora','') !~ '^[1-9][0-9]*$' or (r->>'predecesora')::integer=(t->>'id')::integer or not ((r->>'predecesora')::integer=any(ids)) or coalesce(r->>'tipo','') not in ('FI','II','FF','IF') or jsonb_typeof(r->'desfase') is distinct from 'number' or coalesce(r->>'desfase','') !~ '^-?[0-9]+$' or abs((r->>'desfase')::integer)>3660 then raise exception 'Revisá el tipo, la predecesora y el desfase' using errcode='22023';end if;
   relkey:=(r->>'predecesora')||':'||(r->>'tipo');if relkey=any(links) then raise exception 'Relación duplicada' using errcode='22023';end if;links:=array_append(links,relkey);
   select x into pred from jsonb_array_elements(c->'trabajos') x where x->>'id'=r->>'predecesora';
   s:=case r->>'tipo' when 'FI' then (pred->>'fin')::date+1+(r->>'desfase')::integer when 'II' then (pred->>'inicio')::date+(r->>'desfase')::integer when 'FF' then (pred->>'fin')::date+(r->>'desfase')::integer-d+1 else (pred->>'inicio')::date+(r->>'desfase')::integer-d+1 end;
   max_s:=greatest(max_s,s);
  end loop;
  if max_s is not null and (t->>'inicio')::date<>max_s then raise exception 'Las fechas no respetan las dependencias del cronograma' using errcode='22023';end if;
 end loop;
 if exists(with recursive edges as (select (x->>'id')::integer destino,(rel_json->>'predecesora')::integer origen from jsonb_array_elements(c->'trabajos') x cross join lateral jsonb_array_elements(x->'relaciones') rel_json),walk as (select origen,destino from edges union select w.origen,e.destino from walk w join edges e on e.origen=w.destino) select 1 from walk where origen=destino) then raise exception 'Dependencia circular en el cronograma' using errcode='22023';end if;
 if first_day is not null and (campos->>'inicioPrevisto' is distinct from first_day::text or campos->>'finPrevisto' is distinct from last_day::text) then raise exception 'Las fechas generales no coinciden con el cronograma' using errcode='22023';end if;
 if nullif(campos->>'fechaLimitePrevista','') is not null then limite:=(campos->>'fechaLimitePrevista')::date;if last_day>limite then raise exception 'El cronograma excede la fecha límite acordada' using errcode='22023';end if;end if;
 return p_datos;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'Datos del cronograma inválidos' using errcode='22023';
end $$;
revoke all on function public.plan_vincular_cronograma_reclamo(jsonb,uuid) from public,anon,authenticated;
-- Keep all previous field/tenant/approval protections, adding the schedule to the approved plan fingerprint.
do $$declare old_def text;new_def text;anchor text:=' -- Approved plans/warranty decisions require the documentary approval action;';keys text:='array[''alcance'',''exclusiones'',''criterios'',''cronograma'',''inicioPrevisto'',''finPrevisto'',''condicionesOperativas'']';begin
 old_def:=pg_get_functiondef('public.plan_documento_proteger_campos()'::regprocedure);
 if position(anchor in old_def)=0 or position(keys in old_def)=0 then raise exception 'La protección documental cambió. Revisá la migración antes de instalar.';end if;
 new_def:=replace(old_def,anchor,E' if d.tipo=''relevamiento'' then new.datos:=public.plan_vincular_cronograma_reclamo(new.datos,d.orden_id);end if;\n'||anchor);
 new_def:=replace(new_def,keys,'array[''alcance'',''exclusiones'',''criterios'',''cronograma'',''cronogramaJSON'',''fechaLimitePrevista'',''inicioPrevisto'',''finPrevisto'',''condicionesOperativas'']');
 execute new_def;
end $$;
do $$declare old_def text;anchor text:=' -- The inner procedure verifies request identity, content and stale versions.';begin
 old_def:=pg_get_functiondef('public.plan_documento_version_guardar(uuid,jsonb,bigint,uuid,boolean,text,integer,text)'::regprocedure);
 if position(anchor in old_def)=0 then raise exception 'El guardado documental cambió. Revisá la migración antes de instalar.';end if;
 execute replace(old_def,anchor,E' if d.tipo=''relevamiento'' and p_plantilla=''expediente-controlado-2026-10-14-cronograma-unificado'' and nullif(p_datos#>>''{relevamiento,cronogramaJSON}'','''') is not null and ((p_datos#>>''{relevamiento,cronogramaJSON}'')::jsonb)->>''unificado'' is distinct from ''true'' then raise exception ''Vinculá las actividades y el cronograma antes de guardar esta versión'' using errcode=''22023'';end if;\n'||anchor);
end $$;
notify pgrst,'reload schema';
commit;
