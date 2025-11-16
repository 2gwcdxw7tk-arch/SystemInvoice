# Copilot Instructions

## Architecture
- Next.js 15 App Router project; route segments and API handlers viven bajo `src/app/**` (ej. `src/app/facturacion/page.tsx`, `src/app/api/invoices/route.ts`).
- Acceso a PostgreSQL centralizado en `src/lib/db/prisma.ts`; las operaciones de datos se encapsulan en repositorios (`src/lib/repositories/**`) consumidos por servicios (`src/lib/services/**`). Siempre úsalo en lugar de helpers legacy.
- Los servicios exponen modo MOCK consistente; cuando `MOCK_DATA=true` delegan a stores en memoria manteniendo la misma interfaz pública.
- Utilidades UI compartidas (shadcn/ui, tokens Tailwind) residen en `src/components/ui` y `src/lib/utils.ts`; recicla estos componentes y helpers para conservar el diseño.

## Key Workflows
- Instala dependencias con `npm install`; ejecuta en local mediante `npm run dev`. El build productivo usa `npm run build && npm run start` (igual al Dockerfile).
- Calidad obligatoria: `npm run lint` y `npm run typecheck` antes de publicar cambios.
- Cuando toques persistencia, haz smoke test a `GET /api/health` y `POST /api/invoices` con los payloads del README.
- Si agregas endpoints nuevos, publica la interfaz en el README o en `docs/` junto con ejemplos de curl para mantener la documentación viva.

## Domain Patterns
- Facturación (`src/app/facturacion/page.tsx`) separa flujos por `mode`; reutiliza el switch existente en vez de abrir rutas nuevas.
- Mantenimiento de listas de precio usa caches `useRef` (`catalogRequestedRef`, `articlesRequestedRef`); extiende esos guards, no dupliques lógica de fetch.
- Autenticación y directorios consumen `adminUserService` y `waiterService`; si necesitas nuevas operaciones crea métodos en servicios/repositorios antes de tocar handlers.
- Valores monetarios siempre pasan por `getCurrencyFormatter` o `formatCurrency`; evita `toLocaleString` directo para no romper formatos.
- Configuración con `process.env` (ej. `NEXT_PUBLIC_VAT_RATE`, `DEFAULT_PRICE_LIST_CODE`) se lee a nivel de módulo y se memoiza cuando se reutiliza.

## Conventions
- Formularios controlados con `useState` y sanitizado ligero (`replace(/[^0-9.,]/g, "")`); mantén esa pauta para evitar sorpresas de locales.
- Toasts usan `useToast()` de `@/components/ui/use-toast`; comunica success/warning/error de forma consistente al mutar estado.
- Nuevas tablas o modales deben seguir las composiciones `Card`/`Modal` existentes (bordes `rounded-2xl/3xl`, subtítulos descriptivos).
- Handlers API siempre validan con Zod (ver `src/app/api/inventario/traspasos/route.ts`). Crea schemas primero y reutiliza utilidades de error.
- Todos los handlers deben depender de servicios (`adminUserService`, `waiterService`, etc.) y nunca llamar repositorios directamente desde la capa HTTP.

## Data & Integration
- `/api/articulos` acepta `price_list_code` y `unit`; la UI espera `items[].price.base_price`. Si cambias estructura ajusta respuesta y mapeos juntos.
- Migraciones SQL residen en `database/schema_master.sql`; mantén ahí cualquier alteración de esquema antes de tocar código.
- Build Docker usa output standalone; declara dependencias runtime en `package.json` o se purgarán en producción.
- Cuando agregues repositorios nuevos, registra sus mocks equivalentes en el servicio correspondiente para respetar `MOCK_DATA`.

## Collaboration Tips
- Extiende estados existentes (`priceListItems`, `recentInvoices`) en lugar de abrir stores paralelos; hay selectores que dependen de memoización.
- Documenta variables de entorno nuevas en `.env.example` y en el README.
- Si modificas helpers compartidos o componentes UI, ejecuta `npm run lint` y revisa usos con búsqueda global para detectar efectos colaterales.
- Cuando cierres una migración o cambio transversal, actualiza README o `docs/` con la arquitectura vigente.


Siempre constesta y presenta lo que debas en español.## Instrucciones para Copilot

Siempre usa los controles que tenemos previamente creados para que todo mantenga el mismo diseño homogéneo.

Siempre revisa el código y corrige antes de terminar,para evitar errores de sintaxis o de lógica.

Puedes usar herramientas MCP como perplexity para consultar mejores prácticas de desarrollo en TypeScript y Next.js.
para corrección de código y lo que consideres necesario.