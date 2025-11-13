**Plan Migración PostgreSQL**

- Ajusta infra: instala `pg` y `@types/pg`, retira `mssql`; documenta `DB_CONNECTION_STRING` estilo PostgreSQL en `.env.example` y `README.md`; habilita variable `MOCK_DATA` igual.
- Refactoriza el helper a `src/lib/db/postgres.ts`: usa `Pool` de `pg`, replica cache global y `closePool`; expone helpers para transacciones y bind por nombre (`text`, `values`).
- Actualiza módulos de datos (`src/lib/db/*.ts`) para que importen el nuevo helper y reescriban SQL a sintaxis PostgreSQL (uso de `INSERT ... ON CONFLICT`, `RETURNING`, `LIMIT 1`, fechas con `CURRENT_DATE`, etc.); elimina dependencias de `sql.Request`/tipos; revisa tipos `decimal`/`numeric`.
- Migra procedimientos críticos por dominio: artículos (`articles.ts`, `articleKits.ts`, `classifications.ts`, `prices.ts`), inventario (`inventory.ts`, `warehouses.ts`), facturación (`invoices.ts`, `/api/invoices/route.ts`), autenticación (`auth.ts`), reportes (`reports.ts`), notificaciones/tablas (`notification-channels.ts`, `tables.ts`, endpoints `/api/**`).
- Sincroniza esquema en `database/schema_master.sql`: convierte tipos a PostgreSQL (`NUMERIC`, `BOOLEAN`, `SERIAL`/secuencias), recreate constraints/índices, `app` schema; genera script de migración y plan de carga inicial (dump + `pg_restore`).
- Ajusta capa API: cada `route.ts` que arma queries debe usar placeholders `$1`... y `await pool.query`; revisa parsing de resultados (`rows` en vez de `recordset`) y castea números.
- Mantén mocks (`env.useMockData`) sin cambios funcionales; asegúrate que rutas devuelvan mismas formas de datos tras refactor.
- Valida en conjunto: actualiza pruebas en `tests/api/*.md` con ejemplos Postgres, agrega tests nuevos si cambian invariantes; ejecuta `npm run lint` y `npm run typecheck`.
- QA end-to-end: levanta Postgres local, carga datos base, corre `npm run dev`, verifica flujos clave (login, facturación manual, catálogos, reportes, inventario); prueba API `/api/health` conectando a `pg`.
- Despliegue: adapta Dockerfile e `npm run build` para incluir libs nuevas; si hay pipelines CI/CD, añade servicio Postgres; documenta rollback (backup PostgreSQL), checklist de cutover y monitoreo.

Siguiente paso recomendado: crear `src/lib/db/postgres.ts` y migrar un módulo sencillo (por ejemplo `exchange-rate.ts`) para validar patrón antes del resto.
