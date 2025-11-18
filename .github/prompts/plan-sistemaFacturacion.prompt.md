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

## Estado actual
- Reportes: `ReportService` consolidado; endpoints `/api/reportes/**` soportan JSON y `format=html` (impresión).
- Precios: `PriceListService` operativo; `/api/precios` y `/api/articulos` consumen servicio.
- Inventario: `InventoryService` con existencias/kardex; ambas vistas soportan filtros multiselección de artículos/bodegas y reportes HTML imprimibles; traspasos/consumos en consolidación.
- Unidades: `UnitService` y endpoints `/api/unidades` migrados.
- Mesas/Zonas/Meseros: `TableService` y `WaiterService`; `/api/tables/**` y `/api/meseros/**` dependen de servicios. `OrderService.syncWaiterOrderForTable` integra UI de meseros.
- Cajas: `CashRegisterService` migrado, reportes de apertura/cierre con HTML y modal de impresión en UI.
- Asociaciones artículo–bodega: `ArticleWarehouseService` y endpoint `/api/articulos/[article_code]/almacenes` (GET/POST/DELETE) disponibles; UI de mantenimiento enlazada desde el modal del catálogo en `/articulos/[article_code]/almacenes`.
- Documentación actualizada (`README.md`, `.github/copilot-instructions.md`, `docs/propuesta-arquitectura-mejoras.md`).
- QA: suites Jest amplias (134 tests en verde); `npm run lint` y `npm run typecheck` obligatorios.

## Próximas tareas
1) Completar inventario y listas de precios (bordes pendientes) en repos/servicios.
2) Clasificaciones: `ArticleClassificationService` en API y UI.
3) Revisión continua para asegurar dependencia exclusiva de servicios en handlers.
4) Métricas de performance (p95) en logs y seguimiento en reportes críticos.

## Contratos clave
- `/api/articulos`: acepta `price_list_code`, `unit`; UI espera `items[].price.base_price`.
- `/api/inventario/traspasos`: validación con Zod; persiste transacciones y movimientos.
- `/api/articulos/[article_code]/almacenes`: administra asociaciones artículo-bodega; sincroniza `articles.default_warehouse_id` vía `ArticleWarehouseService`.
- `/api/tables` y `/api/meseros/tables`: siempre via `TableService`.
- `/api/invoices`: valida caja abierta; registra consumos inventario.
- `/api/reportes/**`: `format=html` entrega documento imprimible; JSON por defecto.
- `/api/cajas/aperturas|cierres/{sessionId}/reporte`: HTML imprimible protegido (token/cookies Next).

## Convenciones
- Zod en handlers; toasts con `useToast()`; monetario con `getCurrencyFormatter`/`formatCurrency`.
- `mode` en `src/app/facturacion/page.tsx` para flujos.
- Evitar legacy `src/lib/db/**` en nuevos handlers; agregar operaciones a servicios y luego consumirlos.
- Política de calidad: toda nueva funcionalidad debe incluir tests (unitarias y/o API) bajo `tests/**`.
- `NEXT_PUBLIC_CLIENT_LOGO_URL` define el logotipo mostrado en el login y el encabezado; siempre proveer fallback textual cuando no esté set.

## Modo Mock
- Servicios exponen memoria interna en `MOCK_DATA=true` con la misma interfaz pública.
- Mantener paridad funcional en mocks para flujos críticos (facturación, cajas, mesas).

## Checklist de definición de hecho
- Tipado estricto sin `any` implícito en nuevas piezas.
- `npm run lint` y `npm run typecheck` en verde.
- Pruebas de endpoints clave y servicios cubiertas (Jest) y en verde.
- README, instrucciones de copilot y doc de arquitectura actualizados.
