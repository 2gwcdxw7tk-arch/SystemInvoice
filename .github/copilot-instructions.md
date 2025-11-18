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
- **Facturación**: Flows are separated by `mode` in `src/app/facturacion/page.tsx`. Extend the existing switch instead of creating new routes.
- **Price Lists**: Use `useRef` caches (`catalogRequestedRef`, `articlesRequestedRef`) to manage fetch guards. Extend these guards instead of duplicating fetch logic.
- **Authentication**: Use `adminUserService` and `waiterService`. Add new operations in services/repositories before modifying handlers.
- **Tables**: Use `TableService` (`src/lib/services/TableService.ts`) to manage table catalog, reservations, waiter snapshots and table state. API routes under `/api/tables/**` y `/api/meseros/tables/**` must consume this service (no `db/tables`).
- **Monetary Values**: Always use `getCurrencyFormatter` or `formatCurrency` to ensure consistent formatting.
- **Environment Variables**: Read at the module level and memoize when reused (e.g., `NEXT_PUBLIC_VAT_RATE`, `DEFAULT_PRICE_LIST_CODE`).

## Conventions
- **Forms**: Use controlled forms with `useState` and light sanitization (`replace(/[^0-9.,]/g, "")`).
- **Toasts**: Use `useToast()` from `@/components/ui/use-toast` for consistent success/warning/error messages.
- **UI Components**: Follow existing `Card`/`Modal` compositions (e.g., `rounded-2xl/3xl` borders, descriptive subtitles).
- **API Handlers**: Validate inputs with Zod schemas (see `src/app/api/inventario/traspasos/route.ts`). Create schemas first and reuse error utilities.
- **Service Dependency**: API handlers must depend on services (`adminUserService`, `waiterService`, etc.) and never call repositories directly.
  - For tables: depend on `TableService` methods like `listTableAdminSnapshots`, `listAvailableTables`, `reserveTable`, `releaseTableReservation`, `listWaiterTables`, etc.

## Data & Integration
  - `/api/articulos`: Accepts `price_list_code` and `unit`. The UI expects `items[].price.base_price`.
  - `/api/inventario/traspasos`: Handles warehouse transfers with detailed payload validation.
  - `/api/reportes/**`: Supports `format=html` for printing in addition to JSON by default. The page `/reportes` includes a "Print" button that opens a modal with the printable HTML (and optionally you can open the direct URL in a new tab). In `/caja`, opening/closure reports also use a print modal (iframe) for in-place printing.
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