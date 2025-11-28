# Plan de implementación – Bandera `EsRestaurante` y límite de cajas licenciadas

> Última actualización: 30 nov 2025

## 1. Objetivos generales
- **Configurar la plataforma para operar fuera del vertical de restaurantes** mediante una bandera (`EsRestaurante`) que oculte y deshabilite flujos exclusivos (mesas, meseros, facturación con pedido y tableros asociados).
- **Habilitar un flujo retail basado en catálogo de clientes y cuentas por cobrar** cuando `EsRestaurante=false`, reforzando la captura de cliente, ventas a crédito y seguimiento de saldos pendientes.
- **Incorporar un límite licenciado de cajas registradoras** (creación y sesiones activas) para que cada instalación respete el número permitido por contrato.
- **Documentar y probar** los nuevos comportamientos para que el equipo pueda validar fácilmente ambos escenarios (restaurante vs. retail/genérico) y los topes de caja.

## 2. Alcance funcional
| Tema | Incluye | Excluye |
| --- | --- | --- |
| Bandera `EsRestaurante` | Variables de entorno, configuración compartida, UI (sidebar, páginas, modales), handlers `/api/mesas` y `/api/meseros`, facturación con pedidos, pruebas y documentación. | Cambios en dominio de inventario, reportes, o diseño visual más allá de ocultar/inhabilitar componentes. |
| Límite de cajas | Validaciones en creación/activación de cajas, sesiones abiertas, retornos de API, mensajes de UI y pruebas API. | Ajustes de licenciamiento para otros módulos distintos a caja. |

## 3. Variables de entorno nuevas
1. `NEXT_PUBLIC_ES_RESTAURANTE` (booleano, default `true`). Se leerá en `src/lib/env.ts` y expondrá `env.features.isRestaurant`.
2. `LICENSE_MAX_CASH_REGISTERS` (entero positivo; `0` o vacío = ilimitado). Se expondrá como `env.licenses.maxCashRegisters`.
3. Ambos valores se documentarán en `.env.example`, `README.md`, `.github/copilot-instructions.md` y `.github/prompts/plan-sistemaFacturacion.prompt.md`.

## 4. Cambios por capa
### 4.1 Configuración y utilidades
- **`src/lib/env.ts`**: extender el esquema Zod para validar las nuevas variables, exponer objetos `features` y `licenses`, memorizar valores y derivar un `publicFeatures` para componentes cliente.
- **`src/config/features.ts`** (nuevo): exportar helpers `isRestaurant()` y `getFeatureFlag` usando `env`. Será consumido en componentes de servidor y rutas.
- **`src/components/providers/session-provider` o equivalente**: si se requiere, pasar metadata de flags al cliente (p.ej. `window.__features`).

### 4.2 UI / Navegación
- **`src/components/layout/sidebar.tsx`**: condicionar los items "Mesas" y "Meseros" (y cualquier atajo a `/meseros`) según `env.features.isRestaurant`. Mostrar tooltip indicando que la función está deshabilitada cuando la bandera esté en `false`.
- **`src/app/facturacion/page.tsx`**: ocultar tarjetas y modos `con-pedido` cuando `isRestaurant=false`; mostrar un banner que explique que el flujo de mostrador está activo para retail.
- **`src/app/facturacion/page.tsx` (modo retail)**: habilitar selector de clientes (catálogo) y acciones rápidas hacia Cuentas por Cobrar para registrar ventas a crédito o contado, reflejando el estatus del cliente y adeudos vigentes.
- **Reuso del flujo sin pedido**: no se creará una pantalla nueva; la vista actual de “Facturación sin pedido” se extenderá con los componentes de cliente/condición de pago para mantener el comportamiento estable existente (totales, pagos, tickets) y solo añadir el contexto retail cuando la bandera esté desactivada.
- **`src/app/mesas/**` y `src/app/meseros/**`**: envolver la UI en un guard (página informativa con CTA para volver al dashboard) cuando la bandera esté apagada.
- **Inicio de sesión de meseros**: ocultar/deshabilitar la pantalla de login de meseros (incluyendo rutas públicas o modales que apunten a `/meseros`) cuando `NEXT_PUBLIC_ES_RESTAURANTE=true` para evitar accesos innecesarios en modo retail.
- **`src/app/caja/page.tsx`**: añadir UI para mostrar el límite configurado y mensajes claros cuando la API devuelva error por sobrepasar la licencia.
- **`src/app/cuentas-por-cobrar/**`** (existente o nuevo módulo): destacar la lista de clientes, saldos y acciones para aplicar pagos que provienen de facturas retail.
- **Dashboard básico de CxC**: presentar aging simplificado (0-30/31-60/61-90/90+) y alertas de clientes al 80% del límite de crédito usando los datos existentes, además de accesos rápidos a gestiones y disputas.
- **Permisos/roles**: todo nuevo módulo (clientes, cuentas por cobrar, payment terms) debe definirse en el mismo esquema de permisos por usuario existente (`menu.*`, `cxp.*`, etc.), incluirse en el seed y mostrarse/ocultarse en la UI en función tanto del permiso como de `env.features.isRestaurant`. Ya se registraron los códigos `menu.cxc.view`, `customers.manage`, `payment-terms.manage`, `customer.documents.manage`, `customer.documents.apply`, `customer.credit.manage`, `customer.collections.manage` y `customer.disputes.manage` (asignados al rol `ADMINISTRADOR` y expuestos en `MOCK_ROLE_PERMISSIONS`); el middleware exige `menu.cxc.view` para `/cuentas-por-cobrar`. Cuando la bandera esté en `true`, estos módulos permanecen ocultos y deshabilitados aunque el usuario tenga permisos.

### 4.3 Base de datos / Prisma
> **Avance 2025-11-28**: La migración `20251128101500_cxc_core_tables` ya crea `payment_terms`, `customers`, `customer_documents`, `customer_document_applications`, `customer_credit_lines`, `collection_logs`, `customer_disputes` y enlaza `invoices` con `customer_id`, `payment_term_id` y `due_date`. Esta sección mantiene el desglose funcional para guiar los servicios y APIs que explotarán dichas tablas.
- **Catálogo de clientes**: nueva tabla `customers` con campos básicos (RFC/NIT, razón social, contacto, límite de crédito, estatus) y timestamps, más `payment_term_id` para enlazar la condición de pago asignada. Debe contar con migración Prisma y actualización de `schema_master.sql`.
- **Catálogo de condiciones de pago**: nueva tabla `payment_terms` (CRUD completo) con columnas `id`, `code`, `description`, `days` (0=contado, 15/30/60/90/120, etc.), `is_active`. Los clientes referencian esta tabla y las facturas a crédito calculan la fecha de vencimiento sumando `days` a la fecha de emisión cuando sea >0.
- **Líneas de crédito**: tabla `customer_credit_lines` para mantener límite asignado, saldo disponible, porcentaje usado y banderas de bloqueo automático cuando la cartera vencida supere umbrales. Debe rastrear revisiones y usuarios responsables.
- **Documentos de CxC**: nueva tabla `customer_documents` con columnas `id`, `customer_id`, `document_type` (catálogo: `INVOICE`, `CREDIT_NOTE`/NC, `RECEIPT`/ROC, `RETENTION`/RET, `DEBIT_MEMO`, etc.), `source_invoice_id` (FK opcional que referencia `invoices.id` para duplicar encabezado), `reference_code`, `currency_code`, `amount_total`, `balance_remaining`, `issued_at`, `status`. No almacenará detalle de partida; el detalle sigue consultándose en `invoices`.
- **Aplicaciones / movimientos**: tabla `customer_document_applications` para registrar qué recibo/retención se aplica a qué documento, con `from_document_id`, `to_document_id`, `applied_amount`, `created_by`, `notes`. Permitirá pagos parciales, múltiples aplicaciones, desaplicaciones (con historial) y ordenará la prioridad de aplicación (retenciones primero, recibos después).
- **Gestiones de cobranza**: tabla `collection_logs` para registrar recordatorios, llamadas, compromisos de pago y próximos seguimientos. Servirá para alimentar KPIs básicos.
- **Disputas y reclamos**: tabla `customer_disputes` vinculada a documentos para capturar causa, estado y ajustes aplicados.
- **Retenciones**: soportar `document_type=RETENTION` y almacenar porcentaje/base en columnas adicionales (p.ej. `retention_base_amount`, `retention_percentage`).
- **Integración con facturas**: cada factura retail generará un registro en `customer_documents` copiando el encabezado (totales, cliente, vencimiento) y quedará ligada a la factura original para consultar detalle desde el historial.
- **Mock data**: crear semillas equivalentes cuando `MOCK_DATA=true` para no romper ambiente sin PostgreSQL.


### 4.3 API / Handlers
- **`src/app/api/tables/**`** y **`src/app/api/meseros/**`**: rechazar peticiones si `isRestaurant` es `false` (status 403 + mensaje orientativo). Incluir pruebas en `tests/api/meseros.tables.select.test.ts` y equivalentes.
- **`src/app/api/facturacion/**` y endpoints de cuentas por cobrar**: exigir `customer_id` cuando `isRestaurant=false`, permitir ventas a crédito y registrar/actualizar los saldos en el módulo de cuentas por cobrar.
- **`src/app/api/payment-terms/**`**: exponer endpoints CRUD para gestionar las condiciones de pago; validar que no existan clientes asociados antes de borrar o desactivar.
- **Permisos API**: extender los checks de `requireAdministrator`/`hasSessionPermission` para reutilizar los códigos existentes y agregar nuevos códigos (por ejemplo `menu.cxc.view`, `customers.manage`, `payment-terms.manage`). Los handlers deben negar acceso cuando `NEXT_PUBLIC_ES_RESTAURANTE=true` aunque el permiso esté presente, manteniendo consistencia.
- **Aplicación y desaplicación de documentos**: exponer endpoints para aplicar y desaplicar documentos. Las retenciones (`RET`) deben aplicarse antes que los recibos (`ROC`); las reglas deben seguir prácticas estándar de CxC (aplicar primero retenciones obligatorias, luego notas/créditos, finalmente pagos). Registrar cada movimiento con reversión segura.
- **Líneas de crédito y bloqueo automático**: endpoints para asignar/ajustar límites, revisar saldo y bloquear clientes cuando superen 80% o tengan cartera vencida mayor al umbral; las facturas deben leer este estado antes de emitirse.
- **Gestiones y disputas**: rutas para crear/consultar gestiones de cobranza y registrar disputas con resolución básica; se integran al dashboard y al historial del cliente.
- **`src/app/api/cajas/route.ts`** (POST) y otros endpoints relevantes: propagar los errores de límite provenientes del servicio y estandarizar códigos (400 ó 409 según caso).

### 4.4 Servicios y repositorios
- **`src/lib/services/CashRegisterService.ts`**:
  - Al crear una caja (`createCashRegister`) validar el número de cajas activas vs. `env.licenses.maxCashRegisters`. Permitir crear inactivas si se supera el límite solo cuando `isActive=false` (opcional, documentarlo en el plan si se decide).
  - Al activar una caja existente (`updateCashRegister` con `isActive=true`) volver a chequear el límite.
  - En `openCashRegisterSession`, validar: (a) número de cajas activas en la base y (b) número de sesiones abiertas simultáneas si el requerimiento lo solicita (el usuario pidió “ni crear más de las permitidas ni que estén activas más de las permitidas”; interpretaremos "activas" como cajas registradas activas y sesiones concurrentes). Esto implicará contar sesiones abiertas globales.
  - Normalizar mensajes de error para que la UI pueda mostrar "Se alcanzó el tope de cajas licenciadas (N)".
- **`src/lib/repositories/cash-registers/CashRegisterRepository.ts`**:
  - Agregar métodos `countActiveCashRegisters()` y `countOpenCashRegisterSessions()`.
  - Reutilizarlos en los servicios anteriores, siempre dentro de transacciones cuando aplique.
- **Nueva capa CxC**:
  - `CustomerRepository` y `CustomerService` para CRUD del catálogo de clientes.
  - `PaymentTermRepository/Service` para administrar las condiciones de pago y exponer funciones auxiliares para calcular vencimientos.
  - `CustomerDocumentRepository/Service` para gestionar documentos (crear registros espejo de las facturas retail, emitir notas de crédito, recibos, retenciones) y calcular balances.
  - `CustomerDocumentApplicationRepository/Service` para aplicar pagos parciales, desaplicar movimientos, controlar el orden (RET antes de ROC) y auditar qué recibo impactó qué factura.
  - `CustomerCreditLineService` para evaluar límites, bloquear/desbloquear clientes y exponer métricas de porcentaje utilizado.
  - `CollectionLogService` y `CustomerDisputeService` para registrar gestiones, compromisos y reclamos, devolviendo data para KPIs/alerts.
  - Todos los servicios deben exponer modo mock alineado con `MOCK_DATA` y respetar los permisos definidos, devolviendo errores consistentes cuando el usuario no cuente con acceso o cuando `isRestaurant=true`.

### 4.5 Tests
- **Nuevas suites** debajo de `tests/api/caja.*`:
  - `caja.license-limit.test.ts` (nuevo) que cubra: creación rechazada cuando se supera el límite, apertura de sesión bloqueada, mensajes esperados.
- **Ajustes** en pruebas existentes de meseros/mesas para cubrir el caso `isRestaurant=false` (esperar 403). Se pueden duplicar casos usando `describe.each([true,false])` para no romper compatibilidad.

### 4.6 Documentación
- **`README.md`**: sección "Configuración" con explicación de `NEXT_PUBLIC_ES_RESTAURANTE` y `LICENSE_MAX_CASH_REGISTERS`, ejemplos de uso y tabla de escenarios.
- **`README.md` – Modo Retail**: documentar que la facturación usa catálogo de clientes obligatorio y se integra con Cuentas por Cobrar para créditos.
- **`.github/copilot-instructions.md` y `.github/prompts/plan-sistemaFacturacion.prompt.md`**: reflejar las nuevas convenciones.
- **`docs/plan-esrestaurante-cajas.md`** (este archivo) servirá como base de seguimiento.
- **`docs/checklist-esrestaurante-cajas.md`**: checklist vivo para auditar el avance; revisar y actualizar su estado en cada iteración.
- **`docs/investigacion-cxc.md`**: fuente de referencia para mejores prácticas; sincronizar lo implementable con este plan.

## 5. Casos y comportamientos esperados

### 5.1 Bandera `EsRestaurante`
| `isRestaurant` | Vista "Facturación" | Páginas Mesas/Meseros | APIs `/mesas`, `/meseros` |
| --- | --- | --- | --- |
| `true` (default) | Todas las tarjetas (sin/con pedido, historial, listas) | Accesibles | Operan normalmente |
| `false` | Solo flujos sin pedido, historial y listas (si aplica). Se muestra alerta "Modo Retail". | Renderizan mensaje "Funcionalidad deshabilitada" + botón a Dashboard. | Responden `403` con mensaje "Funcionalidad deshabilitada para modo retail". |

### 5.2 Límite de cajas
| Estado | Acción | Comportamiento |
| --- | --- | --- |
| Cajas activas `< límite` | Crear/activar caja | Permitido (200/201). |
| Cajas activas `>= límite` | Crear caja activa | Rechazado con `409` y mensaje "Límite de X cajas alcanzado". |
| Cajas activas `>= límite` | Crear caja inactiva (si se habilita) | Permitido, pero se impide activarla hasta liberar cupo. |
| Sesiones abiertas `< límite` | Abrir sesión | Permitido. |
| Sesiones abiertas `>= límite` | Abrir nueva sesión | Rechazado con `409`, la UI muestra modal con instrucciones para cerrar otra caja. |
| Cajas desactivadas | Abrir sesión | No aplica (no se asignan a operadores). |

> **Avance 28-nov-2025**: Se incorporaron los conteos en `CashRegisterRepository`, las validaciones de límite en `CashRegisterService` (creación, activación y aperturas) y mensajes consistentes "Se alcanzó el tope de cajas licenciadas (N)", cubiertos por la prueba `tests/api/caja.license-limit.test.ts`.

### 5.3 Facturación en modo retail (`isRestaurant=false`)
| Escenario | Comportamiento |
| --- | --- |
| Selección de clientes | La pantalla obliga a elegir un cliente del catálogo o crear uno nuevo antes de facturar. |
| Venta a crédito | Disponible tras seleccionar cliente; genera registro en Cuentas por Cobrar con saldo inicial y vence cuando se abone. |
| Venta de contado | Se permite, pero mantiene la relación con el cliente para historial y reportes. |
| Pagos/recaudación | El módulo de Cuentas por Cobrar muestra la factura y permite registrar pagos parciales o totales, sincronizando con caja. |
| Detalle de documentos | Los registros de CxC replican únicamente el encabezado (totales, fechas); para detalle de partidas se consulta la factura original en el historial de facturación. |
| Aplicación y retenciones | Cada pago, nota o retención genera documentos y aplicaciones específicas, permitiendo parcialidades, retenciones legales y trazabilidad completa. |
| Vencimiento | La fecha de vencimiento se calcula sumando los días definidos en la condición de pago del cliente; si la condición es 0 (contado) el vencimiento coincide con la fecha de emisión. |
| Reportes | Los reportes financieros muestran cartera actualizada y distinguen entre facturas retail vs. restaurante. |

## 6. Estrategia de implementación
1. **Config & documentación** – agregar variables, actualizar instrucciones y exponer helpers.
2. **Feature flag UI/API** – condicionar componentes y handlers de mesas/meseros + facturación.
3. **Límite de cajas** – añadir contadores en repositorio, validaciones en servicio y manejar mensajes en handlers/UI.
4. **Pruebas automatizadas** – cubrir escenarios nuevos (flags y límites).
5. **QA manual** – checklist con matrices de `isRestaurant` x `LICENSE_MAX_CASH_REGISTERS`.

## 7. Consideraciones adicionales
- Mantener compatibilidad retro: si no se define `NEXT_PUBLIC_ES_RESTAURANTE`, asumimos `true`. Si `LICENSE_MAX_CASH_REGISTERS` está vacío o es `0`, no se aplican topes.
- Registrar métricas (opcional futuro) para saber cuántas instalaciones operan en modo retail.
- Al trabajar con mocks (`MOCK_DATA=true`), replicar los mismos límites para evitar diferencias entre ambientes.
- Mensajes al usuario deben seguir el estilo de modal/toast propio (nunca `alert`).
- Investigar y documentar mejores prácticas de CxC (orden de aplicación, retenciones fiscales, notas de crédito) para asegurar que la lógica siga los estándares contables locales.

## 8. Cierre del bloque Créditos y CxC (30 nov 2025)

### Resultado
- Se completó la cadena Facturación ↔ CxC en modo retail: las facturas exigen `customer_id`, generan documentos espejo y actualizan líneas de crédito y aging en el dashboard.
- Los servicios y endpoints de líneas de crédito, gestiones y disputas operan con validaciones de permisos y flag, tanto en PostgreSQL como en modo mock.
- El límite de cajas licenciadas está integrado con mensajes consistentes en UI/API y cuenta con pruebas automatizadas para creación, activación y sesiones.

### Evidencias
- Suites en `tests/api/caja.license-limit.test.ts`, `tests/api/invoices.retail.cxc.test.ts`, `tests/api/cxc.credit-lines.test.ts` y `tests/api/cxc.document-applications.test.ts` cubren los flujos críticos.
- Documentación sincronizada (`README.md`, `.github/copilot-instructions.md`, `.github/prompts/plan-sistemaFacturacion.prompt.md`, `docs/investigacion-cxc.md`, `docs/checklist-esrestaurante-cajas.md`).
- Checklist actualizado a estado **Completado** para los rubros DOC-02 y DOC-03.

### Próximos pasos sugeridos
- Monitorear métricas de crédito y aging en los entornos piloto durante el primer mes en producción.
- Evaluar automatizaciones adicionales (intereses moratorios, alertas avanzadas) reutilizando la base de servicios instalada.
- Revisar periódicamente la configuración de licencias para instaladores que requieran escalamiento de cajas.
