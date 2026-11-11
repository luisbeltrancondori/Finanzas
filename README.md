# Finora · Gestión financiera

Dashboard responsive para gestionar ingresos, gastos, transferencias, cuentas bancarias y catálogos con Supabase como fuente de datos. No se incluyen datos de demostración: sin configuración y acceso válidos, la aplicación muestra el error de conexión y permite reintentar.

## Desarrollo

Requiere Node.js 20.19+ o 22.12+ y npm.

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Configuración de Supabase

Copia `.env.example` a `.env.local` y define las variables públicas del proyecto. No uses una clave `service_role` en el navegador.

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

La aplicación solicita inicio de sesión con correo y contraseña de Supabase Auth. Después, busca en `usuario` el registro cuyo `correo` coincide con el correo autenticado y muestra su nombre y rol (consultando `rol` cuando el usuario tiene un `rol_id`/`id_rol`). Si el perfil no existe o está desactivado, no se abre el panel. Para insertar movimientos y transferencias, el `id` de ese registro se asigna a `user_id`. Configura políticas RLS para permitir a la sesión consultar y modificar únicamente los datos que le corresponden.

Con una sesión válida, la aplicación obtiene las listas de `banco`, `cuenta`, `moneda`, `categoria`, `tipo_pago`, `movimiento` y `transferencia` al iniciar. El botón del perfil permite cerrar sesión de forma segura mediante Supabase Auth.

El módulo **Usuarios** se muestra a los usuarios con rol Administrador o con el permiso `usuario.gestionar`; el rol Operador queda excluido. Los permisos se resuelven desde `usuario.rol_id` a través de `rol_permiso` y su relación con `permiso`. La acción de eliminar inactiva el registro (`usuario.estado = false`) para conservar sus referencias. Estas comprobaciones de interfaz no sustituyen las políticas RLS: aplica las mismas restricciones en Supabase para proteger las operaciones de la base de datos.

Al crear usuarios desde el módulo, se registra primero su cuenta con Supabase Auth y luego su perfil en `usuario`. El formulario exige una contraseña de al menos seis caracteres. El registro de Auth se realiza con un cliente aislado para evitar reemplazar la sesión del administrador; si la inserción del perfil falla después de crear la cuenta de Auth, la interfaz informa que la cuenta existe y que debe revisarse el perfil/RLS antes de reintentar.

El perfil permite editar el nombre y guardar una foto de perfil sin añadir columnas a `usuario`: `full_name` y la ruta de Storage en `avatar_url` se guardan en los metadatos de Supabase Auth. La carga usa la sesión autenticada del cliente principal y guarda cada objeto bajo `auth.uid()/avatar-<uuid>.<ext>`. Crea el bucket privado `perfiles` y configura sus políticas RLS de lectura, carga y eliminación para los usuarios autorizados. Para permitir que cada usuario cargue únicamente dentro de su carpeta, la política INSERT debe comprobar `bucket_id = 'perfiles'` y `(storage.foldername(name))[1] = (select auth.uid()::text)`; la política SELECT de Storage también debe permitir crear enlaces firmados para la propia carpeta. Los comprobantes usan el bucket privado `comprobantes`, se guardan bajo `auth.uid()/movimiento_id/archivo` y su ruta se registra en `imagen.url` junto con `imagen.movimiento_id`. El detalle consulta `imagen` por `movimiento_id` y genera enlaces firmados para cada archivo; configura las políticas Storage y RLS de `imagen` para autorizar carga, lectura y eliminación al usuario correspondiente. La renovación de tokens no vuelve a validar el perfil ni desmonta el panel, de modo que los formularios conservan su estado al volver a la pestaña.

El modal único de perfil puede abrirse desde el avatar del menú lateral o desde el avatar superior. El cambio de contraseña verifica primero la contraseña actual mediante un cliente Auth aislado y luego actualiza la contraseña de la sesión con Supabase Auth; la contraseña actual nunca se almacena.

Si aparece `No se pudo resolver el servidor de Supabase`, copia el Project URL exacto desde **Supabase → Settings → API** a `VITE_SUPABASE_URL`, confirma que el proyecto siga activo y reinicia el servidor de Vite. El navegador debe poder resolver el dominio del proyecto por DNS. `VITE_SUPABASE_ANON_KEY` debe contener la clave pública `anon`/publishable correspondiente a ese mismo proyecto.

Las operaciones y mapeos relacionales están en `src/services/financeService.ts` y `src/services/userService.ts`. Incluyen SELECT, INSERT, UPDATE y DELETE para los módulos; los comprobantes se guardan en el bucket privado `comprobantes` y la ruta se registra en `imagen`. Configura políticas del bucket y las claves foráneas que relacionan `movimiento` con `cuenta`, `categoria`, `moneda` y `tipo_pago`, `cuenta` con `banco` y `moneda`, y `usuario`/`rol_permiso` con sus tablas relacionadas.

El saldo disponible de cada cuenta se calcula como su saldo inicial (`cuenta.saldo`) más los movimientos asociados por `movimiento.cuenta_id = cuenta.id` (ingresos positivos y gastos negativos). Se obtiene explícitamente `cuenta_id`, `tipo` y `monto` de `movimiento` para calcularlo; el Dashboard consolida los saldos y reportes en la moneda seleccionada. Las transferencias se registran en `transferencia`; actualmente no se incluyen en el saldo calculado y, si deben modificar saldos, implementa esa operación como una función/trigger transaccional en PostgreSQL para garantizar consistencia ante fallos concurrentes.

### Monedas y tipos de cambio

Antes de usar la conversión, ejecuta `supabase/migrations/20261111_add_multicurrency_rates.sql` en el SQL Editor de Supabase. La migración agrega `moneda.tipo_cambio_base` y `movimiento.tipo_cambio`; conserva en `movimiento.moneda_id` la moneda original. Los movimientos nuevos guardan la tasa aplicada al registrar: unidades de la moneda base por una unidad de la moneda del movimiento (por ejemplo, `1 USD = 6.96 BOB`). La moneda marcada con `moneda.es_base` siempre usa tasa `1`.

Configura o actualiza manualmente las tasas de cada moneda desde **Configuración → Monedas**. Al seleccionar una cuenta extranjera en el formulario de movimientos, Finora consulta `open.er-api.com` para obtener la tasa actual cruzada a la moneda base y la propone en el campo; la tasa de Catálogos queda como respaldo si la API no está disponible. El usuario puede editar siempre la tasa antes de guardar. En **Resumen financiero**, los filtros globales de banco, cuenta y moneda limitan las tarjetas de ingresos/gastos, el gráfico y la actividad reciente; todos los importes de reportes se muestran en BOB (o en la moneda marcada como base si no hay una moneda BOB configurada). La tarjeta de total consolidado general muestra todas las cuentas activas, sin aplicar filtros, y las tarjetas de cuentas conservan el saldo nominal con equivalencia visible en BOB calculada con las tasas actuales de Catálogos. Los movimientos antiguos que no tienen `tipo_cambio` se calculan con la tasa actual de Catálogos y el Dashboard lo advierte, pues no puede reconstruirse su cotización histórica automáticamente.

La vista **Movimientos** permite exportar a Excel los registros visibles tras aplicar los filtros de búsqueda, fecha, cuenta, categoría y tipo. El libro `Finora_Reporte_Movimientos_AAAA-MM.xlsx` contiene tres hojas: **Resumen Financiero** con totales por cuenta, moneda y banco; **Detalle de Movimientos** con los movimientos filtrados y sus importes/tasas; y **Saldos y Bancos** con la posición actual por cuenta. Los valores consolidados usan la moneda base disponible y mantienen fallback de tasa `1` cuando falta una cotización.

El módulo **Calendario** registra obligaciones con fecha de vencimiento, importe estimado, categoría y estado. Ejecuta `supabase/migrations/20261111_create_obligacion.sql` en el SQL Editor para crear `obligacion` e instalar sus políticas RLS; después ejecuta `supabase/migrations/20261111_fix_obligacion_identifier_types.sql` para normalizar los IDs de perfil/categoría como texto y asegurar el valor predeterminado del ID cuando la tabla existente usa UUID. Cada usuario puede consultar y modificar obligaciones asociadas a su perfil (`usuario.id` vinculado por el correo autenticado). El selector mensual/semanal permite crear obligaciones directamente desde una fecha. La campana muestra las obligaciones pendientes que vencen hoy o dentro de los próximos tres días y permite marcarlas pagadas.

## Estructura

```text
src/
├── components/
│   ├── CashflowChart.tsx
│   ├── FinanceModal.tsx
│   ├── Header.tsx
│   ├── Login.tsx
│   ├── RolePermissionsView.tsx
│   ├── Sidebar.tsx
│   ├── SummaryCard.tsx
│   ├── TransactionsTable.tsx
│   └── UsersView.tsx
├── lib/
│   └── supabase.ts
├── services/
│   ├── financeService.ts
│   ├── permissionService.ts
│   └── userService.ts
├── types/
│   └── finance.ts
├── App.tsx
├── App.css
└── index.css
```

## Módulos

- Dashboard con saldos, balance neto, ingresos/gastos del mes y gráfico de seis meses.
- Movimientos con búsqueda, filtros de fecha, categoría, cuenta y tipo; tabla paginada.
- Formularios validados de ingreso, gasto, transferencia, cuenta y catálogos.
- Administración de cuentas, estados, categorías, métodos de pago y monedas.
- Gestión de usuarios, asignación de roles y acceso al módulo controlado por el rol Administrador o el permiso `usuario.gestionar`.
- Matriz para asignar permisos por rol, agrupada por módulo y sincronizada con `rol_permiso`; el rol con ID `1` se presenta siempre con todos los permisos seleccionados.
- Carga y validación de comprobantes de imagen/PDF.
