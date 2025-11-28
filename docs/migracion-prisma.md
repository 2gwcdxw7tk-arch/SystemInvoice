# Guía Viva de Migración a Prisma

Este documento resume el estado real de la migración hacia la arquitectura basada en Prisma y define el plan de trabajo para eliminar por completo los módulos legacy (`src/lib/db/*.ts`). Debe actualizarse **antes de cerrar cada PR** que toque datos o servicios para mantener una visión confiable.

## 1. Estado global

| Dominio                     | Componentes clave                                                                                   | Estado | Comentarios recientes |
|-----------------------------|----------------------------------------------------------------------------------------------------|--------|-----------------------|
| Autenticación y usuarios    | `AdminUserRepository`/`Service`, `WaiterRepository`/`WaiterService`                                 | ✅     | Handlers migrados a servicios. |
| Facturación                 | `InvoiceRepository`/`InvoiceService`, `/api/invoices`                                               | ✅     | Registro de consumos delega a `InventoryService`. |
| Artículos y kits            | `ArticleRepository`, `ArticleKitRepository`, `ArticleService`, `/api/articulos/**`                  | ✅     | UI y endpoints usan servicios; kits via `ArticleKitService`. |
| Alertas / notificaciones    | `NotificationChannelService`                                                                        | ✅     | Mock y Prisma alineados. |
| Órdenes (comandas)          | `OrderRepository`/`OrderService`, `/api/meseros/**`                                                 | ✅     | Sincroniza mesas vía `TableService.setTableOrderStatus`. |
| Mesas y zonas               | `TableService` (Prisma + mock), `/api/tables/**`, `/api/meseros/tables/**`                          | ✅     | Reemplazado `src/lib/db/tables.ts` y actualizado dashboard/UI. |
| Inventario (general)        | `InventoryService`, `/api/inventario/{traspasos,compras,consumos,existencias,kardex}`               | ✅     | Endpoints migrados a servicio; unificado consumo desde facturas. |
| Cajas                       | `CashRegisterService`, `/api/cajas/**`                                                              | ✅     | Delegado a servicio + Prisma. |
| Tipos de cambio             | `ExchangeRateService`                                                                               | ✅     | Lecturas/escrituras vía servicio. |
| Listas de precios           | `PriceListService`, `/api/precios`, resolución en `ArticleService`                                   | ✅     | UI espera `items[].price.base_price`. |
| Clasificaciones             | `ArticleClassificationService`, endpoints asociados                                                  | ✅     | Jerarquía niveles 1–6. |
| Reportes                    | `ReportService`, `ReportRepository`, `/api/reportes/**`                                             | ✅     | Endpoints migrados a servicio; soporte `format=html` y botón de impresión (modal) en `/reportes`. |
| Cuentas por cobrar          | `PaymentTermService`, `CustomerService`, `CustomerDocumentService`, `CustomerDocumentApplicationService`, `/api/preferencias/terminos-pago`, `/api/cxc/clientes`, `/api/cxc/documentos`, `/api/cxc/documentos/aplicaciones` | ✅ | Servicios con modo mock, permisos `requireCxCPermissions` y migración `20251128101500_cxc_core_tables`. |

## 2. Backlog priorizado

1. **Autenticación pendiente**
   - Completar `AuthRepository/Service` para cubrir login y refresh tokens sin helpers legacy.
   - Retirar dependencias residuales de `src/lib/db/auth.ts`.
2. **Pruebas CxC**
   - Incorporar suites Jest para `/api/preferencias/terminos-pago`, `/api/cxc/clientes` y `/api/cxc/documentos(+aplicaciones)` en modo mock y real.
   - Documentar fixtures y datos seed reutilizables.
3. **Hardening general**
   - Verificar que no existan importaciones de `src/lib/db/**` legacy; retirar archivos residuales.
   - Auditar `SequenceService` y handlers que dependan de folios para detectar escenarios sin asignación.

## 3. Checklist por módulo

Cada módulo debe cumplir antes de marcarse ✅:
- [ ] Repositorio Prisma implementado (`src/lib/repositories/**`).
- [ ] Servicio orquesta lógica y soporta `MOCK_DATA`.
- [ ] Endpoints/Server Actions solo hablan con el servicio.
- [ ] Tests actualizados (`tests/services/**`, `tests/api/**`).
- [ ] Documentación ajustada (`README.md`, `.github/copilot-instructions.md`, este archivo).

## 4. Proceso de actualización

1. **Antes de desarrollar**: actualizar la tabla de estado con la fila que se atacará.
2. **Durante el PR**: anotar decisiones relevantes (nuevas interfaces, dependencias, mocks).
3. **Al cerrar el PR**:
   - Marcar el dominio como ✅/⚠️ según corresponda.
   - Añadir notas en "Comentarios recientes".
   - Enlazar el PR o commit si es útil para trazabilidad.

## 5. Próxima acción sugerida

Atacar **Reportes** y cerrar con **pruebas**:
- Consolidar `/api/reportes/**` en `ReportService` con repos dedicados.
- Ejecutar `npm run lint` y `npm run typecheck` (ya verdes) y luego pruebas.
- Actualizar este documento con el estado final y enlaces de PR.

---
Mantén este documento versionado junto con `README.md` y `.github/copilot-instructions.md` para que todos los colaboradores (y agentes) conozcan el plan real de migración.