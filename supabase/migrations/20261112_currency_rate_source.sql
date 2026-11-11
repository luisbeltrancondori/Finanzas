alter table public.moneda
  add column if not exists tipo_cambio_fuente text,
  add column if not exists tipo_cambio_actualizado_en timestamptz;
