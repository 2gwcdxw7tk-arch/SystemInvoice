# Checklist operativo – Revisión CxC ↔ Facturación

> Actualiza este archivo cada vez que se descubra un nuevo pendiente o se complete una revisión. Estados permitidos: **Pendiente**, **En progreso**, **Completado**. Cada nuevo descubrimiento debe agregarse como una fila adicional antes de iniciar su ejecución.

| ID | Flujo | Detalle | Última revisión | Responsable | Estado |
| --- | --- | --- | --- | --- | --- |
| CXC-01 | Configuración base | Revisar CRUD de condiciones de pago (validaciones, permisos, sincronización con clientes). | 2025-11-30 | Copilot | Completado |
| CXC-02 | Clientes retail | Auditar catálogo de clientes, límites de crédito, bloqueo automático y seeds/mock. | 2025-11-30 | Copilot | Completado |
| CXC-03 | Líneas de crédito | Validar `CustomerCreditLineService` y actualizaciones tras cambios en documentos. | 2025-11-30 | Copilot | Completado |
| CXC-04 | Espejo de facturas | Confirmar creación de documentos CxC desde facturación, cálculo de vencimientos y estatus. | 2025-11-30 | Copilot | Completado |
| CXC-05 | Retenciones y recibos | Revisar orden de aplicación, desaplicaciones y sincronización de saldos (tests automatizados actualizados). | 2025-12-01 | Copilot | Completado |
| CXC-06 | Reportes CxC | Inventario de reportes, filtros por múltiples clientes y formatos imprimibles verificados. | 2025-12-01 | Copilot | Completado |
| CXC-07 | Dashboard y alertas | Evaluar aging, alertas de límite de crédito y métricas complementarias. | _No revisado_ | _Asignar_ | Pendiente |
| CXC-08 | QA automatizada | Ejecutar lint, typecheck, pruebas y documentar escenarios manuales. | 2025-11-30 | Copilot | En progreso |
| CXC-09 | Documentación viva | Mantener sincronizados `docs/cxc-facturacion-revision.md`, `docs/investigacion-cxc.md` y README. | 2025-11-30 | Copilot | En progreso |
