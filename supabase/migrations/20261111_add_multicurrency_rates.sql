alter table public.moneda
  add column if not exists tipo_cambio_base numeric(20, 8);

alter table public.movimiento
  add column if not exists tipo_cambio numeric(20, 8);

alter table public.moneda
  add constraint moneda_tipo_cambio_base_positivo
  check (tipo_cambio_base is null or tipo_cambio_base > 0);

alter table public.movimiento
  add constraint movimiento_tipo_cambio_positivo
  check (tipo_cambio is null or tipo_cambio > 0);

update public.moneda
set tipo_cambio_base = 1
where es_base = true
  and tipo_cambio_base is distinct from 1;
