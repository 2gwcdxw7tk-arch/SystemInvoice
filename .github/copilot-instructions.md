# Copilot Instructions

## Architecture
- Next.js 15 App Router project; route segments and API handlers live under `src/app/**` (e.g., `src/app/facturacion/page.tsx`, `src/app/api/invoices/route.ts`).
- SQL Server access goes through `src/lib/db/mssql.ts` and thin data modules (`src/lib/db/*.ts`); when `MOCK_DATA=true` endpoints short-circuit to in-memory stores.
- Shared UI utilities (shadcn/ui, Tailwind tokens) sit in `src/components/ui` and `src/lib/utils.ts`; respect these instead of reinventing styling helpers.

## Key Workflows
- Install deps with `npm install`; run locally via `npm run dev`. Production build uses `npm run build && npm run start` (mirrors Dockerfile release stage).
- Mandatory quality gates: `npm run lint` and `npm run typecheck`; run both before proposing merges.
- API smoke tests: execute `GET /api/health` (SQL connectivity) and `POST /api/invoices` with sample payloads from `README.md` when touching persistence layers.

## Domain Patterns
- Facturación UI (`src/app/facturacion/page.tsx`) separates flows by search param `mode`; reuse the existing mode switch instead of new routes.
- Price list maintenance caches `/api/articulos` responses using `useRef` guards (`catalogRequestedRef`, `articlesRequestedRef`); extend these guards rather than adding duplicated fetch logic.
- Monetary values always flow through `getCurrencyFormatter` or `formatCurrency` helpers; never format currency manually.
- Environment-driven behavior (`NEXT_PUBLIC_VAT_RATE`, `NEXT_PUBLIC_SERVICE_RATE`, `DEFAULT_PRICE_LIST_CODE`) must be read via `process.env` at module scope and memoized if reused.

## Conventions
- Forms rely on controlled inputs with `useState` plus lightweight input sanitization (`replace(/[^0-9.,]/g, "")`); preserve that pattern to avoid locale surprises.
- Toast notifications use `useToast()` from `@/components/ui/use-toast`; surface success/warning/error consistently when mutating state.
- When adding tables or modals, follow the rounded `Card`/`Modal` composition already in `src/app/facturacion/page.tsx` (rounded-2xl/3xl classes, descriptive subtitles).
- API handlers expect Zod-validated payloads (see `src/app/api/inventario/traspasos/route.ts`); introduce new handlers with the same schema-first approach.

## Data & Integration
- `/api/articulos` accepts `price_list_code` and `unit`; UI assumes `items[].price.base_price` for base pricing—update both response and UI mapping together.
- SQL migrations live in `database/schema_master.sql`; keep schema changes centralized there before updating code.
- Docker build uses the Next.js standalone output; ensure new runtime deps are declared in `package.json` or they will be pruned at build time.

## Collaboration Tips
- Prefer enhancing existing state objects (`priceListItems`, `recentInvoices`) instead of introducing parallel stores; selectors depend on memoized derived state.
- Document any new environment variable in `.env.example` and the root `README.md` to keep onboarding smooth.
- If you touch shared helpers or UI primitives, scan usages with `pnpm exec eslint --fix` (or `npm run lint`) afterwards to catch ripple effects.


Siempre constesta y presenta lo que debas en español.## Instrucciones para Copilot

iempre usa los controles que tenemos previamente creados para que todo tenga el mismo diseño homogeneo en todos los controles del sitio

Siempre revisa el codigo antes de terminar para evitar los errores de sintaxis o de logica.