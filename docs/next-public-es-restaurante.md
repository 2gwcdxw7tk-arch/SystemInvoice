# Guía de dependencias de `NEXT_PUBLIC_ES_RESTAURANTE`

Este documento centraliza qué módulos se encienden o apagan según el valor de `NEXT_PUBLIC_ES_RESTAURANTE`. Úsalo como referencia antes de tocar flujos de mesas, meseros o CxC para evitar regresiones entre los modos restaurante y retail.

## 1. Propagación del flag

1. `.env` define `NEXT_PUBLIC_ES_RESTAURANTE` y se lee en `src/lib/env.ts`, que expone:
   - `env.features.isRestaurant` (booleano server-side) y
   - `env.features.retailModeEnabled = !isRestaurant`.
2. `env.publicFeatures` replica ambos valores para los clientes (hidratados en SSR) y es consumido por:
   - `src/config/features.ts` (`getFeatureFlag`, `isRestaurant`, `isRetailMode`).
   - `src/lib/features/public.ts` (`publicFeatures`, `isRestaurantMode`, `isRetailModeEnabled`).
3. Todos los componentes cliente importan `publicFeatures` para decidir qué rutas, botones o formularios mostrar; los servicios/API usan `env.features` o los guards de `src/lib/features/guards.ts` para cortar la ejecución cuando la bandera no coincide.

## 2. Modo restaurante (`NEXT_PUBLIC_ES_RESTAURANTE=true`)

### 2.1 UI habilitada
- Navegación: `src/components/layout/sidebar.tsx` solo muestra "Mesas" y "Meseros" cuando `publicFeatures.isRestaurant` es `true`.
- Inicio de sesión y landing: `src/app/page.tsx` expone el acceso directo para meseros (`waiterLoginEnabled`).
- Consolas específicas:
  - `src/app/mesas/page.tsx` y `src/app/meseros/page.tsx` renderizan catálogos, zonas y roles de staff únicamente en este modo.
  - `src/app/meseros/comandas/page.tsx` bloquea el panel de comandas si la bandera no está activa.

### 2.2 Endpoints/servicios disponibles
- APIs de mesas y zonas (`src/app/api/tables/**`) y reservas (`[tableId]/reservation`) retornan 404/403 cuando `env.features.isRestaurant` es falso.
- APIs de meseros y selección de mesas (`src/app/api/meseros/**`, `src/app/api/waiters/**`, `src/app/api/login/route.ts` para PIN) también dependen de `env.features.isRestaurant`.
- `TableService` y `WaiterService` son las capas obligatorias para estas rutas; cualquier nueva operación debe pasar por ahí para respetar el flag y los mocks.
- `src/lib/db/dashboard.ts` solo carga `listTableAdminSnapshots` cuando `env.features.isRestaurant` es verdadero, para que el dashboard no consulte tablas inexistentes en retail.
- Los helpers `assertRestaurantFeatureEnabled` e `isRestaurantFeatureEnabled` (`src/lib/features/guards.ts`) deben proteger cualquier lógica nueva asociada a mesas/meseros.

### 2.3 Restricciones en modo restaurante
- Todos los módulos de CxC permanecen fuera de servicio. `CustomerCreditLineService` lanza `"El módulo de Cuentas por Cobrar no está disponible en modo restaurante"` mediante `assertRetailFeature` si se invoca desde este modo (`src/lib/services/cxc/CustomerCreditLineService.ts`).
- La UI oculta `/cuentas-por-cobrar` y los formularios vinculados; no se solicitan clientes predeterminados por caja al cerrar (`src/app/api/cajas/cierres/route.ts`).

## 3. Modo retail (`NEXT_PUBLIC_ES_RESTAURANTE=false`)

### 3.1 UI habilitada
- Navegación: el ítem **Cuentas por Cobrar** solo aparece cuando `publicFeatures.retailModeEnabled` es `true` (`src/components/layout/sidebar.tsx`).
- Módulos completos bajo `/cuentas-por-cobrar` (`src/app/cuentas-por-cobrar/**`) dependen de `publicFeatures.retailModeEnabled` para montar filtros, modales y tablas.
- Facturación (`src/app/facturacion/page.tsx`) activa controles de cliente, tipo de venta (`sale_type`) y cálculo de vencimientos únicamente en retail.
- Preferencias (`src/app/preferencias/page.tsx`) muestra el tab de cliente predeterminado por caja, gestión de términos de pago y configuraciones de crédito cuando `retailModeEnabled` es verdadero.
- Caja (`src/app/caja/page.tsx`) despliega el resumen "Facturación a crédito" en el modal de cierre y en el historial solo si estamos en retail.

### 3.2 Servicios/backend habilitados
- Facturación → `InvoiceService` (`src/lib/services/InvoiceService.ts`): exige cliente obligatorio, permite facturas `CREDITO`, genera documentos espejo en CxC y sincroniza líneas de crédito sólo cuando `env.features.retailModeEnabled` es `true`.
- CxC end-to-end:
  - `CustomerDocumentService`, `CustomerDocumentApplicationService` y `CustomerCreditLineService` (`src/lib/services/cxc/*.ts`) realizan cálculos de saldo, bloquean crédito o sincronizan clientes únicamente si la bandera está apagada.
  - `requireCxCPermissions` (`src/lib/auth/cxc-access.ts`) protege todos los endpoints bajo `/api/cxc/**` y `/api/preferencias/terminos-pago`. Estas rutas fallan cuando el modo restaurante está activo.
- Caja:
  - `CashRegisterService` y `CashRegisterRepository` (`src/lib/services/CashRegisterService.ts`, `src/lib/repositories/cash-registers/CashRegisterRepository.ts`) sólo consultan `customer_documents` y exponen `creditTotals` cuando `env.features.retailModeEnabled` es `true`.
  - `POST /api/cajas/cierres` requiere que cada caja tenga un cliente predeterminado en retail (`src/app/api/cajas/cierres/route.ts`).
  - El reporte HTML de cierre (`src/app/api/cajas/cierres/[sessionId]/reporte/route.ts`) añade la sección "Facturación a crédito" solo en este modo.
- Preferencias/API:
  - `/api/cajas/*` permite asignar cliente predeterminado para cada caja únicamente en retail.
  - `/api/invoices` (`src/app/api/invoices/route.ts`) habilita la validación flexible de pagos y vínculo con CxC según `env.features.retailModeEnabled`.

### 3.3 Reglas adicionales
- Clientes mostrador por caja: solo existen en retail (`README.md`, `/preferencias` → **Cajas**), por eso el cierre bloquea si la caja no tiene cliente asociado.
- Permisos CxC (`menu.cxc.view`, `customers.manage`, etc.) solo tienen efecto en este modo; la UI y el backend los ignoran en restaurante.

## 4. Matriz rápida de comportamiento

| Área | Restaurante (`true`) | Retail (`false`) | Referencias |
| --- | --- | --- | --- |
| Navegación/sidebar | Muestra Mesas/Meseros, oculta CxC | Oculta Mesas/Meseros, muestra CxC | `src/components/layout/sidebar.tsx` |
| Mesas & Meseros | Habilitados (UI + APIs) | Bloqueados por guards | `src/app/mesas/page.tsx`, `src/app/api/tables/**`, `src/app/api/meseros/**` |
| Waiter login | Visible | Oculto | `src/app/page.tsx`, `src/app/api/login/route.ts` |
| Facturación a crédito | Deshabilitada (requiere pago completo) | Habilitada (genera documentos CxC) | `src/lib/services/InvoiceService.ts` |
| Módulo CxC | Oculto, servicios lanzan error | Visible, servicios y endpoints activos | `src/app/cuentas-por-cobrar/**`, `src/lib/services/cxc/**`, `src/lib/auth/cxc-access.ts` |
| Cliente predeterminado por caja | No requerido | Requerido para cerrar caja | `/preferencias` tab **Cajas**, `src/app/api/cajas/cierres/route.ts` |
| Reportes de cierre (crédito) | Sección oculta | Sección "Facturación a crédito" + totales pendientes | `src/app/api/cajas/cierres/[sessionId]/reporte/route.ts`, `src/app/caja/page.tsx` |
| Dashboard mesas | Oculto | No aplica | `src/lib/db/dashboard.ts` |

## 5. Checklist antes de desplegar cambios

1. **Validar ambos modos**: levanta la app dos veces (flag `true` y `false`) o usa `MOCK_DATA` para navegar cada variante.
2. **Revisar rutas protegidas**: cualquier endpoint nuevo relacionado con mesas, meseros o CxC debe llamar a `assertRestaurantFeatureEnabled`, `assertRetailFeature` o `requireCxCPermissions` según corresponda.
3. **Actualizar documentación**: si se agrega una funcionalidad condicionada por la bandera, extiende esta guía y referencia el archivo en README/Copilot prompts.
4. **QA funcional**: confirma que la navegación, cierres de caja y reportes muestran/ocultan los bloques correctos; en retail asegúrate de que las facturas `CREDITO` se reflejen en CxC y en los cierres.

Mantén esta guía a la vista cuando toques `NEXT_PUBLIC_ES_RESTAURANTE` para evitar que un modo herede lógicas del otro.
