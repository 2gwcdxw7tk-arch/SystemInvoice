# Propuesta de Arquitectura de Mejoras

_Fase 3 · Noviembre 2025_

## 0. Estado actual (15 nov 2025)
- **Prisma ya inicializado**: existe `prisma/schema.prisma` alineado con `database/schema_master.sql`, `@prisma/client` está instalado y ahora se expone mediante `src/lib/db/prisma.ts`, reutilizado por `ArticleRepository`, `ArticleKitRepository`, `OrderRepository` e `InventoryAlertRepository`.
- **Flujo de facturación migrado**: `InvoiceRepository` + `InvoiceService` reemplazan al módulo legado, `/api/invoices` delega en la nueva capa y `src/lib/db/invoices.ts` se eliminó.
- **Repositorios y servicios parcialmente migrados**: `src/lib/repositories/**` y `src/lib/services/**` cubren artículos, kits, alertas, órdenes, cajas e usuarios administradores. Permanecen en `src/lib/db` los módulos de inventario, auth, precios, reportes, mesas, unidades, bodegas y auxiliares.
- **Endpoints ya delegando a servicios**: flujos como `/api/articulos`, `/api/cajas` y `/api/preferencias/alertas` ya consumen servicios. Otros endpoints estratégicos (`/api/inventario/**`, `/api/waiters/**`) siguen acoplados a funciones SQL.
- **Modo MOCK documentado pero no desacoplado**: `MOCK_DATA` ya vive en `.env.example` y `README.md`, y varias funciones tienen ramas condicionales. Falta la fábrica de repositorios que permita intercambiar implementaciones sin ramificaciones dispersas.

## 1. Resumen ejecutivo
- Sustituiremos el acceso SQL manual por Prisma para obtener un modelo de datos tipado y centralizado.
- La lógica de negocio se aislará mediante repositorios y servicios, habilitando pruebas unitarias reales y desacoplando HTTP.
- Los endpoints se reducirán a capas delgadas o Server Actions, mejorando la coherencia con Next.js 15.
- La estrategia MOCK se convertirá en implementaciones intercambiables, simplificando QA y entornos desconectados.

## 2. Hallazgos clave (Fases 1 y 2)
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

### 4.4 Gestión del modo MOCK
- `src/lib/repositories/factory.ts` seleccionará entre `prisma` y `mock` según `process.env.MOCK_DATA`.
- `mock` replicará la interfaz de cada repositorio y trabajará con stores en memoria (o fixtures JSON).
- El flag se documentará en `.env.example` y `README.md`.

## 5. Plan de implementación (Fase 3)
| Semana | Entrega | Estado actual | Acciones siguientes |
| --- | --- | --- | --- |
| 1 | Configuración Prisma | ✅ `schema.prisma`, `@prisma/client`, singleton `src/lib/db/prisma.ts` y script `prepare` (`prisma generate`) ya disponibles. | Ajustar pipeline CI (GitHub Actions u otra) para ejecutar `npm run prisma:generate` antes de `next build` y documentar flujo de migraciones. |
| 2 | Repositorios base | ⚠️ Parcial: Articles, Kits, Orders, Inventory Alerts, Admin Users e Invoices ya usan Prisma. | Migrar repos faltantes (`inventory`, `auth`, `tables`, `reports`, `prices`) y publicar interfaces comunes. |
| 3 | Servicios | ⚠️ Parcial: `ArticleService`, `OrderService`, `InventoryAlertService`, etc. operativos. | Extraer lógica pendiente de `src/lib/db/*.ts` hacia servicios nuevos (`InvoiceService`, `CashRegisterService`, `InventoryService`). |
| 4 | Endpoints/Server Actions | ⚠️ Parcial: `/api/articulos` ya delega a servicios. | Refactorizar `/api/invoices`, `/api/inventario/**` y `/api/waiters/**`; evaluar Server Actions para flujos internos del App Router. |
| 5 | Mock Layer | ⏳ No iniciado: ramas condicionales dispersas. | Implementar `RepositoryFactory` que lea `env.useMockData`, crear repos mock espejo y mover los stores in-memory existentes allí. |
| 6 | QA y mediciones | ⏳ No iniciado. | Añadir pruebas unitarias para servicios portados, smoke tests automatizados (`GET /api/health`, `POST /api/invoices`) y métricas p95 en logs. |

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
1. **Inventariar y priorizar módulos pendientes**: documentar el estado de cada archivo en `src/lib/db` (cajas, inventario, auth, precios, reportes, mesas, unidades, bodegas, etc.) para definir el orden de migración.
2. **Consolidar listas de precios**: crear `PriceListRepository`/servicio, normalizar lectura de precios vigentes y preparar UI en `/precios`.
3. **Portar inventario y dependencias**: mover `inventory.ts`, `warehouses.ts`, `articles.ts` y `articleKits.ts` hacia repositorios/servicios especializados, asegurando que `InvoiceService` y `/api/inventario/**` queden desacoplados de SQL crudo.
4. **Implementar RepositoryFactory y pruebas**: exponer `getRepositories(env.useMockData)` que devuelva implementaciones Prisma o Mock, mover los stores en memoria existentes y añadir suites unitarias para los servicios migrados (`npm run lint`, `npm run typecheck`, `npm run test:services`).

## 9. Inventario de módulos `src/lib/db` (17 nov 2025)

| Módulo               | Descripción                          | Estado            | Próximos pasos |
|----------------------|--------------------------------------|-------------------|----------------|
| `articles.ts`        | Artículos y catálogo de precios      | ✅ Migrado        | N/A            |
| `kits.ts`            | Kits de artículos                   | ✅ Migrado        | N/A            |
| `inventory-alerts.ts`| Alertas de inventario               | ✅ Migrado        | N/A            |
| `invoices.ts`        | Facturación                         | ✅ Migrado        | N/A            |
| `auth.ts`            | Autenticación y roles               | ⏳ Sin migrar     | Crear `AuthRepository` y `AuthService`. |
| `cash-registers.ts`  | Cajas y sesiones                    | ✅ Migrado        | N/A |
| `orders.ts`          | Órdenes y comandas                  | ⚠️ Parcial        | Completar repositorio y eliminar helpers legacy. |
| `inventory.ts`       | Inventario                          | ⚠️ Parcial        | Dividir en sub-repositorios especializados. |
| `exchange-rate.ts`   | Tipos de cambio                     | ✅ Migrado        | Sustituido por `ExchangeRateRepository` + `ExchangeRateService`. |
| `reports.ts`         | Reportes                            | ⏳ Sin migrar     | Crear repositorios específicos. |
| `tables.ts`          | Mesas y zonas                       | ⏳ Sin migrar     | Diseñar `TableRepository` y `TableService`. |
| `prices.ts`          | Listas de precios                   | ⏳ Sin migrar     | Crear `PriceListRepository`. |

Este inventario refleja el estado actual de la migración a Prisma y los pasos necesarios para completar el proceso.

Con esta propuesta completamos la Fase 3 (Diseño) y dejamos listo el backlog para ejecutar Fases 4 (Implementación) y 5 (Optimización continua).
