![Facturador](public/next.svg)

# Facturador

Plataforma de facturación electrónica construida con Next.js 15 (App Router) y React 18. Utiliza PostgreSQL vía Prisma Client, componentes accesibles usando TailwindCSS + Radix UI vía shadcn/ui y un flujo de construcción Docker multietapa listo para despliegue.

## Stack principal

- Next.js 15 (App Router) + React 18 + TypeScript.
- TailwindCSS 3 + Radix UI (shadcn/ui) + Theme Provider con `next-themes`.
- PostgreSQL con Prisma Client reutilizable.
- Zod para validación de variables de entorno.
- Dockerfile multietapa (`node:20-alpine`) y `.dockerignore` optimizado.

## Arquitectura de datos y servicios

Toda la persistencia vive ahora sobre Prisma y se organiza en tres capas:

- **Prisma client** (`src/lib/db/prisma.ts`): instancia única que encapsula la conexión al schema `app`. La factoría admite transacciones (`prisma.$transaction`) y se reutiliza en tests o tareas en segundo plano.
- **Repositorios** (`src/lib/repositories/**`): cada módulo expone una interfaz (`I*.ts`) y una implementación concreta que traduce entre modelos Prisma y DTOs usados por la aplicación. Ejemplos recientes: `AdminUserRepository` y `WaiterRepository`.
- **Servicios** (`src/lib/services/**`): coordinan reglas de negocio, mock mode y dependencias cruzadas (cajas, pedidos, roles). Se consumen desde los handlers de API y componentes server. `adminUserService` y `waiterService` son los puntos de entrada para autenticación y mantenimiento de usuarios.

El modo demo se conserva gracias a los servicios: cada servicio dispone de un contexto in-memory que emula la base sin tocar PostgreSQL cuando `MOCK_DATA=true`. Esto evita duplicar lógica y mantiene la paridad entre pruebas y producción.

### Zona horaria y normalización de fechas

- Todos los campos de fecha (sin componente horario) se guardan a las `00:00:00` en la zona horaria de Centroamérica (UTC-6). Para garantizarlo, usa los utilitarios de `src/lib/utils/date.ts` (`toCentralClosedDate` y `toCentralEndOfDay`).
- Las columnas de auditoría continúan almacenando la hora exacta, pero ahora siempre se convierten con el desplazamiento -6 para conservar el valor real en la base.
- Evita crear nuevos `Date` con desplazamientos manuales; centraliza cualquier parsing/normalización en los helpers anteriores para mantener consistencia entre facturas, movimientos de inventario y reportes.

### Estado del plan de migración

La migración de módulos legacy (`src/lib/db/*.ts`) a repositorios Prisma ya concluyó para:

- Artículos, kits y catálogo de precios.
- Alertas de inventario y notificaciones.
- Facturación, órdenes y cajas.
- Autenticación y directorio de administradores y meseros (nueva capa `WaiterService`).
 - Mesas y zonas: `TableService` (Prisma + mock) reemplaza por completo `src/lib/db/tables.ts`.

Los handlers de API dependen de servicios (`InvoiceService`, `InventoryService`, `OrderService`, `TableService`, etc.) y ya no deben llamar helpers legacy de `src/lib/db/**`. Cualquier nuevo módulo debe seguir este patrón repositorio + servicio para garantizar consistencia y claridad en el manejo de transacciones y mock mode.

## Requisitos previos

- Node.js >= 18.18 (recomendado 20 LTS).
- npm >= 10.
- Acceso a una instancia de PostgreSQL (local o remota).

## Configuración inicial

1. Copia las variables de entorno: `cp .env.example .env.local` y ajusta los valores.
2. Instala dependencias: `npm install`.
3. Ejecuta el servidor de desarrollo: `npm run dev` y abre http://localhost:3000.

### Scripts disponibles

- `npm run dev` – servidor de desarrollo con HMR.
- `npm run build` – compila la aplicación en modo producción.
- `npm run start` – inicia el servidor en modo producción.
- `npm run lint` – ejecuta `eslint . --max-warnings=0`.
- `npm run typecheck` – valida los tipos con TypeScript.
 - `npm test` – ejecuta la suite de pruebas con Jest.

## Integración con PostgreSQL

El acceso a datos se realiza principalmente con Prisma desde `src/lib/db/prisma.ts`. Este cliente usa una única variable `DB_CONNECTION_STRING` (y solo si falta, Prisma aceptará `DATABASE_URL` como alias de compatibilidad). De esta forma app y Prisma siempre apuntan a la misma base.

Consulta la sección **Variables de entorno** para conocer el propósito de cada ajuste y sus valores sugeridos.

Para inicializar la base de datos desde cero, importa `database/schema_master.sql` en tu instancia de PostgreSQL (ejemplo: `psql -f database/schema_master.sql`).

El endpoint `GET /api/health` valida la conectividad.

### Fundamentos de Cuentas por Cobrar

La migración `20251128101500_cxc_core_tables` introduce el bloque de datos para operar el modo retail/CxC directamente en PostgreSQL:

- `app.payment_terms`: catálogo de condiciones de pago (contado, 15/30/60/90/120 días). El script maestro incluye los seis valores iniciales y la UI/servicios utilizarán este catálogo para calcular vencimientos.
- `app.customers`: registro maestro de clientes con datos fiscales, contacto, estado de crédito y vínculo a `payment_terms`.
- `app.customer_documents` + `app.customer_document_applications`: ledger de documentos CxC (facturas espejo, notas, recibos, retenciones) y sus aplicaciones RET ➜ ROC.
- `app.customer_credit_lines`, `app.collection_logs` y `app.customer_disputes`: estructuras para evaluar límites de crédito, registrar gestiones y dar seguimiento a disputas.
- `app.invoices` ahora enlaza `customer_id`, `payment_term_id` y `due_date` para sincronizar cada factura retail con su documento en cartera.

#### Endpoints CxC disponibles

| Método | Ruta | Servicio |
| --- | --- | --- |
| GET / POST | `/api/preferencias/terminos-pago` | `paymentTermService.list/create`
| GET / PATCH / DELETE | `/api/preferencias/terminos-pago/[code]` | `paymentTermService`
| GET / POST | `/api/cxc/clientes` | `customerService.list/create`
| GET / PATCH | `/api/cxc/clientes/[code]` | `customerService.getByCode/update`
| GET / POST | `/api/cxc/documentos` | `customerDocumentService.list/create`
| GET / POST | `/api/cxc/documentos/aplicaciones` | `customerDocumentApplicationService.list/apply`
| DELETE | `/api/cxc/documentos/aplicaciones/[id]` | `customerDocumentApplicationService.delete`

Todas las rutas respetan la bandera `MOCK_DATA` y delegan en los servicios del dominio para mantener compatibilidad con el modo demo.
Antes de ejecutar cualquier handler se valida que la sesión posea los permisos CxC necesarios mediante `requireCxCPermissions` (`src/lib/auth/cxc-access.ts`), garantizando que solo roles autorizados puedan administrar cartera.

- La vista **Cuentas por Cobrar → Documentos** permite registrar documentos manuales (facturas espejo, notas, recibos) desde la UI. El formulario calcula automáticamente el vencimiento con base en la condición de pago, valida importes y sincroniza el saldo restante.

#### Reportes CxC

- `/api/reportes/cxc/resumen`, `/api/reportes/cxc/vencimientos` y `/api/reportes/cxc/antiguedad` aceptan el parámetro `customer_codes` (CSV de códigos) para filtrar uno o varios clientes, conservando el filtro textual `customer` existente como búsqueda libre.
- Todos los reportes soportan `format=html` y se imprimen mediante la UI `src/app/reportes/page.tsx`, que ahora incluye selector multi-cliente con chips removibles y respeta la recarga inmediata tras ajustar filtros.

#### Pruebas planificadas

Se agregarán suites en `tests/api/cxc.*` cubriendo:

1. Condiciones de pago: creación, actualización, eliminación y validaciones de duplicidad.
2. Clientes: búsqueda con filtros, creación con vínculo a `payment_terms` y actualización de crédito/estatus.
3. Documentos: emisión de facturas espejo/notas y filtros por cliente, estado y tipo.
4. Aplicaciones: flujo RET ➜ ROC, validación de saldos y reversión por `DELETE`.

Sugerencias específicas:
- `tests/api/cxc.payment-terms.test.ts`: mock + base real, validar `requireCxCPermissions`, deduplicación por `code`, edge cases de vigencia y bandera `is_active`.
- `tests/api/cxc.customers.test.ts`: escenarios con `credit_limit`, actualización parcial, rechazo cuando falta `payment_term_id` y filtro `status`.
- `tests/api/cxc.documents.test.ts`: creación de documentos `INVOICE`, `CREDIT_NOTE`, `RECEIPT`, verificación de `due_date` normalizado, folios generados por `SequenceService` y bloqueos por saldo negativo.
- `tests/api/cxc.document-applications.test.ts`: prioridad de retenciones sobre recibos, sincronización de crédito tras aplicar/revertir y validación de saldos en mock mode.
- Pruebas unitarias en `tests/services/paymentTerm.service.test.ts`, `tests/services/customer.service.test.ts` y `tests/services/customerDocument.service.test.ts` para validar reglas de negocio sin HTTP.

Cada suite deberá ejecutarse con `MOCK_DATA=true` y contra la base real para garantizar paridad.

Si necesitas recrear estos objetos en un entorno limpio, basta con volver a ejecutar `database/schema_master.sql` o aplicar la migración Prisma correspondiente.

### Inicialización de base y primer administrador

1. Crea la base desde `postgres` (ajusta el nombre si lo requires):
	```sql
	CREATE DATABASE facturador WITH ENCODING 'UTF8';
	```
2. Cambia la sesión a la base recién creada antes de ejecutar el resto del script. En `psql` usa `\c facturador`; en clientes gráficos, selecciona `facturador` en la herramienta de consultas. El script maestro incluye un guard clause (`DO $$ ... IF current_database() = 'postgres' THEN RAISE EXCEPTION ...`) que aborta si sigues conectado a `postgres`.
3. Ejecuta el esquema completo dentro de `facturador`:
	```bash
	psql -d facturador -f database/schema_master.sql
	```
4. El script crea automáticamente un administrador inicial con usuario `admin` y la contraseña temporal `AdminTemporal2024!`. Inicia sesión con esas credenciales y cámbialas inmediatamente desde el módulo **Usuarios**.
5. (Opcional) Genera un hash bcrypt para la contraseña de un administrador adicional (reemplaza `TuPassword$123` por la clave deseada):
	```bash
	node -e "console.log(require('bcryptjs').hashSync('TuPassword$123', 10))"
	```
6. (Opcional) Inserta el usuario y asígnale el rol `ADMINISTRADOR` (sustituye `<HASH_BCRYPT>` por el valor impreso y ajusta el correo si lo deseas):
	```sql
	INSERT INTO app.admin_users (username, password_hash, display_name, is_active)
	VALUES ('admin@tuempresa.com', '<HASH_BCRYPT>', 'Admin Principal', TRUE)
	RETURNING id;
	```
	Con el `id` devuelto, enlaza el rol:
	```sql
	INSERT INTO app.admin_user_roles (admin_user_id, role_id, is_primary)
	SELECT <ID_DEVUELTO>, r.id, TRUE
	FROM app.roles r
	WHERE r.code = 'ADMINISTRADOR';
	```
7. (Opcional) Inicia sesión en la aplicación usando el correo y la contraseña originales (no el hash). Ese usuario ya contará con todos los permisos administrativos.

## Variables de entorno

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `NEXT_PUBLIC_COMPANY_NAME` | Nombre comercial mostrado en la interfaz y en tickets | `Facturador POS` |
| `NEXT_PUBLIC_COMPANY_ACRONYM` | Sigla corta para badges y encabezados | `FAC` |
| `NEXT_PUBLIC_COMPANY_ADDRESS` | Dirección impresa en tickets y reportes rápidos | `Calle Principal 123, Ciudad` |
| `NEXT_PUBLIC_CLIENT_LOGO_URL` | Ruta absoluta o relativa del logotipo mostrado en login y barra superior | `/logos/client.svg` |
| `NEXT_APP_URL` | URL base usada en redirecciones, enlaces absolutos y correos | `http://localhost:3000` |
> Importante: esta URL también se usa para generar los enlaces de reportes de caja (apertura/cierre). Configúrala con el dominio público para evitar respuestas `https://0.0.0.0`. 
| `NEXT_PUBLIC_ES_RESTAURANTE` | Activa flujos exclusivos de restaurantes (mesas, meseros, facturación con pedido). Usa `false` para habilitar el modo retail con CxC. | `true` |
| `LICENSE_MAX_CASH_REGISTERS` | Número máximo de cajas activas/licenciadas. Usa `0` o deja vacío para operar sin límite. | `5` |
| `NEXT_PUBLIC_LOCAL_CURRENCY_CODE` | Código ISO de la moneda principal | `MXN` |
| `NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL` | Símbolo de moneda principal | `$` |
| `NEXT_PUBLIC_FOREIGN_CURRENCY_CODE` | Código ISO de la moneda secundaria | `USD` |
| `NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL` | Símbolo de moneda secundaria | `$` |
| `NEXT_PUBLIC_VAT_RATE` | IVA por defecto (acepta `0.16` o `16`) | `15` |
| `NEXT_PUBLIC_SERVICE_RATE` | Cargo de servicio por defecto (acepta `0.10` o `10`). Si se omite o es `0`, no se añade cargo automáticamente. | `10` |
| `DEFAULT_PRICE_LIST_CODE` | Lista de precios a usar en catálogos y facturas | `BASE` |
| `DEFAULT_SALES_WAREHOUSE_CODE` | Almacén por defecto para consumos de facturación (fallback para artículos sin almacén asignado) | `PRINCIPAL` |
| `DB_CONNECTION_STRING` | Cadena de conexión PostgreSQL con esquema `app`. ÚNICA fuente para app y Prisma | `postgres://postgres:super_seguro@localhost:5432/facturador` |
| `MOCK_DATA` | Activa modo demo en memoria (sin persistencia real) | `false` |
| `SESSION_SECRET` | Clave aleatoria (>=32 caracteres) para firmar cookies | `cambia-esta-clave-super-secreta-32caracteres` |
| `NODE_ENV` | Entorno de ejecución (afecta habilitación de Next.js) | `development` |

- Tanto `NEXT_PUBLIC_VAT_RATE` como `NEXT_PUBLIC_SERVICE_RATE` aceptan valores en porcentaje (`15`) o en forma decimal (`0.15`).
- Genera `SESSION_SECRET` con una cadena segura antes de desplegar a producción.
- Cuando `MOCK_DATA=true`, toda la información se mantiene en memoria y no se escriben registros en PostgreSQL.

### Endpoint de facturación (`POST /api/invoices`)

Permite persistir una factura con múltiples formas de pago siempre que el usuario facturador tenga una apertura de caja activa. Si `MOCK_DATA=true`, la información se almacena en memoria; caso contrario se escribe en las tablas `app.invoices`, `app.invoice_items`, `app.invoice_payments` y queda vinculada a la sesión de caja mediante `cash_register_session_id` (ver `database/schema_master.sql`).

Contrato JSON (actualizado con cliente e items):

```json
{
	"invoice_number": "F-1731234567890",
	"table_code": "M-12",
	"waiter_code": "MESERO01",
	"subtotal": 615.00,
	"service_charge": 0,
	"vat_amount": 98.40,
		"vat_rate": 0.15,
	"total_amount": 713.40,
	"currency_code": "MXN",
	"customer_name": "Cliente Demo S.A.",
	"customer_tax_id": "RUC1234567",
	"items": [
		{ "description": "Pasta al pesto", "quantity": 2, "unit_price": 195.00 },
		{ "description": "Flat white 12oz", "quantity": 2, "unit_price": 140.00 }
	],
	"payments": [
		{ "method": "CASH", "amount": 500.00 },
		{ "method": "CARD", "amount": 213.40, "reference": "1234" }
	]
}
```

Respuesta exitosa:

```json
{ "id": 42, "invoice_number": "F-1731234567890" }
```

Validaciones clave:
- `invoice_number` único.
- El endpoint devuelve `409` si el administrador tiene rol `FACTURADOR` pero no existe una apertura de caja `OPEN` asociada a su usuario.
- La suma de `payments.amount` debe ser mayor o igual que `total_amount`. Si queda saldo pendiente el endpoint devuelve `409`; se permite excedente para calcular el cambio en el cliente.
- `vat_rate` acepta porcentaje decimal (ej. 0.15) generado desde `NEXT_PUBLIC_VAT_RATE` y puede ser 0 si el cliente es exento (checkbox UI).
- Servicio se calcula en el cliente con `NEXT_PUBLIC_SERVICE_RATE` cuando se activa el toggle "Con cargo". Si el valor es `0` o no está definido, el toggle aparece apagado y el cargo no se considera en los cálculos.
- `customer_name` y `customer_tax_id` permiten personalizar la identificación fiscal en la factura y ticket.
- `items` guarda el desglose de líneas en `app.invoice_items` (cantidad, descripción, precio unitario, total). 
- Las facturas originadas desde `/facturacion` quedan asociadas a `cash_register_id`, `cash_register_session_id` e `issuer_admin_user_id` para reportes de jornada.

Errores devuelven `{ success: false, message: string }` con estado 400 (validación) o 500 (error interno).

### Gestión de cajas y jornadas (`/api/cajas/*`)

Los usuarios con rol `FACTURADOR` deben abrir una caja antes de emitir facturas. El flujo completo se expone vía endpoints protegidos:

- El cliente mostrador predeterminado de cada caja se define desde el tab **Cajas** en `/preferencias` cuando `NEXT_PUBLIC_ES_RESTAURANTE=false`. Haz doble clic en la columna **Cliente predeterminado** para abrir el buscador (solo lista clientes activos con condición de pago CONTADO). Solo los administradores pueden asignar o remover esta relación y el backend valida que el código de cliente exista antes de persistirlo.
- Un consecutivo de facturación (`SequenceService.generateInvoiceNumber`) es obligatorio por caja y se asigna desde el tab **Consecutivos** en `/preferencias`.

- `GET /api/cajas/sesion-activa`: devuelve la caja asignada, la apertura en curso (si existe) y el listado de cajas autorizadas para el usuario actual. El endpoint se usa en la UI para mostrar el banner de sesión o desplegar el modal de apertura.
- `POST /api/cajas/aperturas`: abre una jornada de caja. Requiere `cash_register_code`, `opening_amount` y notas opcionales. Valida que no existan otras sesiones `OPEN` para el usuario ni para la caja objetivo.
- `GET /api/cajas/aperturas/{sessionId}/reporte?format=html[&token=JWT]`: construye un reporte de apertura imprimible con los datos de la sesión, responsable y notas capturadas. Disponible para el titular de la caja, supervisores (`cash.report.view`) y administradores. El token opcional se envía al abrir la caja desde la UI para ver el HTML sin reenviar credenciales.
- `POST /api/cajas/cierres`: cierra la sesión activa capturando conteo físico por método de pago. Calcula diferencias contra los montos de sistema, persiste el resumen en `app.cash_register_sessions` y normaliza el desglose en `app.cash_register_session_payments`.
- `GET /api/cajas/cierres/{sessionId}/reporte?format=html[&token=JWT]`: genera un reporte imprimible con las ventas, formas de pago, diferencias y detalle de facturas asociadas a la jornada, incluyendo los nombres de apertura y cierre. Cuando se cierra la caja desde la UI se anexa un token temporal para abrir la pestaña de impresión sin depender de la cookie de sesión.

Todos los endpoints respetan `MOCK_DATA`: en modo demo se utiliza almacenamiento en memoria y los cálculos se realizan en estructuras locales.

### Endpoint de traspasos (`/api/inventario/traspasos`)

- `GET /api/inventario/traspasos`: acepta filtros opcionales `article`, `fromWarehouse`, `toWarehouse`, `from` y `to` (YYYY-MM-DD). Retorna `items[]` con folio, almacenes origen/destino, líneas afectadas y responsable que autorizó.
- `POST /api/inventario/traspasos`: registra un traslado entre almacenes. Si `MOCK_DATA=true` persiste en memoria; de lo contrario escribe en `app.inventory_transactions`, `app.inventory_transaction_entries` y `app.inventory_movements` (salida e ingreso) manteniendo el control de kits.

Ejemplo de carga:

```json
{
	"occurred_at": "2024-11-12",
	"from_warehouse_code": "WH-01",
	"to_warehouse_code": "WH-02",
	"authorized_by": "Coordinador de Almacén",
	"requested_by": "Cocina",
	"reference": "TRF-241112",
	"notes": "Traslado urgente a cocina caliente",
	"lines": [
		{ "article_code": "ING-001", "quantity": 10, "unit": "STORAGE" },
		{ "article_code": "BEB-050", "quantity": 24, "unit": "RETAIL", "notes": "Caja completa" }
	]
}
```

### Catálogo de bodegas (`/api/inventario/warehouses`)

- `GET /api/inventario/warehouses?include_inactive=1`: lista las bodegas activas y opcionalmente las inactivas. Responde con `items[]` (`{ id, code, name, is_active }`). Requiere sesión válida con rol `FACTURADOR`, `ADMINISTRADOR` o permisos `inventory.view` / `inventory.report.view`.
- `POST /api/inventario/warehouses`: crea una nueva bodega. Acepta `code`, `name` y `is_active` (por defecto `true`). Restringido a administradores.
- `PATCH /api/inventario/warehouses/{code}`: actualiza `name` y/o `is_active` de una bodega existente. Devuelve el registro normalizado. Restringido a administradores.

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/inventario/warehouses \
	-H "Content-Type: application/json" \
	-d '{
		"code": "SECUNDARIA",
		"name": "Bodega secundaria",
		"is_active": true
	}'
```

La respuesta exitosa incluye `transaction_id` y `transaction_code`. Las validaciones garantizan almacenes distintos, autorizador obligatorio y cantidades positivas.

## Consecutivos configurables

El tab **Consecutivos** dentro de `/preferencias` centraliza la administración de folios para facturación e inventario. Cada definición pertenece a un `scope` (`INVOICE` o `INVENTORY`) y compone el folio con `prefix`, `padding`, `suffix`, `startValue` y `step`. La interfaz muestra una vista previa del siguiente folio calculada a partir del contador real.

1. **Definiciones** (`/api/preferencias/consecutivos`): crea o ajusta plantillas de folios. Ejemplo de alta:
	```bash
	curl -X POST http://localhost:3000/api/preferencias/consecutivos \
		-H "Content-Type: application/json" \
		-d '{
		  "code": "FACTURAS_FISCALES",
		  "name": "Facturas fiscales",
		  "scope": "INVOICE",
		  "prefix": "F-",
		  "padding": 8,
		  "startValue": 1,
		  "step": 1
		}'
	```
	Los folios avanzan con `step` al confirmar transacciones. Puedes activar/desactivar definiciones sin perder el contador histórico.
2. **Asignación a cajas** (`/api/preferencias/consecutivos/cajas`): cada caja debe tener un consecutivo `INVOICE` antes de emitir facturas. La UI enlaza una lista de cajas (activas e inactivas) y permite limpiar la asignación si requieres pausar el folio. Cuando una caja con sesión abierta usa `SequenceService.generateInvoiceNumber`, el folio queda registrado en la bitácora de la jornada.
3. **Asignación a inventario** (`/api/preferencias/consecutivos/inventario`): define un consecutivo `INVENTORY` para cada tipo de movimiento (`PURCHASE`, `CONSUMPTION`, `ADJUSTMENT`, `TRANSFER`). `InventoryService` consume estos folios mediante `sequenceService.generateInventoryCode` al confirmar compras, consumos, ajustes o traspasos. Si falta la asignación correspondiente el servicio devuelve un error bloqueando la operación.

Consejos prácticos:
- Usa prefijos distintos por serie (ej. `CP-` para compras, `TR-` para traspasos) y mantén `padding` consistente para reportes ordenados.
- Ajusta `startValue` únicamente al crear la definición. Para reiniciar una serie crea una nueva definición y reasígnala; así conservas historial.
- Revisa la columna “Siguiente folio” en la UI para validar que la numeración avance según lo esperado antes de habilitar las cajas o campañas de inventario.
- Al emitir facturas, el backend ignora cualquier `invoice_number` enviado por el cliente y genera el folio usando `SequenceService.generateInvoiceNumber`, actualizando automáticamente el rango de la sesión de caja.

## Autenticación y sesiones

- `POST /api/login` genera una cookie de sesión firmada (`facturador_session`) con vigencia de 12 horas tanto para administradores como para meseros. La cookie se firma con `SESSION_SECRET`, por lo que **debe** ser una cadena aleatoria de al menos 32 caracteres.
- El middleware (`middleware.ts`) protege rutas como `/dashboard`, `/facturacion`, `/articulos`, etc. Si la cookie falta, expira o no es válida, redirige al inicio de sesión y conserva el destino en `?redirect=/ruta`.
- Al cerrar sesión (`/logout`) se invalida la cookie y se redirige a `/?logout=1`. Puedes mostrar un mensaje amigable usando ese query param en la pantalla de inicio.
- La pantalla de login respeta el parámetro `redirect`: tras autenticarse enviará al usuario a la ruta originalmente solicitada.

## Flujo de comandas y mesas

- Los meseros trabajan desde `/mesas`, donde cada envío consolida los productos servidos mediante `OrderService.syncWaiterOrderForTable` (`src/lib/services/orders/OrderService.ts`). La función crea o actualiza el registro en `app.orders`/`app.order_items` y sincroniza el estado táctil en `app.table_state`.
- Las mesas cambian automáticamente entre `normal`, `facturado` y `anulado` usando `setTableOrderStatus` de `TableService` (`src/lib/services/TableService.ts`), lo que mantiene alineados tablero, vista de meseros y facturación.
- El módulo de facturación (`src/app/facturacion/page.tsx`) distingue flujos por `mode`: `mode=direct` para facturar sin pedido y `mode=order` para cobrar comandas abiertas. Esta diferenciación evita crear rutas nuevas y mantiene la navegación consistente.
- Al generar una factura (`POST /api/invoices`), `OrderService.markOrderAsInvoiced` marca la comanda como `INVOICED`, almacena la fecha de cierre y libera la mesa para nuevos turnos. El detalle se conserva como histórico para reimpresiones y reportes.
- Las validaciones de front, back y base de datos están alineadas: cantidades positivas, IVA opcional, disponibilidad de mesa y, ahora, verificación de apertura de caja para el rol facturador. Puedes repasar `tests/api/invoices.test.md` para ejemplos de payload y escenarios de caja.
- Cada factura genera un movimiento de inventario tipo consumo con referencia al folio. Los artículos `KIT` se descargan expandiendo sus componentes; si el kit no maneja stock propio, solo se afectan las existencias de cada componente en el almacén configurado (o en `DEFAULT_SALES_WAREHOUSE_CODE` cuando el artículo no define uno).

## Reportes e impresión

- Los endpoints de reportes soportan respuesta JSON (por defecto) y HTML para impresión agregando `format=html` al querystring.
- En la UI de `/reportes` cada tarjeta incluye un botón "Imprimir" que abre un modal con la vista HTML lista para imprimir sin salir de la página. También puedes abrir la URL directa si prefieres una pestaña nueva.
- En `/caja`, los reportes de apertura y cierre también se muestran en un modal (iframe) listo para imprimir; además se ofrece el enlace para abrir en una pestaña nueva.
- El historial de sesiones de caja se abre ahora desde el botón **Ver historial**, que despliega un modal dedicado con el saldo final de cada jornada y resalta faltantes o sobrantes cuando se registraron.
- Ejemplos rápidos de URLs HTML:
	- `/api/reportes/ventas/resumen?from=2025-11-01&to=2025-11-17&format=html`
	- `/api/reportes/ventas/meseros?from=2025-11-01&to=2025-11-17&waiter_code=MES-01&format=html`
	- `/api/reportes/articulos/top?from=2025-11-01&to=2025-11-17&limit=15&format=html`

## Modo mock (datos en memoria)

Para realizar pruebas sin depender de una instancia de PostgreSQL, activa el modo simulado configurando `MOCK_DATA=true` en `.env.local`.

Credenciales disponibles en modo mock:

| Rol            | Identificador              | Clave/PIN  |
| -------------- | -------------------------- | ---------- |
| Administrador  | `admin@facturador.demo`    | `Admin123!`|
| Mesero         | PIN de acceso              | `4321`     |

En este modo, las autenticaciones se resuelven en memoria y los registros de auditoría se guardan localmente durante la ejecución, lo que permite pruebas rápidas sin afectar la base de datos real.
Las comandas, facturas y estados de mesa se conservan únicamente mientras el proceso de Node.js permanece activo; reiniciar el servidor limpia el historial.
El guardado de sesión funciona igual: aunque el origen de datos sea simulado, las rutas protegidas seguirán requiriendo una cookie válida.

### Roles y permisos disponibles

- `ADMINISTRADOR`: acceso completo a mantenimiento y operaciones. Además de los permisos operativos (`cash.register.open`, `cash.register.close`, `invoice.issue`, `cash.report.view`, `admin.users.manage`) incluye todos los accesos de menú (`menu.*`) y las nuevas capacidades de cuentas por cobrar documentadas debajo.
- `FACTURADOR`: orientado al punto de venta. Permite abrir/cerrar caja, emitir facturas y consultar reportes (`cash.register.open`, `cash.register.close`, `invoice.issue`, `cash.report.view`, `menu.dashboard.view`, `menu.facturacion.view`, `menu.caja.view`, `menu.reportes.view`). Por defecto no tiene acceso al módulo de CxC.

Permisos recientemente añadidos para habilitar el módulo de Cuentas por Cobrar (visibles solo cuando `NEXT_PUBLIC_ES_RESTAURANTE=false`):

| Código | Propósito |
| --- | --- |
| `menu.cxc.view` | Controla el acceso al menú/vista principal de CxC. |
| `customers.manage` | Autoriza la administración del catálogo de clientes. |
| `payment-terms.manage` | Permite mantener las condiciones de pago asignables a cada cliente. |
| `customer.documents.manage` | Habilita la generación de documentos (facturas espejo, notas de crédito, recibos, retenciones) dentro de CxC. |
| `customer.documents.apply` | Permite aplicar o revertir pagos, recibos y retenciones sobre documentos abiertos. |
| `customer.credit.manage` | Gestiona líneas de crédito, bloqueos y ajustes de límite por cliente. |
| `customer.collections.manage` | Autoriza el registro de gestiones y seguimientos de cobranza. |
| `customer.disputes.manage` | Permite documentar y resolver disputas o reclamos asociados a los documentos de CxC. |

El usuario de demostración (`admin@facturador.demo`) posee el rol `ADMINISTRADOR`. Desde el nuevo módulo **Usuarios** puedes crear cuentas adicionales y asignarles roles. Para validar el aislamiento de permisos, crea un usuario con el rol `FACTURADOR`: tendrá acceso al flujo de facturación pero no podrá administrar otros usuarios ni catálogos restringidos.

## Monedas y tipo de cambio

- Define tu moneda local mediante `NEXT_PUBLIC_LOCAL_CURRENCY_CODE` y `NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL`. La moneda extranjera por defecto es USD, pero puedes personalizarla con `NEXT_PUBLIC_FOREIGN_CURRENCY_CODE` y `NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL`.
- El histórico del tipo de cambio se almacena en `app.exchange_rates`. El script maestro (`database/schema_master.sql`) crea la tabla con restricciones para garantizar un registro por día y par de monedas.
- Para registrar una cotización diaria:

```sql
INSERT INTO app.exchange_rates (rate_date, rate_value, base_currency_code, quote_currency_code, source_name)
VALUES ('2025-11-10', 17.38, 'MXN', 'USD', 'Banco de prueba');
```

- El servicio `exchangeRateService` (`src/lib/services/ExchangeRateService.ts`) orquesta el acceso a Prisma mediante `ExchangeRateRepository` y mantiene mocks consistentes cuando `MOCK_DATA=true`. Expone `getExchangeRateHistory`, `getCurrentExchangeRate`, `getExchangeRateForDate` y `upsertExchangeRate`.

## UI y componentes reutilizables

- Tokens de diseño centralizados en `src/app/globals.css`.
- Utilidades `cn` (`src/lib/utils.ts`) y componentes base shadcn en `src/components/ui`.
- Provider de tema en `src/components/providers/theme-provider.tsx`.
- Header y toggler de tema (`src/components/layout/site-header.tsx`, `src/components/theme-toggle.tsx`) reutilizan el logotipo configurable cuando está disponible.
- Pantalla de inicio de sesión con modo administrador (usuario/contraseña) y modo mesero (PIN) en `src/app/page.tsx`, mostrando el logotipo definido en `NEXT_PUBLIC_CLIENT_LOGO_URL` si se proporciona.
- Dashboard administrativo en `/dashboard` con menú lateral colapsable, métricas táctiles de ventas y recomendaciones operativas.
- Facturación en `/facturacion`: vista inicial con menú de flujos internos. Desde allí se accede a **Facturación sin pedido** (facturas manuales o asignadas a mesas disponibles), **Facturación con pedido** (mesas ocupadas listas para cobro) y **Listas de precio** (administración de listas, activaciones, predeterminadas y mantenimiento de artículos/precios mediante modales con buscador). Cada flujo mantiene el historial de la sesión y soporta múltiples formas de pago, IVA opcional y ticket térmico 3".
- Menú de artículos en `/articulos`: distribuye el mantenimiento en tres submódulos — **Catálogo de artículos** (`/articulos/catalogo`) con listado filtrable y formularios modales, **Unidades de medida** (`/articulos/unidades`) para mantener códigos, factores y estados, y **Ensamble de kits** (`/articulos/ensamble`) con listado de kits y modal de componentes usando `KitBuilder`.
- Inventario en `/inventario`: nuevo hub que agrupa Kardex, Existencias, Registro de compras, Registro de consumos y Traspasos dentro del módulo. Cada subpágina ofrece filtros básicos con datos mock listos para conectar a SQL, manteniendo navegación táctil y botón de regreso consistente. Kardex y Existencias ahora incluyen filtros multiselección para artículos y bodegas (doble clic abre los modales) y admiten vista previa de impresión en orientación horizontal.
- Módulos base para `/mesas` y `/meseros`: vistas listas para alojar el mantenimiento operativo (zonas, asignaciones, credenciales) con estructura responsive y accesible, mientras se integran los formularios definitivos.

## Catálogo de artículos y precios

Tablas principales (ver `database/schema_master.sql`):

- `app.article_classifications`: jerarquía de hasta 6 niveles (`level`, `full_code`). Cada nivel concatena su `code` para formar el `full_code` padre-hijo (ej. `01` → `0101` → `010101`). En la UI actual de artículos se usan tres niveles (`classification_level1_id`, `classification_level2_id`, `classification_level3_id`).
- `app.units`: unidades de medida administradas centralmente (ej. UND, Caja, Litro).
- `app.articles`: ahora referencia unidades por ID (`storage_unit_id`, `retail_unit_id`), agrega `article_type` (`TERMINADO` o `KIT`), `default_warehouse_id` y mantiene `conversion_factor` (cuántas unidades detalle equivalen a una unidad de almacén). Las columnas de texto `storage_unit` y `retail_unit` permanecen solo por compatibilidad temporal.
- `app.price_lists`: listas de precio con vigencia (`start_date`, `end_date`).
- `app.article_prices`: histórico de precios por artículo y lista (sin columna de unidad). El precio se almacena en unidad detalle y se convierte a almacén multiplicando por `conversion_factor` cuando se necesita.
- `app.article_price_rules`: reglas de descuento (`DISCOUNT` porcentaje) o bonificación (`BONUS` cantidad) según rangos `min_qty` / `max_qty`.
- `app.article_kits`: define componentes (BOM) de los artículos de tipo `KIT`, expresados en cantidad de unidad detalle.
- `app.invoice_items`: desglose de líneas asociadas a la factura (cantidad, descripción, precios). Incluye relación a `app.invoices`.

Variable de entorno relevante para precios:

```
DEFAULT_PRICE_LIST_CODE=BASE
```

Flujo básico:
1. Crear artículo via `POST /api/articulos` (sin precio).
2. Gestionar unidades via `GET/POST /api/unidades`.
3. Si el artículo es KIT: tras guardarlo, usar el panel de armado en la UI para definir componentes (solo artículos TERMINADO) y sus cantidades (unidad detalle). Guardado via `POST /api/kits`.
4. Gestionar precios via endpoint dedicado (próxima iteración) y consultar precio vigente con `GET /api/articulos?price_list_code=BASE&unit=RETAIL`.
5. En facturación, seleccionar artículo y convertir entre unidades usando `conversion_factor`. Si es KIT (futuro): expandir componentes para impacto inventario.
6. Aplicar reglas según cantidad (futuras mejoras: endpoint que calcule precio efectivo con descuento/bonificación).

Ejemplo alta rápida (con clasificación multinivel):

```json
{
	"article_code": "CAF-001",
	"name": "Café tostado bolsa 500g",
	"storage_unit_id": 2,
	"retail_unit_id": 1,
	"conversion_factor": 12,
	"article_type": "TERMINADO",
	"classification_level1_id": 1,
	"classification_level2_id": 2,
	"classification_level3_id": 3
}
```

Respuesta:

```json
{ "id": 7 }
```

Consulta:

```bash
GET /api/articulos?price_list_code=BASE&unit=RETAIL
```

Retorna `items[]` con `price.base_price` convertida a la unidad solicitada.

Próximos pasos sugeridos (backlog funcional):
- Endpoint para cálculo de precio efectivo aplicando reglas de `app.article_price_rules`.
- Selector integrado en `/facturacion` para añadir artículos del catálogo.
- Interfaz para mantenimiento de clasificaciones jerárquicas (árbol navegable completo niveles 1–6).
- Gestión de reglas de descuento/bonificación desde UI.
- Módulo de inventario base (stock por bodega y movimientos/kardex) con expansión automática de kits en ventas/compras.
- Módulo de listas de precio y asignación de precios (`/precios`).

Para añadir nuevos componentes shadcn:

```bash
npx shadcn-ui@latest add button
```

El proyecto ya está configurado con Tailwind + `tailwindcss-animate` y alias `@/*`.

## Asociaciones artículo-bodega

- El servicio `ArticleWarehouseService` (y su repositorio) administra la relación entre `app.articles` y `app.article_warehouses`, manteniendo un `default_warehouse_id` actualizado y permitiendo mock mode con las mismas firmas de método.
- La API `GET/POST/DELETE /api/articulos/{article_code}/almacenes` expone las asociaciones disponibles, realiza upsert de cada vínculo, permite marcar un almacén como principal y elimina entradas sin tocar directamente las tablas desde controladores.
- La UI incorpora la página `/articulos/[article_code]/almacenes`, disponible al pulsar el nuevo botón "Administrar bodegas" en el modal del catálogo, donde se listan las bodegas activas/inactivas junto con acciones para asociar, desasociar o marcar como primaria.
- Este mantenimiento facilita que `InventoryService` y los movimientos de venta siempre encuentren una bodega válida y evita errores como “no está asociado a una bodega”; además reduce el uso del `DEFAULT_SALES_WAREHOUSE_CODE` solo a casos de dato faltante extremo.

## Docker

Construcción de imagen:

```bash
docker build -t facturador:latest .
docker run --env-file .env.production -p 3000:3000 facturador:latest
```

El `Dockerfile` crea una imagen minimalista usando el output `standalone` de Next.js.

## Estructura recomendada

```
src/
	app/              # Rutas App Router y endpoints API (dashboard, facturacion, articulos, inventario, compras, reportes)
	components/       # Componentes UI y providers
	config/           # Configuración global (site)
	lib/              # Utilidades, env y capa de datos
database/          # Script maestro schema_master.sql (fuente única de verdad de la BD)
src/lib/services/InvoiceService.ts # Capa de negocio para facturas y pagos múltiples
```

## Calidad y próximos pasos

- Ajusta reglas de ESLint según tus estándares.
- Añade pruebas end-to-end con Playwright o Cypress según sea necesario.
- Configura pipelines CI/CD para ejecutar `lint`, `typecheck`, `test` y build Docker.
- Requisito: toda nueva funcionalidad debe incluir pruebas (unitarias y/o API) bajo `tests/**`. Asegúrate de que `npm test` pase en local y CI.
- Conecta el dashboard con datos reales vía servicios o vistas SQL y define umbrales dinámicos para las alertas sugeridas.
- Añadir pruebas unitarias para `insertInvoice` en modo mock y con transacción SQL (cuando haya entorno de pruebas).
- Agregar verificación opcional de que la suma de pagos cubre el total antes de permitir impresión (modo estricto configurable).

## Actualización Continua

Para garantizar que la documentación esté siempre alineada con el estado actual del proyecto, actualiza los siguientes archivos cada vez que realices cambios significativos:


- Cabecera optimizada para hidratar correctamente al compartir clases entre SSR y cliente.

 Hecho con dedicacion para optimizar la operacion de facturacion.
