-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.moneda (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  sigla character varying NOT NULL,
  simbolo character varying,
  es_base boolean DEFAULT false,
  tipo_cambio_base numeric DEFAULT 1.0000,
  tipo_cambio_fuente text,
  tipo_cambio_actualizado_en timestamp with time zone,
  CONSTRAINT moneda_pkey PRIMARY KEY (id)
);
CREATE TABLE public.banco (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  estado boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT banco_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cuenta (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  banco_id bigint NOT NULL,
  numero_cuenta character varying NOT NULL,
  saldo numeric DEFAULT 0,
  moneda_id bigint NOT NULL,
  estado boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cuenta_pkey PRIMARY KEY (id),
  CONSTRAINT cuenta_banco_id_fkey FOREIGN KEY (banco_id) REFERENCES public.banco(id),
  CONSTRAINT cuenta_moneda_id_fkey FOREIGN KEY (moneda_id) REFERENCES public.moneda(id)
);
CREATE TABLE public.categoria (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  tipo character varying,
  descripcion text,
  estado boolean DEFAULT true,
  CONSTRAINT categoria_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tipo_pago (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  CONSTRAINT tipo_pago_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rol (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  CONSTRAINT rol_pkey PRIMARY KEY (id)
);
CREATE TABLE public.permiso (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  CONSTRAINT permiso_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rol_permiso (
  rol_id bigint NOT NULL,
  permiso_id bigint NOT NULL,
  CONSTRAINT rol_permiso_pkey PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT rol_permiso_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.rol(id),
  CONSTRAINT rol_permiso_permiso_id_fkey FOREIGN KEY (permiso_id) REFERENCES public.permiso(id)
);
CREATE TABLE public.usuario (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying,
  correo character varying UNIQUE,
  password_hash character varying,
  rol_id bigint,
  estado boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT usuario_pkey PRIMARY KEY (id),
  CONSTRAINT usuario_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.rol(id)
);
CREATE TABLE public.movimiento (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tipo character varying,
  fecha date,
  monto numeric NOT NULL,
  descripcion character varying,
  cuenta_id bigint,
  moneda_id bigint,
  categoria_id bigint,
  tipo_pago_id bigint,
  user_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tipo_cambio numeric DEFAULT 1.0000,
  CONSTRAINT movimiento_pkey PRIMARY KEY (id),
  CONSTRAINT movimiento_cuenta_id_fkey FOREIGN KEY (cuenta_id) REFERENCES public.cuenta(id),
  CONSTRAINT movimiento_moneda_id_fkey FOREIGN KEY (moneda_id) REFERENCES public.moneda(id),
  CONSTRAINT movimiento_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categoria(id),
  CONSTRAINT movimiento_tipo_pago_id_fkey FOREIGN KEY (tipo_pago_id) REFERENCES public.tipo_pago(id),
  CONSTRAINT movimiento_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id)
);
CREATE TABLE public.imagen (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  url text NOT NULL,
  movimiento_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT imagen_pkey PRIMARY KEY (id),
  CONSTRAINT imagen_movimiento_id_fkey FOREIGN KEY (movimiento_id) REFERENCES public.movimiento(id)
);
CREATE TABLE public.transferencia (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  cuenta_origen_id bigint,
  cuenta_destino_id bigint,
  monto numeric NOT NULL,
  fecha date,
  descripcion text,
  user_id bigint,
  CONSTRAINT transferencia_pkey PRIMARY KEY (id),
  CONSTRAINT transferencia_cuenta_origen_id_fkey FOREIGN KEY (cuenta_origen_id) REFERENCES public.cuenta(id),
  CONSTRAINT transferencia_cuenta_destino_id_fkey FOREIGN KEY (cuenta_destino_id) REFERENCES public.cuenta(id),
  CONSTRAINT transferencia_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id)
);
CREATE TABLE public.auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id bigint,
  tabla character varying,
  accion character varying,
  registro_id bigint,
  fecha timestamp with time zone DEFAULT now(),
  CONSTRAINT auditoria_pkey PRIMARY KEY (id),
  CONSTRAINT auditoria_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id)
);
CREATE TABLE public.obligacion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo character varying NOT NULL,
  descripcion text,
  monto numeric DEFAULT 0.00,
  monto_estimado numeric DEFAULT 0.00,
  fecha_vencimiento date NOT NULL,
  estado character varying DEFAULT 'Pendiente'::character varying,
  categoria_id bigint,
  cuenta_id bigint,
  usuario_id text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT obligacion_pkey PRIMARY KEY (id),
  CONSTRAINT obligacion_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categoria(id),
  CONSTRAINT obligacion_cuenta_id_fkey FOREIGN KEY (cuenta_id) REFERENCES public.cuenta(id)
);








-- 1. Habilitar extensión pgcrypto para encriptar contraseñas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  user_email TEXT := 'admin@farmaciacliente.com'; -- <--- Correo del cliente
  user_password TEXT := 'Password123*';            -- <--- Contraseña del cliente
BEGIN
  -- 2. Insertar en el esquema de autenticación de Supabase (auth.users)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Administrador Principal"}',
    NOW(),
    NOW()
  );

  -- 3. Insertar identidad de autenticación
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, user_email)::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- 4. Insertar en tu tabla pública 'usuario'
  -- (Ajusta los nombres de las columnas si tu tabla usa 'nombre', 'correo', etc.)
  INSERT INTO public.usuario (
    id,
    nombre,
    email,
    rol,
    estado
  ) VALUES (
    new_user_id,
    'Administrador Principal',
    user_email,
    'administrador',
    'activo'
  )
  ON CONFLICT (id) DO NOTHING;

END $$;