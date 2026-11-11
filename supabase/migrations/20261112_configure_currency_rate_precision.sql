alter table public.moneda
  alter column tipo_cambio_base type numeric(20, 2)
  using round(tipo_cambio_base, 2);

alter table public.movimiento
  alter column tipo_cambio type numeric(20, 2)
  using round(tipo_cambio, 2);

update public.moneda
set tipo_cambio_base = 11.71
where upper(sigla) = 'USD'
  and es_base = false;
