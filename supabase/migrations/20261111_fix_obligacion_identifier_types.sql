alter table public.obligacion
  alter column usuario_id type text using usuario_id::text,
  alter column categoria_id type text using categoria_id::text;

do $$
declare
  id_type text;
  id_default text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod), pg_get_expr(default_value.adbin, default_value.adrelid)
    into id_type, id_default
  from pg_attribute attribute
  left join pg_attrdef default_value
    on default_value.adrelid = attribute.attrelid
    and default_value.adnum = attribute.attnum
  where attribute.attrelid = 'public.obligacion'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  if id_type = 'uuid' and id_default is null then
    alter table public.obligacion
      alter column id set default gen_random_uuid();
  end if;
end
$$;
