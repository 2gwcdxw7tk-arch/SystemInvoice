# Plan de Revisión Continua CxC ↔ Facturación

> **Propósito**: centralizar la evaluación funcional entre el módulo de Cuentas por Cobrar (CxC) y el módulo de Facturación, identificar brechas pendientes y coordinar acciones necesarias antes de su ejecución.

## 0. Alcance y metodología
- **Cobertura**: catálogo de clientes retail, condiciones de pago, retenciones, documentos CxC, aplicaciones, gestión de crédito, reportes y cualquier interacción con emisión de facturas retail.
- **Equipo responsable**: líderes de CxC y Facturación con apoyo de QA. Cada hallazgo debe registrarse aquí y en el checklist operativo antes de iniciar desarrollo.
- **Evidencia mínima**: resultado de pruebas manuales o automatizadas, enlaces a PRs y referencia al checklist `docs/checklists/cxc-flujos.md`.

## 1. Estado actual de referencia
- Implementación productiva basada en servicios Prisma (`PaymentTermService`, `CustomerService`, `CustomerDocumentService`, `CustomerDocumentApplicationService`, `CustomerCreditLineService`).
- Integración de facturación retail genera documentos espejo y sincroniza cupo de crédito.
- Falta UI CRUD completa para CxC (acciones se apoyan en endpoints). Los reportes avanzados y controles de retenciones están en fase de diseño.

## 2. Flujos por revisar (TODOs ordenados)
> Marca cada paso como `Completado` una vez que la revisión y sus pruebas asociadas concluyan. Si se detectan nuevos requisitos, anótalos en la subsección **Hallazgos** correspondiente y agrégalos al checklist.

### 2.1 Configuración y catálogos base
- [x] Revisar CRUD de condiciones de pago (`/api/preferencias/terminos-pago`) y sus validaciones contra clientes vigentes.
- [x] Revisar CRUD del catálogo de clientes (`/api/cxc/clientes`) con foco en límites de crédito y asignación de términos.
- [x] Validar sincronización de líneas de crédito (`CustomerCreditLineService`) al modificar límites o bloquear clientes.
- **Hallazgos**:
	- 2025-11-30 – Copilot: Endpoints GET/POST/PATCH/DELETE protegidos por `requireCxCPermissions`; validaciones Zod cubren rangos y nulos. `PaymentTermService` evita eliminación con clientes asociados; nueva prueba `impide eliminar una condición con clientes asociados` confirma respuesta 409.
	- 2025-11-30 – Copilot: `CustomerService.resolvePaymentTermId` valida coherencia entre `paymentTermId` y `paymentTermCode`; el API responde 400 ante términos inexistentes o inconsistentes. Se añadieron pruebas para resumen de crédito, reasignación/limpieza de término y mocks incluyen cliente bloqueado (`RET002`) con línea de crédito ON_HOLD.
	- 2025-11-30 – Copilot: `CustomerDocumentService` sincroniza `creditUsed` tras `update`, `adjustBalance` y `setStatus` para facturas/notas débito; la suite `tests/services/cxc/customer-document.service.test.ts` cubre los escenarios de actualización y evita regresiones en mock mode.

### 2.2 Emisión y espejado en facturación
- [x] Confirmar que Facturación retail exige cliente y término válidos (`src/app/facturacion/page.tsx`).
- [x] Verificar generación de documentos CxC al emitir factura (`CustomerDocumentService.create`).
- [x] Validar cálculo de fecha de vencimiento y estatus inicial del documento.
- **Hallazgos**:
	- 2025-11-30 – Copilot: La API `/api/invoices` rechaza facturas retail sin cliente asignado (`tests/api/invoices.retail.cxc.test.ts`); `InvoiceService` reutiliza el término de pago disponible y conserva la validación de crédito.
	- 2025-11-30 – Copilot: El espejado CxC mantiene monto, saldo y vencimiento calculados con `paymentTermService.calculateDueDate`; las pruebas de integración (`tests/api/invoices.retail.cxc.test.ts`) confirman el estatus `PENDIENTE` y la actualización del crédito usado.

### 2.3 Retenciones, aplicaciones y pagos
- [x] Inspeccionar endpoints de retenciones y recibos (`/api/cxc/documentos`, `/api/cxc/documentos/aplicaciones`).
- [x] Validar orden de aplicación (retenciones → recibos) y procesos de desaplicación.
- [x] Confirmar sincronización de saldo vs. crédito disponible tras cada aplicación.
- **Hallazgos**:
	- 2025-12-01 – Copilot: Las pruebas `tests/api/cxc.document-applications.test.ts` cubren prioridad de retenciones, reversión vía `DELETE /api/cxc/documentos/aplicaciones/[id]` y sincronización de crédito usado. Se amplió el reset del mock CxC para restaurar `collectionLogs`, `disputes` y `sequences`.

### 2.4 Reportes y monitoreo
- [x] Evaluar dashboard CxC actual (aging, alertas de crédito) y detectar KPIs faltantes.
- [x] Mapear reportes requeridos (aging detallado, cartera vencida, provisiones) y el estado de su implementación.
- [x] Revisar integración de reportes con menús y permisos (solo disponible cuando `NEXT_PUBLIC_ES_RESTAURANTE=false`).
- **Hallazgos**:
	- 2025-12-01 – Copilot: Los endpoints `/api/reportes/cxc/*` aceptan `customer_codes` (CSV) y generan versiones HTML imprimibles. La UI `src/app/reportes/page.tsx` incorpora selector multi-cliente, chips removibles y recarga tras configurar filtros; impresión reutiliza `format=html` con los nuevos parámetros.

### 2.5 QA y automatización
- [x] Ejecutar `npm run lint`, `npm run typecheck` y `npm test` para garantizar cobertura mínima.
- [ ] Documentar escenarios de prueba manual complementaria (gestiones y disputas).
- [ ] Registrar métricas de prueba (fechas, responsables) en el checklist.
- **Hallazgos**:
	- 2025-11-30 – Copilot: `npm run lint`, `npm run typecheck` y `npm test` finalizados sin fallas; errores en consola corresponden a validaciones negativas controladas.

## 3. Proceso de mantenimiento
1. **Registrar** nuevos descubrimientos en la sección de hallazgos correspondiente y en `docs/checklists/cxc-flujos.md` con estado `Pendiente`.
2. **Priorizar** con el equipo responsable y vincular a tareas/PRs concretos.
3. **Actualizar** el estado cada vez que un flujo se revise nuevamente o se implemente una mejora.
4. **Evidenciar** resultados (enlaces a pruebas, capturas, PRs) antes de cambiar estados a `Completado`.

## 4. Referencias cruzadas
- Checklist operativo: `docs/checklists/cxc-flujos.md`.
- Guía general CxC: `docs/investigacion-cxc.md`.
- Plan bandera retail/restaurante: `docs/plan-esrestaurante-cajas.md`.
- Migración Prisma: `docs/migracion-prisma.md`.
