# Copilot Instructions

## Architecture
- **Framework**: Next.js 15 (App Router) with React 18 and TypeScript.
- **Data Layer**: Centralized PostgreSQL access via Prisma (`src/lib/db/prisma.ts`). Data operations are encapsulated in repositories (`src/lib/repositories/**`) consumed by services (`src/lib/services/**`). Always use these layers instead of legacy helpers.
- **Mock Mode**: Services expose a consistent mock mode. When `MOCK_DATA=true`, they delegate to in-memory stores while maintaining the same public interface.
- **UI Utilities**: Shared components (shadcn/ui, Tailwind tokens) reside in `src/components/ui` and `src/lib/utils.ts`. Reuse these components to maintain design consistency.

## Key Workflows
- **Setup**:
  - Install dependencies: `npm install`
  - Run development server: `npm run dev`
  - Build for production: `npm run build && npm run start`
- **Quality Checks**:
  - Linting: `npm run lint`
  - Type checking: `npm run typecheck`
- **Testing**:
  - Smoke test endpoints: `GET /api/health` and `POST /api/invoices` using payloads from the README.
  - New features MUST include tests (unit and/or API). Add/update cases under `tests/**` and ensure `npm test` passes.
- **Documentation**:
  - Update `README.md`, `.github/copilot-instructions.md`, and `.github/prompts/plan-sistemaFacturacion.prompt.md` with every significant change.

## Domain Patterns
- **Facturación**: Flows are separated by `mode` in `src/app/facturacion/page.tsx`. Extiende el switch existente en lugar de crear rutas nuevas. Ninguna factura puede emitirse ni imprimirse cuando el saldo pendiente sea distinto de 0; la UI y el backend devuelven advertencia si falta registrar pagos.
- **Facturas – Anulación**: Las facturas no se borran. La anulación cambia `invoices.status` a `ANULADA` y registra `cancelled_at`. El backend revierte movimientos de inventario al anular.
- **Price Lists**: Use `useRef` caches (`catalogRequestedRef`, `articlesRequestedRef`) to manage fetch guards. Extend these guards instead of duplicating fetch logic.
- **Authentication**: Use `adminUserService` and `waiterService`. Add new operations in services/repositories before modifying handlers.
- **Tables**: Use `TableService` (`src/lib/services/TableService.ts`) to manage table catalog, reservations, waiter snapshots and table state. API routes under `/api/tables/**` y `/api/meseros/tables/**` must consume this service (no `db/tables`).
- **Monetary Values**: Always use `getCurrencyFormatter` or `formatCurrency` to ensure consistent formatting.
- **Fechas**: Normaliza todas las fechas de negocio a medianoche UTC-6 usando `toCentralClosedDate`/`toCentralEndOfDay` (`src/lib/utils/date.ts`). Las columnas de auditoría pueden conservar la hora exacta pero siempre calculada con el mismo desfase.
- **Article–Warehouse Associations**: Use `ArticleWarehouseService` for listing/associating/desasociating bodegas de un artículo y para marcar bodega primaria. Este servicio sincroniza `articles.default_warehouse_id` y lo consumen `InventoryService` y los movimientos de venta. Nunca acceder directamente a tablas desde handlers.
- **Consecutivos**: Gestiona las series con `SequenceService`. Las definiciones (`INVOICE`/`INVENTORY`) se crean/actualizan vía `/api/preferencias/consecutivos`, las cajas se enlazan con `/api/preferencias/consecutivos/cajas` y los movimientos de inventario con `/api/preferencias/consecutivos/inventario`. `SequenceService.generateInvoiceNumber` y `generateInventoryCode` son la única fuente de folios; valida que existan asignaciones antes de emitir facturas o transacciones.
- **Environment Variables**: Usa una sola cadena de conexión para toda la app: `DB_CONNECTION_STRING`. Prisma y el runtime leen de la misma variable (se acepta `DATABASE_URL` solo como alias de compatibilidad si faltara). Lee variables a nivel de módulo y memorizalas cuando se reutilicen (e.g., `NEXT_PUBLIC_VAT_RATE`, `DEFAULT_PRICE_LIST_CODE`, `DEFAULT_SALES_WAREHOUSE_CODE`). `NEXT_PUBLIC_CLIENT_LOGO_URL` controla el logotipo mostrado en login y barra superior y `NEXT_PUBLIC_COMPANY_ADDRESS` define la dirección impresa en tickets.
- **Enlaces absolutos**: Usa `env.appUrl` (derivado de `NEXT_APP_URL`) para construir URLs de reportes u otras rutas públicas en los handlers; evita depender de `request.nextUrl.origin` para no terminar con `0.0.0.0` en producción.

## Conventions
- **Forms**: Use controlled forms with `useState` and light sanitization (`replace(/[^0-9.,]/g, "")`).
- **Toasts**: Use `useToast()` from `@/components/ui/use-toast` for consistent success/warning/error messages.
- **UI Components**: Follow existing `Card`/`Modal` compositions (e.g., `rounded-2xl/3xl` borders, descriptive subtitles).
- **Hydratación**: Evita variaciones condicionales en clases/markup entre SSR y cliente; la cabecera ya se ajustó para usar las mismas `px` en ambas etapas.
- **API Handlers**: Validate inputs with Zod schemas (see `src/app/api/inventario/traspasos/route.ts`). Create schemas first and reuse error utilities.
- **Service Dependency**: API handlers must depend on services (`adminUserService`, `waiterService`, etc.) and never call repositories directly.
  - For tables: depend on `TableService` methods like `listTableAdminSnapshots`, `listAvailableTables`, `reserveTable`, `releaseTableReservation`, `listWaiterTables`, etc.

## Data & Integration
  - `/api/articulos`: Accepts `price_list_code` and `unit`. The UI expects `items[].price.base_price`.
  - `/api/inventario/traspasos`: Handles warehouse transfers with detailed payload validation.
  - `/api/articulos/[article_code]/almacenes`: GET/POST/DELETE para gestionar asociaciones artículo-bodega (requiere admin). Mantiene coherencia con `ArticleWarehouseService` y actualiza la bodega primaria.
  - `/api/reportes/**`: Supports `format=html` for printing in addition to JSON by default. The page `/reportes` includes a "Print" button that opens a modal with the printable HTML (and optionally you can open the direct URL in a new tab). In `/caja`, opening/closure reports also use a print modal (iframe) for in-place printing y el historial se consulta desde el botón dedicado, que abre un modal con saldo final y faltantes/sobrantes por sesión.
  - `/api/tables`: Admin endpoints for table catalog and availability (backed by `TableService`).
  - `/api/meseros/tables`: Waiter endpoints for selecting and updating table orders (backed by `TableService`).
- **Docker**: The production build uses a standalone output. Declare runtime dependencies in `package.json` to avoid purging during production.
- **Mocks**: Register equivalent mocks for new repositories in their corresponding services to respect `MOCK_DATA`.

## Collaboration Tips
- Extend existing states (e.g., `priceListItems`, `recentInvoices`) instead of creating parallel stores.
- Document new environment variables in `.env.example` and the README.
- When modifying shared helpers or UI components, run `npm run lint` and perform a global search to detect side effects.
- Update the README or `docs/` with the current architecture after completing migrations or cross-cutting changes.

## Continuous Updates
- Always update the following files with significant changes:
  - `README.md`
  - `.github/copilot-instructions.md`
  - `.github/prompts/plan-sistemaFacturacion.prompt.md`
- This ensures all documentation remains aligned and accessible for developers and AI tools.

## Recommended
- Siempre responde en español.
- toda modificacion de esquema de base de datos debe ir acompañada de su respectiva migracion en prisma y la actualizacion del archivo schema_master.sql de tal manera que el estado del esquema de base de datos pueda ser replicado en cualquier entorno.
- Cualquier mensaje de confirmacion debe de ser de un estilo de modal acorde al estilo de la aplicacion, no usar los alertas nativas del navegador.