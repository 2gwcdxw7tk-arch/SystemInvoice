# Módulo de Cuentas por Cobrar (CxC) - Guía Completa de Implementación

## 0. Estado actual (30 nov 2025)
- **Completado**: repositorios y servicios de condiciones de pago, clientes, documentos, aplicaciones, líneas de crédito, gestiones y disputas con modo mock; endpoints protegidos por `requireCxCPermissions`; integración Facturación↔CxC con generación de documentos espejo; migración `20251128101500_cxc_core_tables` aplicada y sincronizada con `schema_master.sql`; dashboard CxC básico con aging y alertas de límite de crédito; reportes CxC con impresión HTML y filtros por múltiples clientes en ejecución inmediata.
- **Pruebas automatizadas**: `tests/api/invoices.retail.cxc.test.ts`, `tests/api/cxc.credit-lines.test.ts` y `tests/api/cxc.document-applications.test.ts` cubren emisión, crédito disponible y aplicaciones parciales; `tests/api/cxc.payment-terms.test.ts` ahora incluye eliminación bloqueada cuando existen clientes asociados y `tests/api/cxc.customers.test.ts` valida resumen de crédito, reasignación/limpieza de términos y rechazo de condiciones inconsistentes. Los escenarios de gestiones/disputas se documentan para QA manual hasta contar con su suite dedicada. Última corrida integral de `npm run lint`, `npm run typecheck` y `npm test` realizada el 2025-11-30 sin fallas.
- **Próximas iniciativas (roadmap)**: automatizar reportes avanzados (provisiones, aging gráfico interactivo), enriquecer métricas de licencias y evaluar scoring predictivo basado en historial de cobro.
- **Plan de revisión activa**: mantenemos `docs/cxc-facturacion-revision.md` y el checklist `docs/checklists/cxc-flujos.md` como fuente canónica de pendientes y resultados de auditoría.

## 1. VISIÓN GENERAL DEL MÓDULO

Un módulo CxC es un sistema integral que gestiona el ciclo completo de cobro desde la facturación hasta la conciliación. Su objetivo es:

- **Automatizar** procesos manuales y propensos a errores
- **Centralizar** información dispersa en múltiples archivos
- **Mejorar** el flujo de caja mediante cobranza efectiva
- **Generar inteligencia** de negocio mediante reportes y KPIs
- **Garantizar** trazabilidad y auditoría de transacciones

---

## 2. PROCESOS CLAVE DEL MÓDULO CxC

### 2.1 Flujo Principal del Proceso

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. GESTIÓN DE CRÉDITO Y CLIENTES                              │
│    ├─ Creación/Validación de cliente                          │
│    ├─ Asignación de línea de crédito                          │
│    ├─ Configuración de términos de pago                       │
│    └─ Evaluación de riesgo crediticio                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. FACTURACIÓN Y EMISIÓN                                       │
│    ├─ Creación de factura (desde OV/Venta)                   │
│    ├─ Validaciones de datos                                   │
│    ├─ Asignación de fecha vencimiento                         │
│    ├─ Generación automática de documento                      │
│    └─ Envío a cliente (correo + portal)                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. GESTIÓN DE COBRANZA                                         │
│    ├─ Monitoreo de pagos próximos a vencer                    │
│    ├─ Envío de recordatorios automáticos                      │
│    ├─ Gestión de disputas y reclamos                          │
│    ├─ Seguimiento manual si es necesario                      │
│    └─ Categorización de clientes por riesgo                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. PROCESAMIENTO DE PAGOS                                      │
│    ├─ Recepción de pago (múltiples canales)                   │
│    ├─ Validación de importe y referencia                      │
│    ├─ Aplicación automática a facturas                        │
│    ├─ Conciliación bancaria automática                        │
│    └─ Confirmación a cliente                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. REPORTES Y ANÁLISIS                                         │
│    ├─ Dashboard de CxC en tiempo real                         │
│    ├─ Reportes de aging y cartera vencida                    │
│    ├─ KPIs de gestión (DSO, tasa de recuperación)            │
│    └─ Análisis de tendencias y riesgos                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Procesos Detallados

#### **PROCESO 1: Gestión de Crédito y Clientes**

**Objetivo:** Establecer bases sólidas para la relación crediticia

**Pasos:**
1. Crear registro de cliente con datos completos
2. Validar existencia fiscal y referencias comerciales
3. Evaluar capacidad de pago (scores, historial)
4. Definir línea de crédito inicial
5. Establecer términos de pago (neto 30/60/90)
6. Definir políticas de descuento por pronto pago
7. Asignar ejecutivo de cuenta responsable

**Validaciones clave:**
- Registro único de cliente (evitar duplicados)
- Límite de crédito acorde a capacidad
- Datos fiscales correctos y verificados
- Referencias comerciales validadas

---

#### **PROCESO 2: Facturación y Emisión**

**Objetivo:** Generar documentos precisos y puntuales

**Pasos:**
1. Validar orden de venta completa (cliente, productos, cantidades)
2. Verificar disponibilidad de inventario
3. Aplicar validaciones:
   - Cliente activo y sin bloqueos
   - No supera límite de crédito
   - Datos fiscales actualizados
   - No hay disputas pendientes de facturas anteriores
4. Generar factura automáticamente
5. Asignar número de folio secuencial
6. Calcular fecha de vencimiento (basada en términos)
7. Generar documento en formato PDF
8. Enviar a cliente por correo + portal web
9. Registrar en CxC y diario de ventas

**Validaciones críticas:**
- Datos de factura 100% precisos (cliente, monto, descripción)
- Números de factura secuenciales sin gaps
- Fechas de vencimiento correctas
- Totales calculados automáticamente
- Documentación de soporte adjunta

---

#### **PROCESO 3: Gestión de Cobranza**

**Objetivo:** Asegurar cobro oportuno

**Pasos:**
1. **Monitoreo preventivo (días 1-10):**
   - Identificar facturas próximas a vencer
   - Generar alertas en dashboard

2. **Primer recordatorio (días 11-15):**
   - Envío automático de recordatorio por correo
   - Ofrecer enlaces de pago directo

3. **Seguimiento activo (días 16-30):**
   - Si no hay pago: contacto telefónico/correo
   - Registrar gestión de cobro

4. **Cobranza intensiva (días 31-60):**
   - Múltiples recordatorios
   - Evaluación de causas de retraso
   - Ofertas de negociación si procede

5. **Gestión de vencidas (días 61+):**
   - Escalamiento a gerencia
   - Análisis de incobrabilidad
   - Acciones legales si corresponde

6. **Gestión de disputas:**
   - Registrar reclamo del cliente
   - Investigar causa
   - Aplicar crédito o ajuste si procede
   - Cerrar cuando se resuelva

**Categorización de clientes:**
- **Verde (Riesgo bajo):** 95%+ de puntualidad
- **Amarillo (Riesgo medio):** 75-94% puntualidad
- **Rojo (Riesgo alto):** <75% puntualidad

---

#### **PROCESO 4: Procesamiento de Pagos**

**Objetivo:** Aplicar pagos correctamente y conciliar

**Pasos:**
1. **Recepción de pago:**
   - Transferencia bancaria (integración bancaria)
   - Cheque (captura manual de referencia)
   - Efectivo/Depósito
   - Medio digital (plataformas de pago)

2. **Validaciones de pago:**
   - Importe coincide con factura(s)
   - Referencia de pago válida
   - Cliente activo
   - Fecha de pago vs fecha contable

3. **Aplicación automática:**
   - Matching inteligente (pago → facturas)
   - Si hay coincidencia exacta: aplicación automática
   - Si hay discrepancia: encolar para revisión manual

4. **Registros contables:**
   - Crear asiento en diario de ingresos
   - Actualizar estado de factura a PAGADA
   - Generar comprobante de pago

5. **Conciliación bancaria:**
   - Descargar movimientos bancarios
   - Comparar con pagos registrados
   - Identificar diferencias
   - Investigar y ajustar

6. **Confirmación a cliente:**
   - Email automático con resumen de pago
   - Adjuntar recibos
   - Mostrar saldo actualizado

**Validaciones críticas:**
- No duplicar pagos
- Aplicar a factura correcta
- Respetar fecha de corte contable
- Mantener trazabilidad completa

---

#### **PROCESO 5: Reportes y Análisis**

**Objetivo:** Proporcionar inteligencia de negocio

**Reportes específicos:**
- Detallado de CxC por cliente
- Aging de cartera (30/60/90+ días)
- Cartera vencida por período
- Análisis de incobrabilidad
- Provisiones contables
- KPIs mensuales
- Proyecciones de flujo de caja

---

## 3. VALIDACIONES NECESARIAS

### 3.1 Validaciones de Entrada de Datos

| Punto de Validación | Reglas | Acción si Falla |
|-------------------|-------|-----------------|
| **Creación de Cliente** | RUC/NIT válido, Razón Social, Email | Bloquear creación |
| **Asignación de Crédito** | Límite > 0, Términos definidos | Bloquear facturación |
| **Creación de Factura** | Cliente activo, No supera límite, Datos correctos | Bloquear emisión |
| **Número de Factura** | Secuencial único, Rango válido | Error y reintento |
| **Montos** | Positivos, Decimal correcto, Totales correctos | Bloquear guardado |
| **Fechas** | Vencimiento >= Emisión, Formato válido | Bloquear |
| **Recepción de Pago** | Importe > 0, Referencia válida | Encolar revisión |
| **Conciliación** | Movimiento bancario vs pago registrado | Marcar diferencia |

### 3.2 Validaciones de Negocio

- **No facturar** si cliente está bloqueado por:
  - Cartera vencida > X días
  - Deuda en litigio
  - Límite de crédito agotado
  
- **No permitir** aplicar pago a factura si:
  - Ya está completamente pagada
  - Tiene disputa pendiente
  - Es de un período cerrado contablemente

- **Alertas automáticas** si:
  - Cliente supera 80% de límite de crédito
  - Hay facturas vencidas > 30 días
  - Tasa de recuperación cae < 90%

- **Bloqueos automáticos** si:
  - Cartera vencida del cliente > límite establecido
  - Cliente tiene N disputas sin resolver

---

## 4. ESTRUCTURA DE BASE DE DATOS

### 4.1 Diagrama Entidad-Relación

```
┌──────────────┐
│   CLIENTES   │
├──────────────┤
│ cliente_id*  │
│ ruc/nit      │
│ razon_social │
│ email        │
│ telefono     │
│ direccion    │
│ estado       │ ──┐
│ fecha_creacion   │
└──────────────┘   │
                   │
                   │
┌──────────────────────────────────────────────┐
│         LINEAS_DE_CREDITO                    │
├──────────────────────────────────────────────┤
│ linea_credito_id*                            │
│ cliente_id (FK) ◄────────────────────────────┤
│ limite_disponible                            │
│ saldo_usado                                  │
│ terminos_pago (30/60/90)                     │
│ descuento_pronto_pago (%)                    │
│ fecha_validacion                             │
│ estado                                       │
└──────────────────────────────────────────────┘
                   ↑
                   │
┌──────────────────┴──────────────────┐
│         FACTURAS / CXC              │
├─────────────────────────────────────┤
│ factura_id*                         │
│ numero_factura                      │
│ cliente_id (FK)                     │
│ linea_credito_id (FK)               │
│ fecha_emision                       │
│ fecha_vencimiento                   │
│ monto_total                         │
│ monto_descuento                     │
│ monto_neto                          │
│ moneda                              │
│ estado (EMITIDA/PARCIAL/PAGADA)    │
│ referencia_documento                │
│ observaciones                       │
└──────────────────────────────────────┘
       │                │
       │                │
       ↓                ↓
┌──────────────┐  ┌─────────────────────┐
│DETALLE_FACT  │  │  DETALLE_PAGO       │
├──────────────┤  ├─────────────────────┤
│ detalle_id*  │  │ pago_id*            │
│ factura_id*  │  │ factura_id (FK)     │
│ producto_id  │  │ monto_aplicado      │
│ descripcion  │  │ fecha_pago          │
│ cantidad     │  │ tipo_pago (TRANSFER)│
│ precio_unit  │  │ referencia_pago     │
│ total_linea  │  │ comprobante_id      │
└──────────────┘  │ estado              │
                  └─────────────────────┘

┌────────────────────────────────────┐
│      GESTIONES_COBRANZA            │
├────────────────────────────────────┤
│ gestion_id*                        │
│ factura_id (FK)                    │
│ tipo_gestion (RECORDATORIO/LLAMADA)│
│ fecha_gestion                      │
│ usuario_id (FK)                    │
│ notas_gestion                      │
│ resultado (POSITIVO/NEGATIVO/OTRO) │
│ fecha_proximo_seguimiento          │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│      DISPUTAS / RECLAMOS           │
├────────────────────────────────────┤
│ disputa_id*                        │
│ factura_id (FK)                    │
│ fecha_apertura                     │
│ descripcion_disputa                │
│ monto_en_disputa                   │
│ estado (ABIERTA/RESUELTA/CANCELADA)│
│ fecha_resolucion                   │
│ resolucion                         │
│ monto_credito_aplicado             │
└────────────────────────────────────┘

┌─────────────────────────────────────┐
│     CONCILIACION_BANCARIA           │
├─────────────────────────────────────┤
│ conciliacion_id*                    │
│ fecha_conciliacion                  │
│ movimiento_banco_id                 │
│ pago_registrado_id (FK)             │
│ diferencia                          │
│ estado (CONCILIADO/PENDIENTE)       │
│ usuario_resolvio                    │
│ fecha_resolucion                    │
└─────────────────────────────────────┘
```

### 4.2 Tablas Principales - DDL (SQL Server)

```sql
-- TABLA: CLIENTES
CREATE TABLE CLIENTES (
    cliente_id INT PRIMARY KEY IDENTITY(1,1),
    ruc_nit VARCHAR(20) UNIQUE NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    email_cobros VARCHAR(255),
    telefono VARCHAR(20),
    telefono_cobros VARCHAR(20),
    direccion_fiscal TEXT,
    direccion_comercial TEXT,
    ciudad VARCHAR(100),
    pais VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'ACTIVO', -- ACTIVO, BLOQUEADO, INACTIVO
    categoria_riesgo VARCHAR(20) DEFAULT 'VERDE', -- VERDE, AMARILLO, ROJO
    dias_atraso_maximo INT DEFAULT 0,
    fecha_creacion DATETIME DEFAULT GETDATE(),
    fecha_actualizacion DATETIME DEFAULT GETDATE(),
    usuario_creacion INT,
    observaciones TEXT,
    CONSTRAINT chk_estado CHECK (estado IN ('ACTIVO', 'BLOQUEADO', 'INACTIVO')),
    CONSTRAINT chk_categoria CHECK (categoria_riesgo IN ('VERDE', 'AMARILLO', 'ROJO'))
);

-- TABLA: LINEAS_DE_CREDITO
CREATE TABLE LINEAS_DE_CREDITO (
    linea_credito_id INT PRIMARY KEY IDENTITY(1,1),
    cliente_id INT NOT NULL,
    limite_credito DECIMAL(15,2) NOT NULL,
    saldo_disponible DECIMAL(15,2) NOT NULL,
    saldo_usado DECIMAL(15,2) DEFAULT 0,
    terminos_pago_dias INT DEFAULT 30, -- 30, 60, 90
    descuento_pronto_pago DECIMAL(5,2) DEFAULT 0, -- En porcentaje
    dias_descuento INT DEFAULT 10, -- Días para aplicar descuento
    moneda VARCHAR(3) DEFAULT 'USD',
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    fecha_validacion DATETIME DEFAULT GETDATE(),
    fecha_proximo_review DATETIME,
    usuario_creacion INT,
    CONSTRAINT fk_cliente FOREIGN KEY (cliente_id) REFERENCES CLIENTES(cliente_id),
    CONSTRAINT chk_estado_linea CHECK (estado IN ('ACTIVO', 'SUSPENDIDA', 'CANCELADA'))
);

-- TABLA: FACTURAS / CXC
CREATE TABLE FACTURAS (
    factura_id INT PRIMARY KEY IDENTITY(1,1),
    numero_factura VARCHAR(20) UNIQUE NOT NULL,
    cliente_id INT NOT NULL,
    linea_credito_id INT NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_subtotal DECIMAL(15,2) NOT NULL,
    descuento_manual DECIMAL(15,2) DEFAULT 0,
    monto_impuesto DECIMAL(15,2) DEFAULT 0,
    monto_total DECIMAL(15,2) NOT NULL,
    monto_pagado DECIMAL(15,2) DEFAULT 0,
    monto_pendiente DECIMAL(15,2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'USD',
    estado VARCHAR(20) DEFAULT 'EMITIDA', -- EMITIDA, PARCIAL, PAGADA, VENCIDA, DISPUTADA, INCOBRABLE
    referencia_documento VARCHAR(100),
    orden_venta_id INT,
    enviado_cliente BIT DEFAULT 0,
    fecha_envio DATETIME,
    observaciones TEXT,
    fecha_creacion DATETIME DEFAULT GETDATE(),
    usuario_creacion INT,
    fecha_actualizacion DATETIME DEFAULT GETDATE(),
    CONSTRAINT fk_factura_cliente FOREIGN KEY (cliente_id) REFERENCES CLIENTES(cliente_id),
    CONSTRAINT fk_factura_linea FOREIGN KEY (linea_credito_id) REFERENCES LINEAS_DE_CREDITO(linea_credito_id),
    CONSTRAINT chk_estado_factura CHECK (estado IN ('EMITIDA', 'PARCIAL', 'PAGADA', 'VENCIDA', 'DISPUTADA', 'INCOBRABLE')),
    CONSTRAINT chk_monto_total CHECK (monto_total > 0),
    CONSTRAINT chk_monto_pendiente CHECK (monto_pendiente >= 0)
);

-- TABLA: DETALLE_FACTURAS
CREATE TABLE DETALLE_FACTURAS (
    detalle_id INT PRIMARY KEY IDENTITY(1,1),
    factura_id INT NOT NULL,
    item_numero INT NOT NULL,
    descripcion VARCHAR(500) NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(15,2) NOT NULL,
    descuento_item DECIMAL(5,2) DEFAULT 0, -- En porcentaje
    monto_linea DECIMAL(15,2) NOT NULL,
    impuesto_linea DECIMAL(15,2) DEFAULT 0,
    CONSTRAINT fk_detalle_factura FOREIGN KEY (factura_id) REFERENCES FACTURAS(factura_id) ON DELETE CASCADE,
    CONSTRAINT chk_cantidad CHECK (cantidad > 0),
    CONSTRAINT chk_precio CHECK (precio_unitario >= 0)
);

-- TABLA: PAGOS
CREATE TABLE PAGOS (
    pago_id INT PRIMARY KEY IDENTITY(1,1),
    numero_comprobante VARCHAR(20) UNIQUE NOT NULL,
    cliente_id INT NOT NULL,
    monto_total DECIMAL(15,2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'USD',
    tipo_pago VARCHAR(50) DEFAULT 'TRANSFERENCIA', -- TRANSFERENCIA, CHEQUE, EFECTIVO, TARJETA
    referencia_pago VARCHAR(100), -- Número de cheque, referencia bancaria, etc.
    fecha_pago DATE NOT NULL,
    fecha_registro DATETIME DEFAULT GETDATE(),
    cuenta_bancaria_id INT,
    estado VARCHAR(20) DEFAULT 'APLICADO', -- REGISTRADO, APLICADO, PARCIAL, CONCILIADO, RECHAZADO
    observaciones TEXT,
    usuario_registro INT,
    CONSTRAINT fk_pago_cliente FOREIGN KEY (cliente_id) REFERENCES CLIENTES(cliente_id),
    CONSTRAINT chk_estado_pago CHECK (estado IN ('REGISTRADO', 'APLICADO', 'PARCIAL', 'CONCILIADO', 'RECHAZADO'))
);

-- TABLA: APLICACION_PAGOS (Relación Pago-Factura)
CREATE TABLE APLICACION_PAGOS (
    aplicacion_id INT PRIMARY KEY IDENTITY(1,1),
    pago_id INT NOT NULL,
    factura_id INT NOT NULL,
    monto_aplicado DECIMAL(15,2) NOT NULL,
    fecha_aplicacion DATETIME DEFAULT GETDATE(),
    usuario_aplicacion INT,
    CONSTRAINT fk_aplic_pago FOREIGN KEY (pago_id) REFERENCES PAGOS(pago_id),
    CONSTRAINT fk_aplic_factura FOREIGN KEY (factura_id) REFERENCES FACTURAS(factura_id),
    CONSTRAINT chk_monto_aplic CHECK (monto_aplicado > 0),
    UNIQUE(pago_id, factura_id) -- Una aplicación única por pago-factura
);

-- TABLA: GESTIONES_COBRANZA
CREATE TABLE GESTIONES_COBRANZA (
    gestion_id INT PRIMARY KEY IDENTITY(1,1),
    factura_id INT NOT NULL,
    tipo_gestion VARCHAR(50) DEFAULT 'RECORDATORIO', -- RECORDATORIO, LLAMADA, VISITA, EMAIL, CARTA
    fecha_gestion DATETIME DEFAULT GETDATE(),
    usuario_id INT NOT NULL,
    notas_gestion TEXT,
    resultado VARCHAR(50), -- POSITIVO, NEGATIVO, SIN_RESPUESTA, COMPROMISO_PAGO
    fecha_proximo_seguimiento DATETIME,
    medio_contacto VARCHAR(50), -- TELEFONO, EMAIL, PRESENCIAL
    estado VARCHAR(20) DEFAULT 'COMPLETADA', -- COMPLETADA, PENDIENTE, CANCELADA
    CONSTRAINT fk_gestion_factura FOREIGN KEY (factura_id) REFERENCES FACTURAS(factura_id)
);

-- TABLA: DISPUTAS_RECLAMOS
CREATE TABLE DISPUTAS_RECLAMOS (
    disputa_id INT PRIMARY KEY IDENTITY(1,1),
    numero_disputa VARCHAR(20) UNIQUE NOT NULL,
    factura_id INT NOT NULL,
    cliente_id INT NOT NULL,
    fecha_apertura DATETIME DEFAULT GETDATE(),
    descripcion_disputa TEXT NOT NULL,
    monto_en_disputa DECIMAL(15,2) NOT NULL,
    causa_disputa VARCHAR(100), -- CANTIDAD_ERRADA, PRECIO_ERRADO, PRODUCTO_DEFECTUOSO, OTRO
    estado VARCHAR(20) DEFAULT 'ABIERTA', -- ABIERTA, EN_EVALUACION, RESUELTA, CANCELADA
    resolucion TEXT,
    monto_credito DECIMAL(15,2) DEFAULT 0,
    fecha_resolucion DATETIME,
    usuario_resolucion INT,
    CONSTRAINT fk_disputa_factura FOREIGN KEY (factura_id) REFERENCES FACTURAS(factura_id),
    CONSTRAINT fk_disputa_cliente FOREIGN KEY (cliente_id) REFERENCES CLIENTES(cliente_id),
    CONSTRAINT chk_estado_disputa CHECK (estado IN ('ABIERTA', 'EN_EVALUACION', 'RESUELTA', 'CANCELADA'))
);

-- TABLA: CONCILIACION_BANCARIA
CREATE TABLE CONCILIACION_BANCARIA (
    conciliacion_id INT PRIMARY KEY IDENTITY(1,1),
    fecha_conciliacion DATETIME DEFAULT GETDATE(),
    fecha_corte DATE NOT NULL,
    movimiento_banco_id VARCHAR(50) NOT NULL,
    monto_movimiento DECIMAL(15,2) NOT NULL,
    pago_registrado_id INT,
    diferencia DECIMAL(15,2) DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, CONCILIADO, INVESTIGACION
    usuario_resolvio INT,
    fecha_resolucion DATETIME,
    notas_resolucion TEXT,
    CONSTRAINT fk_conc_pago FOREIGN KEY (pago_registrado_id) REFERENCES PAGOS(pago_id)
);

-- TABLA: PROVISION_INCOBRABLES
CREATE TABLE PROVISION_INCOBRABLES (
    provision_id INT PRIMARY KEY IDENTITY(1,1),
    factura_id INT NOT NULL,
    monto_provisionado DECIMAL(15,2) NOT NULL,
    porcentaje_provision INT, -- 50%, 75%, 100%
    dias_vencimiento INT,
    fecha_provision DATETIME DEFAULT GETDATE(),
    fecha_recuperacion DATETIME,
    estado VARCHAR(20) DEFAULT 'ACTIVA', -- ACTIVA, RECUPERADA, CASTIGADA
    CONSTRAINT fk_prov_factura FOREIGN KEY (factura_id) REFERENCES FACTURAS(factura_id)
);

-- INDICES PARA OPTIMIZACIÓN
CREATE INDEX idx_cliente_estado ON CLIENTES(estado);
CREATE INDEX idx_factura_cliente ON FACTURAS(cliente_id);
CREATE INDEX idx_factura_estado ON FACTURAS(estado);
CREATE INDEX idx_factura_vencimiento ON FACTURAS(fecha_vencimiento);
CREATE INDEX idx_pago_cliente ON PAGOS(cliente_id);
CREATE INDEX idx_pago_fecha ON PAGOS(fecha_pago);
CREATE INDEX idx_aplicacion_pago ON APLICACION_PAGOS(pago_id);
CREATE INDEX idx_aplicacion_factura ON APLICACION_PAGOS(factura_id);
CREATE INDEX idx_gestion_factura ON GESTIONES_COBRANZA(factura_id);
CREATE INDEX idx_disputa_factura ON DISPUTAS_RECLAMOS(factura_id);
```

---

## 5. REPORTES E INDICADORES CLAVE (KPIs)

### 5.1 Dashboard Principal (Tiempo Real)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD CxC - EN VIVO                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Cartera Total: $250,000  │  Pagada: $185,000   │  Pendiente: $65,000  │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐
│  │ VENCIMIENTO DE CARTERA (Aging)                             │
│  ├────────────────────────────────────────────────────────────┤
│  │ No Vencida (0-30):      $45,000   ████████░░  18%         │
│  │ Vencida 31-60 días:     $12,000   ██░░░░░░░░  5%          │
│  │ Vencida 61-90 días:     $5,000    █░░░░░░░░░  2%          │
│  │ Vencida 90+ días:       $3,000    █░░░░░░░░░  1%          │
│  │ Pagada:                 $185,000  ████████████████████░░  74% │
│  └────────────────────────────────────────────────────────────┘
│
│  DSO (Days Sales Outstanding): 28 días  [Objetivo: <30]  ✓
│  Tasa de Recuperación: 94.3%  [Objetivo: >90%]  ✓
│  Tasa de Morosidad: 2.8%  [Objetivo: <5%]  ✓
│
│  ┌─────────────────────────┬─────────────────────────┐
│  │ Clientes con Riesgo     │ Gestiones Pendientes    │
│  ├─────────────────────────┼─────────────────────────┤
│  │ ROJO (Crítico): 2       │ Recordatorios: 8        │
│  │ AMARILLO (Medio): 5     │ Llamadas: 3             │
│  │ VERDE (Bajo): 43        │ Visitas: 1              │
│  └─────────────────────────┴─────────────────────────┘
│
│  Próximas 48 Horas a Vencer: $12,500
│  Facturas en Disputa: 1 ($1,200)
│  Provisión de Incobrables: $2,100
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 KPIs Principales a Reportar

#### **1. DSO (Days Sales Outstanding)**
- **Fórmula:** (Saldo CxC Promedio / Ventas Mensuales) × 30
- **Interpretación:** Días promedio que tarda en cobrar
- **Objetivo:** < 30 días (industria 35-45 días)
- **Acción si aumenta:** Revisar políticas de crédito, procesos de cobranza

#### **2. Aging de Cartera**
```
Categorización por días de atraso:
- 0-30 días:      Gestión preventiva
- 31-60 días:     Seguimiento activo
- 61-90 días:     Cobranza intensiva
- 90+ días:       Escalamiento legal
```

#### **3. Tasa de Recuperación**
- **Fórmula:** (Pagos Recibidos / Cartera Vencida) × 100
- **Objetivo:** > 90%

#### **4. Tasa de Morosidad**
- **Fórmula:** (Cartera Vencida > 30 días / Cartera Total) × 100
- **Objetivo:** < 5%

#### **5. Índice de Rotación CxC**
- **Fórmula:** Ventas Netas / Saldo CxC Promedio
- **Interpretación:** Cuántas veces se cobra la cartera en el período

#### **6. Tasa de Incobrabilidad Histórica**
- **Fórmula:** (Facturas Castigadas / Total Facturas) × 100
- **Objetivo:** < 2%

#### **7. Concentración de Cartera**
- **Métrica:** % de cartera del top 10 clientes
- **Objetivo:** < 50% (evitar riesgo)

#### **8. Provisión de Incobrables**
- Automática basada en días de atraso:
  - 30-60 días: 20% del monto
  - 61-90 días: 50% del monto
  - 90+ días: 100% del monto

---

### 5.3 Reportes Operacionales

#### **Reporte 1: Cartera Vencida por Cliente**
```sql
SELECT 
    c.razon_social,
    f.numero_factura,
    f.fecha_vencimiento,
    DATEDIFF(DAY, f.fecha_vencimiento, GETDATE()) AS dias_atraso,
    f.monto_pendiente,
    CASE 
        WHEN DATEDIFF(DAY, f.fecha_vencimiento, GETDATE()) <= 30 THEN '1-30'
        WHEN DATEDIFF(DAY, f.fecha_vencimiento, GETDATE()) <= 60 THEN '31-60'
        WHEN DATEDIFF(DAY, f.fecha_vencimiento, GETDATE()) <= 90 THEN '61-90'
        ELSE '90+'
    END AS rango_dias
FROM FACTURAS f
JOIN CLIENTES c ON f.cliente_id = c.cliente_id
WHERE f.estado IN ('EMITIDA', 'VENCIDA', 'PARCIAL')
    AND f.monto_pendiente > 0
    AND f.fecha_vencimiento < GETDATE()
ORDER BY dias_atraso DESC;
```

#### **Reporte 2: Análisis de Gestiones de Cobranza**
```sql
SELECT 
    COUNT(*) AS total_gestiones,
    SUM(CASE WHEN resultado = 'POSITIVO' THEN 1 ELSE 0 END) AS gestiones_exitosas,
    CAST(SUM(CASE WHEN resultado = 'POSITIVO' THEN 1 ELSE 0 END) AS FLOAT) 
        / COUNT(*) * 100 AS tasa_exito_pct,
    tipo_gestion,
    MONTH(fecha_gestion) AS mes
FROM GESTIONES_COBRANZA
WHERE YEAR(fecha_gestion) = YEAR(GETDATE())
GROUP BY tipo_gestion, MONTH(fecha_gestion);
```

#### **Reporte 3: Proyección de Flujo de Caja**
```sql
SELECT 
    DATEADD(DAY, -DAY(fecha_vencimiento) + 1, fecha_vencimiento) AS mes,
    SUM(monto_pendiente) AS flujo_esperado
FROM FACTURAS
WHERE estado IN ('EMITIDA', 'VENCIDA', 'PARCIAL')
GROUP BY DATEADD(DAY, -DAY(fecha_vencimiento) + 1, fecha_vencimiento)
ORDER BY mes;
```

#### **Reporte 4: Análisis de Disputas**
```sql
SELECT 
    COUNT(*) AS total_disputas,
    SUM(monto_en_disputa) AS monto_total_disputa,
    SUM(CASE WHEN estado = 'ABIERTA' THEN 1 ELSE 0 END) AS disputas_abiertas,
    SUM(CASE WHEN estado = 'RESUELTA' THEN 1 ELSE 0 END) AS disputas_resueltas,
    causa_disputa
FROM DISPUTAS_RECLAMOS
GROUP BY causa_disputa;
```

---

## 6. FUNCIONALIDADES ADICIONALES RECOMENDADAS

### 6.1 Automatizaciones

1. **Envío Automático de Facturas**
   - Generar PDF y enviar por correo al momento de emitir
   - Portal web para que cliente descargue copia

2. **Recordatorios Automáticos**
   - 10 días antes de vencer
   - Día del vencimiento
   - 5, 15, 30 días después de vencer
   - Personalización por cliente

3. **Conciliación Bancaria Automática**
   - Conexión con banco para descargar movimientos
   - Matching automático pago-factura
   - Identificación de discrepancias

4. **Cálculo Automático de Intereses Moratorios**
   - Configurable por cliente
   - Aplicación automática si está vencida más de X días

5. **Bloqueo Automático de Crédito**
   - Si cartera vencida > límite
   - Notificación a ventas

### 6.2 Integraciones Críticas

- **ERP/Sistema de Ventas:** Importar OV automáticamente
- **Sistema Contable:** Registrar asientos automáticamente
- **Plataformas de Pago:** Recibir confirmaciones de pago
- **Correo Electrónico:** Envío masivo de recordatorios
- **Portal Web:** Cliente ve estado de facturas
- **Bancos:** Descarga de movimientos para conciliación

### 6.3 Seguridad y Auditoría

- Registro de auditoría completo (quién, qué, cuándo, dónde)
- Control de acceso por roles (cobranza, gerencia, contabilidad)
- Permisos granulares (ver/editar/eliminar)
- Trazabilidad de cambios en facturas
- Logs de intentos de acceso fallidos
- Encriptación de datos sensibles

### 6.4 Mobile y Acceso Remoto

- App móvil para gestores de cobranza
- GPS de visitas
- Captura de firmas digitales
- Acceso offline con sincronización

### 6.5 Análisis Predictivo (Futuro)

- Machine Learning para predecir incobrabilidad
- Análisis de comportamiento de pago
- Scoring automático de clientes
- Recomendaciones de límite de crédito

---

## 7. IMPLEMENTACIÓN - FASES

### Fase 1: Estructura Base (Semanas 1-2)
- ✓ Diseño BD y creación de tablas
- ✓ CRUD de clientes y líneas de crédito
- ✓ Gestión básica de facturas

### Fase 2: Procesos Operacionales (Semanas 3-4)
- ✓ Facturación completa
- ✓ Gestión de pagos
- ✓ Conciliación básica

### Fase 3: Cobranza e Inteligencia (Semanas 5-6)
- ✓ Gestiones de cobranza
- ✓ Disputas y reclamos
- ✓ Dashboard y reportes

### Fase 4: Automatizaciones (Semanas 7-8)
- ✓ Envíos automáticos
- ✓ Recordatorios
- ✓ Integraciones

### Fase 5: Refinamiento (Semanas 9+)
- ✓ Optimizaciones
- ✓ Testing y QA
- ✓ Capacitación usuarios
- ✓ Go Live

---

## 8. MÉTRICAS DE ÉXITO

| Métrica | Inicial | Objetivo 3 Meses | Objetivo 6 Meses |
|---------|---------|-----------------|-----------------|
| DSO | 45 días | 35 días | 28 días |
| Tasa Recuperación | 88% | 91% | 94% |
| Tasa Morosidad | 5.5% | 4% | 2.8% |
| Tiempo Procesamiento Pago | 2 días | 1 día | 4 horas |
| Disputas Resueltas | 60% en 5 días | 80% en 3 días | 90% en 2 días |
| Automatización Facturación | 30% | 70% | 95% |
| Error en Conciliación | 0.8% | 0.2% | 0% |

---

## 9. CONSIDERACIONES FINALES

Este módulo CxC debe ser:

✓ **Escalable:** Crecer con la empresa
✓ **Flexible:** Adaptarse a nuevas políticas
✓ **Integrado:** Conectar con otros sistemas
✓ **Seguro:** Proteger datos sensibles
✓ **Auditable:** Trazar cada operación
✓ **Eficiente:** Reducir carga manual
✓ **Inteligente:** Proporcionar insights
✓ **User-Friendly:** Fácil de usar

El objetivo final es tener un sistema que **garantice flujo de caja saludable, minimice riesgos de incobrabilidad y proporcione visibilidad total del negocio.**

---

## 10. Implementación actual y focos de seguimiento

- **Cobertura vigente**: Los servicios y APIs descritos están desplegados tanto para PostgreSQL como para `MOCK_DATA=true`, respetando permisos y la bandera `NEXT_PUBLIC_ES_RESTAURANTE`.
- **Monitoreo recomendado**: validar trimestralmente los parámetros de bloqueo automático de crédito y la eficacia de las gestiones registradas en `collection_logs` para ajustar recordatorios.
- **Próximos pasos sugeridos**: evaluar automatización de intereses moratorios y la integración con conciliación bancaria avanzada reutilizando la estructura de documentos y aplicaciones existente.

