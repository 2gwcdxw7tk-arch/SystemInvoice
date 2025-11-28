# Propuesta de Arquitectura de Mejoras

_Fase 3 · Noviembre 2025_

## 0. Estado actual (28 nov 2025)
- **Prisma centralizado**: `prisma/schema.prisma` alineado con `database/schema_master.sql`. Cliente expuesto en `src/lib/db/prisma.ts` y usado por repositorios (artículos, kits, órdenes, alertas, cajas, roles, zonas de mesas, secuencias, CxC, etc.).
- **Facturación y cajas**: `InvoiceService`, `InventoryService` y `CashRegisterService` operan 100% sobre Prisma/mocks. `/api/invoices` mantiene validaciones de caja abierta y genera consumos automáticos.
- **Inventario y precios**: listados de compras/consumos/traspasos/kárdex/existencias funcionan vía `InventoryService`; `PriceListService` expone `/api/precios` y `ArticleService` resuelve precios con `items[].price.base_price`.
- **Restaurante**: `TableService` + `WaiterService` atienden `/api/tables/**` y `/api/meseros/**`; UI de mesas/meseros sincroniza comandas mediante `OrderService`.
- **Reportes imprimibles**: `/api/reportes/**` y reportes de caja soportan `format=html` y se consumen desde modales con iframe.
- **Cuentas por cobrar retail**: migración `20251128101500_cxc_core_tables` y repositorios/servicios (`PaymentTermService`, `CustomerService`, `CustomerDocumentService`, `CustomerDocumentApplicationService`) expuestos vía `/api/preferencias/terminos-pago`, `/api/cxc/clientes`, `/api/cxc/documentos` y `/api/cxc/documentos/aplicaciones`, protegidos con `requireCxCPermissions` y respetando `MOCK_DATA`.
- **Permisos y entorno**: `NEXT_PUBLIC_ES_RESTAURANTE=false` habilita CxC y requiere los permisos `menu.cxc.view`, `customers.manage`, `payment-terms.manage`, `customer.documents.manage`, `customer.documents.apply`, `customer.credit.manage`, `customer.collections.manage`, `customer.disputes.manage`.
- **Calidad automatizada**: `npm run lint`, `npm run typecheck` y suites Jest (>=134 tests) cubren endpoints principales; nuevas features deben incluir pruebas API/servicio.

## 1. Resumen ejecutivo
- Sustituiremos el acceso SQL manual por Prisma para obtener un modelo de datos tipado y centralizado.
- La lógica de negocio se aislará mediante repositorios y servicios, habilitando pruebas unitarias reales y desacoplando HTTP.
- Los endpoints se reducirán a capas delgadas o Server Actions, mejorando la coherencia con Next.js 15.
- La estrategia MOCK se convertirá en implementaciones intercambiables, simplificando QA y entornos desconectados.

## 2. Hallazgos clave (Fases 1–3)
| Aspecto | Situación actual | Impacto |
| --- | --- | --- |
| Acceso a datos | Sentencias SQL embebidas en `src/lib/db/*.ts` | Riesgos de inyección, baja reutilización |
| Acoplamiento | Endpoints mezclan validación, negocio y persistencia | Dificultad para evolucionar o probar |
| Mocking | Flags `MOCK_DATA` mezclados con código productivo | Curva de mantenimiento y riesgo de bugs |
| Observabilidad | Métricas inexistentes fuera de logs ad-hoc | Dificultad para auditar tiempos de respuesta |

## 3. Principios de diseño
1. **Fuente única de verdad**: Prisma + migraciones versionadas (`database/schema_master.sql` seguirá siendo la referencia canónica, sincronizada con `schema.prisma`).
2. **Separación estricta de capas**: UI ⇄ Server Actions ⇄ Servicios ⇄ Repositorios ⇄ Prisma/Mock.
3. **Dependencias inyectables**: `useMockData` decidirá en tiempo de arranque qué implementación de repositorio usar.
4. **Validaciones declarativas**: Zod en entradas, tipos de Prisma en salidas.
5. **Automatización de calidad**: `npm.cmd run lint` y `npm.cmd run typecheck` más suites de servicios.

## 4. Arquitectura objetivo
### 4.1 Prisma como ORM
- **Acciones**: mapear tablas actuales a `prisma/schema.prisma`, generar cliente y publicar migraciones iniciales.
- **Entregables**: `schema.prisma`, `prisma/migrations/*`, `src/lib/db/prisma.ts` como singleton reutilizable.
- **Beneficios medibles**: reducción de errores de tipo; trazabilidad de cambios mediante `prisma migrate diff`.

### 4.2 Patrón Repositorio + Servicio
```
src/lib/repositories/
  articles.repository.ts
  orders.repository.ts
src/lib/services/
  articles.service.ts
  orders.service.ts
```
- **Repositorio**: únicamente Prisma (o Mock) + mapeos; sin lógica de negocio.
- **Servicio**: orquesta validaciones, cálculos (IVA, comisiones), transacciones.
- **Pruebas**: los servicios usan mocks inyectados, permitiendo cobertura sin base real.

### 4.3 Endpoints y Server Actions
- `src/app/api/**/route.ts` delegará a servicios, manejando solo parsing de Request/Response y control de errores.
- Cuando un flujo sea usado solo por componentes del App Router, se expondrá como Server Action (`"use server"`) dentro del segmento correspondiente.
- **Extras**: normalizar respuestas (`NextResponse.json`) y centralizar manejo de errores (middleware que traduzca excepciones de servicio).

### 4.3.1 Reportes con salida HTML y UI de impresión
- Endpoints de reportes aceptan `format=html` para devolver un documento imprimible.
- En `/reportes` y `/caja` la impresión se realiza en un modal con iframe (accesible, con `title`).
- Las rutas de apertura y cierre de caja generan HTML independiente, validando sesión/cookies de Next.

### 4.4 Gestión del modo MOCK
- `RepositoryFactory` ya selecciona entre Prisma y Mock según `process.env.MOCK_DATA`.
- Las implementaciones Mock replican interfaces y trabajan con stores en memoria.
- El flag está documentado en `.env.example` y `README.md`.

## 5. Plan de implementación (Fase 3)
| Semana | Entrega | Estado actual | Acciones siguientes |
| --- | --- | --- | --- |
| 1 | Configuración Prisma | ✅ Listo: `schema.prisma`, `@prisma/client`, `src/lib/db/prisma.ts`, script `prepare`. | Mantener sincronización con `schema_master.sql`. |
| 2 | Repositorios base | ✅ Mayoría migrada: artículos, kits, órdenes, alertas, cajas, roles, zonas/mesas, reportes. | Completar inventario y precios (bordes). |
| 3 | Servicios | ✅ Operativos: `ArticleService`, `OrderService`, `InventoryService` (parcial), `CashRegisterService`, `ReportService`, `RoleService`, `TableService`, `WaiterService`, etc. | Continuar extrayendo restos de `src/lib/db/*.ts`.
| 4 | Endpoints/Server Actions | ✅ La mayoría delega a servicios. | Evaluar Server Actions para flujos internos cuando aplique. |
| 5 | Mock Layer | ✅ Implementado (`RepositoryFactory`). | Mantener mocks equivalentes al migrar nuevos repos. |
| 6 | QA y mediciones | ✅ En curso: 134 tests en verde; lint/typecheck obligatorios. | Añadir métricas de performance p95 a logs. |

## 6. Dependencias y riesgos
- **Sincronización de esquema**: riesgo de desalineación entre `schema_master.sql` y Prisma → mitigar ejecutando `prisma db pull` tras cada cambio SQL.
- **Costo inicial**: curva de adopción de Prisma → pair programming + linters (`prisma format`).
- **Server Actions**: requerirá habilitar experimental `serverActions` en `next.config.ts` si no está activo; validar impacto en despliegues serverless.

## 7. Métricas de éxito
- Cobertura de pruebas de servicios ≥ 70 % statements.
- Tiempo promedio de respuesta `/api/invoices` < 250 ms (p95) tras migración.
- 0 consultas SQL sin tipar en `src/lib/db` (verificado con búsqueda CI).
- Tiempo de onboarding a un nuevo flujo reducido a < 0.5 jornada (medido vía encuestas internas).

## 8. Próximos pasos inmediatos
1. **Fortalecer CxC**: completar vistas UI retail, exponer reportes espejo y profundizar en pruebas unitarias/API para `PaymentTermService`, `CustomerService` y `CustomerDocument*( )`.
2. **Resiliencia de secuencias**: auditar `SequenceService` para folios de inventario/venta, agregar alertas cuando falte asignación y documentar flujos de recuperación.
3. **Autenticación pendiente**: concluir `AuthRepository/Service` para cerrar dependencias residuales y documentar la transición en `docs/migracion-prisma.md`.
4. **Observabilidad y métricas**: capturar p95 en `/api/invoices`, `/api/cxc/**` y publicar resultados en CI junto con `npm run test`.

## 9. Inventario y foco de cierre (28 nov 2025)

| Área                    | Estado actual                                  | Acción |
|-------------------------|-----------------------------------------------|--------|
| Artículos/Kits          | ✅ Migrado (repos + servicios)                 | N/A    |
| Órdenes/Comandas        | ✅ Migrado (repos + servicios)                 | N/A    |
| Cajas (apert./cierres)  | ✅ Migrado + reportes HTML + impresión modal   | N/A    |
| Mesas/Zonas/Meseros     | ✅ TableService/WaiterService operativos       | N/A    |
| Reportes (ventas, etc.) | ✅ ReportService + `format=html` en endpoints  | Retirar legacy remanente gradualmente |
| Unidades/Roles          | ✅ Migrado                                     | N/A    |
| Inventario              | ✅ Completo (compras/consumos/traspasos/kardex/existencias) | Validar rendimiento/índices |
| Listas de precios       | ✅ PriceListService operativo, UI en `/precios` | Añadir pruebas adicionales |
| Autenticación           | ⚠️ Parcial                                    | Completar AuthRepository/Service |
| Cuentas por cobrar      | ✅ Servicios y endpoints con permisos dedicados | Ampliar pruebas + UI retail |
| Secuencias              | ✅ SequenceService + endpoints de preferencias | Añadir monitoreo de folios |

Este estado refleja la migración en curso, la adopción de reportes HTML con impresión en modal y la estandarización de pruebas. Toda nueva funcionalidad debe incluir tests (unitarios y/o API) y actualizar README + `.github/copilot-instructions.md` + este documento.
