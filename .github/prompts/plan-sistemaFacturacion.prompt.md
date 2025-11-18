# Plan del Sistema de Facturación

## Objetivo
Migrar y operar todos los módulos sobre Prisma con patrón Repositorio + Servicio, manteniendo modo mock consistente y API Handlers que dependan solo de servicios.

## Línea base de arquitectura
- Next.js 15 (App Router), React 18, TypeScript.
- Acceso a datos centralizado con Prisma (`src/lib/db/prisma.ts`).
- Capa de Repositorios (`src/lib/repositories/**`): adaptan Prisma ⇄ DTOs.
- Capa de Servicios (`src/lib/services/**`): regla de negocio, mock mode (`MOCK_DATA=true`).
- UI: shadcn/ui + Tailwind; utilidades en `src/lib/utils.ts`.

## Estado actual
- Precios: `PriceListService` + endpoints `/api/precios` y artículos resolviendo lista por servicio.
- Inventario: `InventoryService` (traspasos, compras, consumos, existencias, kardex) y registro de consumos unificado desde `InvoiceService`.
- Unidades: `UnitService` y endpoints `/api/unidades` y `/api/articulos` migrados.
- Mesas y meseros: `TableService` (Prisma + mock) reemplaza legacy de tablas; rutas `/api/tables/**` y `/api/meseros/tables/**` dependen del servicio. `OrderService.syncWaiterOrderForTable` integra UI de meseros.
- Documentación actualizada (`README.md` y `.github/copilot-instructions.md`).

## Próximas tareas
1) Reportes: consolidar en `ReportService` y migrar `/api/reportes/**`.
2) Clasificaciones: `ArticleClassificationService` en API y UI.
3) Revisión final de handlers para asegurar dependencia exclusiva de servicios.
4) Ejecutar pruebas (unitarias y smoke) y estabilizar.

## Contratos clave
- `/api/articulos`: acepta `price_list_code`, `unit`; UI espera `items[].price.base_price`.
- `/api/inventario/traspasos`: validación con Zod; persiste transacciones y movimientos.
- `/api/tables` y `/api/meseros/tables`: siempre via `TableService`.
- `/api/invoices`: valida caja abierta; registra consumos inventario.

## Convenciones
- Zod en handlers; toasts con `useToast()`; monetario con `getCurrencyFormatter`/`formatCurrency`.
- `mode` en `src/app/facturacion/page.tsx` para flujos.
- Evitar legacy `src/lib/db/**` en nuevos handlers; agregar operaciones a servicios y luego consumirlos.

## Modo Mock
- Servicios exponen memoria interna en `MOCK_DATA=true` con la misma interfaz pública.
- Mantener paridad funcional en mocks para flujos críticos (facturación, cajas, mesas).

## Checklist de definición de hecho
- Tipado estricto sin `any` implícito en nuevas piezas.
- `npm run lint` y `npm run typecheck` en verde.
- Endpoints de salud y de negocio smoke-tested.
- README e instrucciones de copilot actualizados.
