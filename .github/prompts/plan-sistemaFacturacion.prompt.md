# Plan del Sistema de Facturación

## Objetivo
Migrar y operar todos los módulos sobre Prisma con patrón Repositorio + Servicio, manteniendo modo mock consistente y API Handlers que dependan solo de servicios.

## Línea base de arquitectura
- Next.js 15 (App Router), React 18, TypeScript.
- Acceso a datos centralizado con Prisma (`src/lib/db/prisma.ts`).
- Capa de Repositorios (`src/lib/repositories/**`): adaptan Prisma ⇄ DTOs.
- Capa de Servicios (`src/lib/services/**`): regla de negocio, mock mode (`MOCK_DATA=true`).
- UI: shadcn/ui + Tailwind; utilidades en `src/lib/utils.ts`.
 - Reportes con salida HTML (`format=html`) y UI de impresión en modal (iframe) para `/reportes` y `/caja` (aperturas/cierres).

## Variables de entorno clave
- `NEXT_PUBLIC_ES_RESTAURANTE`: bandera maestra para habilitar/ocultar Mesas, Meseros y facturación con pedido. Expone `env.features.isRestaurant` (true = restaurante, false = modo retail con CxC) y acepta equivalentes truthy (`true|1|yes|on`) o falsy (`false|0|no|off`) para sincronizar servidor y cliente.
- `LICENSE_MAX_CASH_REGISTERS`: límite licenciado de cajas activas y sesiones simultáneas (`0` o vacío = ilimitado). Disponible vía `env.licenses.maxCashRegisters`.
- Permisos base de CxC (solo visibles cuando `NEXT_PUBLIC_ES_RESTAURANTE=false`): `menu.cxc.view`, `customers.manage`, `payment-terms.manage`, `customer.documents.manage`, `customer.documents.apply`, `customer.credit.manage`, `customer.collections.manage`, `customer.disputes.manage`. Los seeds asignan este paquete al rol `ADMINISTRADOR` y el middleware exige `menu.cxc.view` para `/cuentas-por-cobrar`.

## Estado actual
- Reportes: `ReportService` consolidado; endpoints `/api/reportes/**` soportan JSON y `format=html` (impresión).
- Precios: `PriceListService` operativo; `/api/precios` y `/api/articulos` consumen servicio.
- Inventario: `InventoryService` con existencias/kardex; ambas vistas soportan filtros multiselección de artículos/bodegas y reportes HTML imprimibles. Los formularios de compras/consumos/traspasos ya usan grillas multi-línea con totales en vivo y, tras guardar, muestran un banner con folio + accesos directos a visor/impresión. El nuevo submódulo `/inventario/documentos` lista folios recientes y abre el visor lateral.
- Documentos de inventario: repositorio + servicio devuelven encabezado/detalle (incluyendo movimientos asociados); `/api/inventario/documentos/[transactionCode]` expone JSON/HTML y `/api/inventario/documentos` lista folios filtrables (tipo, almacén, rango, búsqueda). La UI se alimenta exclusivamente de `inventoryService.listTransactionHeaders`/`getTransactionDocument` para mantener la paridad entre DB y mock.
	- Aplicar la migración `20251203103000_inventory_transactions_updated_at` garantiza la columna `updated_at` necesaria para el trigger `trg_inventory_transactions_touch_updated_at` y evita el error `The column "new" does not exist` al recalcular totales.
- Unidades: `UnitService` y endpoints `/api/unidades` migrados.
- Mesas/Zonas/Meseros: `TableService` y `WaiterService`; `/api/tables/**` y `/api/meseros/**` dependen de servicios. `OrderService.syncWaiterOrderForTable` integra UI de meseros.
- Cajas: `CashRegisterService` migrado, reportes de apertura/cierre con HTML y modal de impresión en UI; el historial vive en un modal separado que muestra saldo final y diferencias (faltantes/sobrantes) por sesión. El cliente mostrador predeterminado se asigna desde `/preferencias` → **Cajas** (solo cuando `NEXT_PUBLIC_ES_RESTAURANTE=false`) mediante doble clic en la columna correspondiente; el buscador solo lista clientes activos con condición de pago CONTADO (solo administradores).
- Asociaciones artículo–bodega: `ArticleWarehouseService` y endpoint `/api/articulos/[article_code]/almacenes` (GET/POST/DELETE) disponibles; UI de mantenimiento enlazada desde el modal del catálogo.
- Consecutivos: `SequenceService` con repositorio Prisma, UI en `/preferencias` (tab **Consecutivos**), endpoints `/api/preferencias/consecutivos`, `/api/preferencias/consecutivos/cajas` e `/api/preferencias/consecutivos/inventario`, y pruebas en `tests/api/preferencias.consecutivos.test.ts`. Los folios `INVOICE` compartidos por varias cajas y los folios `INVENTORY` asignados a varios tipos comparten un contador global para evitar reinicios por flujo.
- Fundamentos CxC: migración `20251128101500_cxc_core_tables` agrega tablas `payment_terms`, `customers`, `customer_documents`, `customer_document_applications`, `customer_credit_lines`, `collection_logs`, `customer_disputes` y enlaza `invoices` con `customer_id/payment_term_id/due_date`.
- API CxC inicial: `/api/preferencias/terminos-pago`, `/api/cxc/clientes`, `/api/cxc/documentos` y `/api/cxc/documentos/aplicaciones` reutilizan `PaymentTermService`, `CustomerService`, `CustomerDocumentService` y `CustomerDocumentApplicationService`, más `requireCxCPermissions` para permisos; soportan `MOCK_DATA`.
- UI CxC Documentos: modal controlado para altas manuales (facturas, recibos, notas) en `/cuentas-por-cobrar` que carga catálogos bajo demanda, calcula vencimiento con la condición de pago y sincroniza saldo ↔ monto original. El listado debe exponer filtros de cliente/tipo/rango de emisión alineados con los parámetros `customerId`, `documentType`, `dateFrom` y `dateTo` para soportar accesos directos desde el catálogo de clientes.
- Documentación actualizada (`README.md`, `.github/copilot-instructions.md`, `docs/propuesta-arquitectura-mejoras.md`).
- Los nuevos handlers CxC deben importar `requireCxCPermissions` y sólo invocar métodos de servicio (nunca repositorios) para mantener paridad entre DB y modo mock.

## Próximas tareas
1) Completar inventario y listas de precios (bordes pendientes) en repos/servicios.
2) Clasificaciones: `ArticleClassificationService` en API y UI.
3) Revisión continua para asegurar dependencia exclusiva de servicios en handlers.
4) Métricas de performance (p95) en logs y seguimiento en reportes críticos.
5) Integrar `SequenceService.generateInvoiceNumber` en `InvoiceService` y registrar rangos por sesión de caja; añadir métricas/reporte que expongan inicio/fin de folios por jornada.
6) Diseñar y automatizar suites Jest para `/api/preferencias/terminos-pago`, `/api/cxc/clientes`, `/api/cxc/documentos` y `/api/cxc/documentos/aplicaciones` (modo DB + mock).
7) Conectar la UI de CxC/facturación retail con los nuevos endpoints (selector de cliente, condiciones de pago, ledger y aplicaciones).
- `/api/articulos`: acepta `price_list_code`, `unit`; UI espera `items[].price.base_price`.
- `/api/inventario/traspasos`: validación con Zod; persiste transacciones y movimientos.
- `/api/articulos/[article_code]/almacenes`: administra asociaciones artículo-bodega; sincroniza `articles.default_warehouse_id` vía `ArticleWarehouseService`.
- `/api/tables` y `/api/meseros/tables`: siempre via `TableService`.
- `/api/invoices`: valida caja abierta y rechaza saldo pendiente; registra consumos inventario.
- `/api/reportes/**`: `format=html` entrega documento imprimible; JSON por defecto.
- `/api/cajas/aperturas|cierres/{sessionId}/reporte`: HTML imprimible protegido (token/cookies Next).
- Enlaces absolutos: construirlos siempre con `env.appUrl` (`NEXT_APP_URL`) para reportes o callbacks externos; no utilices `request.nextUrl.origin` en producción.

## Convenciones
- Zod en handlers; toasts con `useToast()`; monetario con `getCurrencyFormatter`/`formatCurrency`.
- Fechas de negocio normalizadas con `toCentralClosedDate`/`toCentralEndOfDay` (UTC-6). Auditoría conserva hora exacta con el mismo desfase.
- `mode` en `src/app/facturacion/page.tsx` para flujos.
- Evitar legacy `src/lib/db/**` en nuevos handlers; agregar operaciones a servicios y luego consumirlos.
- Política de calidad: toda nueva funcionalidad debe incluir tests (unitarias y/o API) bajo `tests/**`.
- `NEXT_PUBLIC_CLIENT_LOGO_URL` define el logotipo mostrado en el login y el encabezado; siempre proveer fallback textual cuando no esté set.
- Encabezados y tickets toman `NEXT_PUBLIC_COMPANY_NAME` y `NEXT_PUBLIC_COMPANY_ADDRESS`; mantén ambos actualizados para impresión.
- Siempre usa `hasSessionPermission` y los guards del middleware para validar los permisos de CxC mencionados arriba antes de exponer rutas de clientes, documentos, aplicaciones o gestiones.

## Modo Mock
- Servicios exponen memoria interna en `MOCK_DATA=true` con la misma interfaz pública.
- Mantener paridad funcional en mocks para flujos críticos (facturación, cajas, mesas).

## Checklist de definición de hecho
- Tipado estricto sin `any` implícito en nuevas piezas.
- `npm run lint` y `npm run typecheck` en verde.
- Pruebas de endpoints clave y servicios cubiertas (Jest) y en verde.
- README, instrucciones de copilot y doc de arquitectura actualizados.
