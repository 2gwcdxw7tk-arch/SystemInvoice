# Checklist de implementación – Bandera `EsRestaurante`, flujo retail y límites de cajas

> Actualiza el estado de cada rubro en cada iteración. Estados permitidos: **Pendiente**, **En progreso**, **Completado**.

| ID | Rubro | Detalle | Estado |
| --- | --- | --- | --- |
| CFG-01 | Variables de entorno y helpers | Extender `src/lib/env.ts`, crear `src/config/features.ts`, exponer `env.features`/`env.licenses`, actualizar `.env.example` y documentación de variables. | Pendiente |
| UI-01 | Sidebar y navegación | Condicionar items de menú (Mesas, Meseros, CxC) según flag y permisos; ocultar/inhabilitar cuando `isRestaurant=true`. | Pendiente |
| UI-02 | Facturación sin pedido (modo retail) | Añadir selector de clientes, controles contado/crédito, banner "Modo Retail" y cálculo de vencimientos en la pantalla existente. | Pendiente |
| UI-03 | Guards de Mesas/Meseros | Mostrar pantalla informativa cuando `isRestaurant=false`; bloquear accesos, login de meseros y enlaces profundos. | Pendiente |
| UI-04 | Módulo de Cuentas por Cobrar | Crear/actualizar vistas para catálogo de clientes, documentos y aplicaciones con restricciones de permisos y flag. | Pendiente |
| UI-05 | Dashboard básico de CxC | Mostrar aging (0-30/31-60/61-90/90+), alertas de clientes >80% límite y accesos rápidos a gestiones/disputas. | Pendiente |
| PERM-01 | Permisos y seeds | Definir nuevos códigos (`menu.cxc.view`, `customers.manage`, `payment-terms.manage`, etc.), actualizar seeds y validaciones `hasSessionPermission`. | Pendiente |
| DB-01 | Tabla `customers` | Migración Prisma + `schema_master.sql`, incluye `payment_term_id`, límites de crédito y auditoría. | Pendiente |
| DB-02 | Tabla `payment_terms` | Migración, seeds iniciales (0,15,30,60,90,120 días) y relaciones con clientes/facturas. | Pendiente |
| DB-03 | Tablas CxC (`customer_documents`, `customer_document_applications`) | Estructura para documentos (INVOICE, NC, ROC, RET, etc.) y aplicaciones con soporte de retenciones. | Pendiente |
| DB-04 | Tabla `customer_credit_lines` | Manejar límites, saldo disponible, bloqueos automáticos y auditoría de revisiones. | Pendiente |
| DB-05 | Tabla `collection_logs` | Registrar recordatorios/llamadas, próximos seguimientos y resultados. | Pendiente |
| DB-06 | Tabla `customer_disputes` | Capturar reclamos, estados y ajustes aplicados. | Pendiente |
| API-01 | Endpoints Payment Terms | CRUD protegido por permisos, bloqueo cuando existan clientes asociados, oculto en modo restaurante. | Pendiente |
| API-02 | Endpoints Clientes | CRUD completo reutilizando permisos y validaciones de flag. | Pendiente |
| API-03 | Endpoints CxC / Aplicaciones | Crear rutas para listar documentos, registrar pagos parciales, notas de crédito, retenciones y permitir desaplicar movimientos (aplicar RET antes de ROC). | Pendiente |
| API-04 | Endpoints Líneas de Crédito | Asignar/ajustar límites, exponer porcentaje usado, bloquear/desbloquear clientes y avisar a facturación. | Pendiente |
| API-05 | Endpoints Gestiones/Disputas | CRUD para recordatorios, compromisos y reclamos con validación de permisos y flag. | Pendiente |
| API-06 | Facturación / CxC integración | Exigir `customer_id` en modo retail, crear documento espejo al emitir factura, calcular vencimiento según `payment_term`. | Pendiente |
| SRV-01 | Servicios CxC | Implementar `CustomerService`, `PaymentTermService`, `CustomerDocumentService`, `CustomerDocumentApplicationService` con soporte mock, orden de aplicación (RET ➜ ROC) y lógica de desaplicar. | Pendiente |
| SRV-02 | Servicio de Líneas de Crédito | Evaluar límites, bloquear/desbloquear clientes y exponer métricas de uso. | Pendiente |
| SRV-03 | Servicios de gestiones/disputas | Registrar gestiones, compromisos y reclamos para alimentar KPIs y alerts. | Pendiente |
| SRV-04 | Servicios caja/licencias | Añadir conteos a `CashRegisterService`/`CashRegisterRepository`, validar límite de cajas y sesiones activas, mensajes amigables. | Pendiente |
| SRV-05 | Integración permisos en servicios | Asegurar que servicios nuevos respeten permisos y bandera antes de ejecutar operaciones. | Pendiente |
| TEST-01 | Límite de cajas | Nuevas pruebas en `tests/api/caja.*` para creación y aperturas bloqueadas al exceder licencia. | Pendiente |
| TEST-02 | Bandera `isRestaurant` | Pruebas para asegurar 403 en `/api/mesas`, `/api/meseros` y guards de UI/handlers. | Pendiente |
| TEST-03 | CxC y facturación retail | Casos para emisión a crédito, cálculo de vencimiento, creación de documentos CxC y aplicaciones de pagos parciales. | Pendiente |
| DOC-01 | Documentación general | Actualizar `README.md`, `.github/copilot-instructions.md`, `.github/prompts/plan-sistemaFacturacion.prompt.md` con modo retail, CxC y límites de cajas. | Pendiente |
| DOC-02 | Historial de cambios/plan | Mantener `docs/plan-esrestaurante-cajas.md` y este checklist sincronizados tras cada iteración. | Pendiente |
| DOC-03 | Investigación CxC | Actualizar `docs/investigacion-cxc.md` con hallazgos relevantes y marcar qué ya se implementó. | Pendiente |
