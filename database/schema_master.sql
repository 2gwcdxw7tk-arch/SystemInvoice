-- ========================================================
-- Script maestro de base de datos para Facturador
-- Propósito: Mantener la estructura necesaria para autenticación y operaciones básicas
-- Ejecutar en el contexto de la base de datos configurada en DB_CONNECTION_STRING
-- ========================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ========================================================
-- Creación de esquema principal
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'app')
BEGIN
    EXEC('CREATE SCHEMA app AUTHORIZATION dbo;');
END;
GO

-- ========================================================
-- Tabla: app.admin_users
-- Propósito: Almacenar credenciales hashadas de administradores del backoffice
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.admin_users') AND type = 'U')
BEGIN
    CREATE TABLE app.admin_users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(120) NOT NULL UNIQUE,
        password_hash NVARCHAR(100) NOT NULL,
        display_name NVARCHAR(150) NULL,
        is_active BIT NOT NULL DEFAULT (1),
        last_login_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NULL
    );
END;
GO

-- ========================================================
-- Trigger: app.tr_admin_users_update_timestamp
-- Propósito: Mantener updated_at en sincronía para admin_users
-- ========================================================
IF OBJECT_ID('app.tr_admin_users_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_admin_users_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_admin_users_update_timestamp
ON app.admin_users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE u
    SET updated_at = SYSUTCDATETIME()
    FROM app.admin_users u
        INNER JOIN inserted i ON u.id = i.id;
END;
GO

-- ========================================================
-- Tabla: app.waiters
-- Propósito: Almacenar identificadores y PIN hashados para personal de piso
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.waiters') AND type = 'U')
BEGIN
    CREATE TABLE app.waiters (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(50) NOT NULL UNIQUE,
        full_name NVARCHAR(150) NOT NULL,
        pin_hash NVARCHAR(100) NOT NULL,
        pin_signature CHAR(64) NOT NULL,
        phone NVARCHAR(30) NULL,
        email NVARCHAR(150) NULL,
        is_active BIT NOT NULL DEFAULT (1),
        last_login_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NULL
    );
END;
GO

IF OBJECT_ID('app.tr_waiters_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_waiters_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_waiters_update_timestamp
ON app.waiters
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE w
    SET updated_at = SYSUTCDATETIME()
    FROM app.waiters w
        INNER JOIN inserted i ON w.id = i.id;
END;
GO

IF COL_LENGTH('app.waiters', 'pin_signature') IS NULL
BEGIN
    ALTER TABLE app.waiters ADD pin_signature CHAR(64) NULL;
    UPDATE app.waiters SET pin_signature = REPLICATE('0', 64) WHERE pin_signature IS NULL;
    ALTER TABLE app.waiters ALTER COLUMN pin_signature CHAR(64) NOT NULL;
END;
GO

IF COL_LENGTH('app.waiters', 'phone') IS NULL
BEGIN
    ALTER TABLE app.waiters ADD phone NVARCHAR(30) NULL;
END;
GO

IF COL_LENGTH('app.waiters', 'email') IS NULL
BEGIN
    ALTER TABLE app.waiters ADD email NVARCHAR(150) NULL;
END;
GO

-- ========================================================
-- Tabla: app.login_audit
-- Propósito: Registrar eventos de autenticación para auditoría básica
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.login_audit') AND type = 'U')
BEGIN
    CREATE TABLE app.login_audit (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        login_type NVARCHAR(20) NOT NULL,
        identifier NVARCHAR(150) NOT NULL,
        success BIT NOT NULL,
        ip_address NVARCHAR(45) NULL,
        user_agent NVARCHAR(300) NULL,
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        notes NVARCHAR(300) NULL
    );
END;
GO

-- ========================================================
-- Índices adicionales
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_waiters_is_active' AND object_id = OBJECT_ID('app.waiters'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_waiters_is_active ON app.waiters (is_active) INCLUDE (code, full_name);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_login_audit_created_at' AND object_id = OBJECT_ID('app.login_audit'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_login_audit_created_at ON app.login_audit (created_at DESC);
END;
GO

-- ========================================================
-- Tabla: app.exchange_rates
-- Propósito: Registrar tipo de cambio diario entre moneda local (base) y extranjera (cotizada)
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.exchange_rates') AND type = 'U')
BEGIN
    CREATE TABLE app.exchange_rates (
        id INT IDENTITY(1,1) PRIMARY KEY,
        rate_date DATE NOT NULL,
        rate_value DECIMAL(18,6) NOT NULL,
        base_currency_code NVARCHAR(3) NOT NULL,
        quote_currency_code NVARCHAR(3) NOT NULL,
        source_name NVARCHAR(120) NULL,
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NULL,
        CONSTRAINT CK_exchange_rates_rate_value_positive CHECK (rate_value > 0),
        CONSTRAINT UQ_exchange_rates_rate_date UNIQUE (rate_date, base_currency_code, quote_currency_code)
    );
END;
GO

IF OBJECT_ID('app.tr_exchange_rates_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_exchange_rates_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_exchange_rates_update_timestamp
ON app.exchange_rates
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE er
    SET updated_at = SYSUTCDATETIME()
    FROM app.exchange_rates er
        INNER JOIN inserted i ON er.id = i.id;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_exchange_rates_rate_date' AND object_id = OBJECT_ID('app.exchange_rates'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_exchange_rates_rate_date ON app.exchange_rates (rate_date DESC) INCLUDE (rate_value, base_currency_code, quote_currency_code);
END;
GO

-- ========================================================
-- Datos iniciales opcionales (descomentarlo y ajustar hashes para entornos de prueba)
-- ========================================================
-- INSERT INTO app.admin_users (username, password_hash, display_name)
-- SELECT 'admin@empresa.com', '$2a$10$REEMPLAZAR_CON_HASH_BCRYPT', 'Administrador General'
-- WHERE NOT EXISTS (SELECT 1 FROM app.admin_users WHERE username = 'admin@empresa.com');
-- GO

-- INSERT INTO app.waiters (code, full_name, pin_hash)
-- SELECT 'MESERO01', 'Mesero de Prueba', '$2a$10$REEMPLAZAR_CON_HASH_BCRYPT'
-- WHERE NOT EXISTS (SELECT 1 FROM app.waiters WHERE code = 'MESERO01');
-- GO

-- ========================================================
-- Fin del script maestro
-- ========================================================
-- ========================================================
-- Tablas de facturación (invoices & invoice_payments)
-- Propósito: Persistir facturas y desglose de formas de pago múltiples
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.invoices') AND type = 'U')
BEGIN
    CREATE TABLE app.invoices (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        invoice_number NVARCHAR(40) NOT NULL UNIQUE,
        table_code NVARCHAR(40) NULL,
        waiter_code NVARCHAR(50) NULL,
        subtotal DECIMAL(18,2) NOT NULL DEFAULT(0),
        service_charge DECIMAL(18,2) NOT NULL DEFAULT(0),
        vat_amount DECIMAL(18,2) NOT NULL DEFAULT(0),
        vat_rate DECIMAL(9,4) NOT NULL DEFAULT(0),
        total_amount DECIMAL(18,2) NOT NULL DEFAULT(0),
        currency_code NVARCHAR(3) NOT NULL DEFAULT('MXN'),
        notes NVARCHAR(300) NULL,
        created_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME())
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.invoice_payments') AND type = 'U')
BEGIN
    CREATE TABLE app.invoice_payments (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        invoice_id BIGINT NOT NULL,
        payment_method NVARCHAR(30) NOT NULL, -- CASH | CARD | TRANSFER | OTHER
        amount DECIMAL(18,2) NOT NULL CHECK (amount >= 0),
        reference NVARCHAR(80) NULL, -- últimos dígitos tarjeta, folio, etc.
        created_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_invoice_payments_invoice_id FOREIGN KEY (invoice_id) REFERENCES app.invoices(id) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_invoice_payments_invoice_id' AND object_id = OBJECT_ID('app.invoice_payments'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_invoice_payments_invoice_id ON app.invoice_payments(invoice_id) INCLUDE (payment_method, amount);
END;
GO

-- Trigger para recalcular total_amount en invoices si se quisiera actualizar posteriormente (placeholder)
-- Se omite lógica compleja para mantener idempotencia simple; futuros cambios pueden añadir mantenimiento de totales.

-- ========================================================
-- Extensiones de facturación: columnas de cliente e items
-- Propósito: Guardar nombre fiscal/cliente y desglose de líneas de factura
-- ========================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE Name = N'customer_name' AND Object_ID = Object_ID(N'app.invoices')
)
BEGIN
    ALTER TABLE app.invoices ADD customer_name NVARCHAR(150) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE Name = N'customer_tax_id' AND Object_ID = Object_ID(N'app.invoices')
)
BEGIN
    ALTER TABLE app.invoices ADD customer_tax_id NVARCHAR(40) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.invoice_items') AND type = 'U')
BEGIN
    CREATE TABLE app.invoice_items (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        invoice_id BIGINT NOT NULL,
        line_number INT NOT NULL,
        description NVARCHAR(200) NOT NULL,
        quantity DECIMAL(18,4) NOT NULL CHECK (quantity > 0),
        unit_price DECIMAL(18,6) NOT NULL CHECK (unit_price >= 0),
        line_total DECIMAL(18,2) NOT NULL CHECK (line_total >= 0),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_invoice_items_invoice_id FOREIGN KEY (invoice_id) REFERENCES app.invoices(id) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_invoice_items_invoice_id' AND object_id = OBJECT_ID('app.invoice_items'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_invoice_items_invoice_id ON app.invoice_items(invoice_id) INCLUDE (line_number, line_total);
END;
GO

-- ========================================================
-- Catálogo de artículos: Clasificaciones jerárquicas (1 a 6 niveles)
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.article_classifications') AND type = 'U')
BEGIN
    CREATE TABLE app.article_classifications (
        id INT IDENTITY(1,1) PRIMARY KEY,
        level TINYINT NOT NULL CHECK (level BETWEEN 1 AND 6),
        code NVARCHAR(8) NOT NULL,               -- segmento del nivel actual, ej. '01'
        full_code NVARCHAR(24) NOT NULL,         -- concatenación jerárquica, ej. '01' '0101' ...
        name NVARCHAR(120) NOT NULL,
        parent_full_code NVARCHAR(24) NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NULL
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_article_classifications_full_code' AND object_id = OBJECT_ID('app.article_classifications'))
BEGIN
    CREATE UNIQUE INDEX UQ_article_classifications_full_code ON app.article_classifications(full_code);
END;
GO

IF OBJECT_ID('app.tr_article_classifications_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_article_classifications_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_article_classifications_update_timestamp
ON app.article_classifications
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c
    SET updated_at = SYSUTCDATETIME()
    FROM app.article_classifications c
        INNER JOIN inserted i ON c.id = i.id;
END;
GO

-- ========================================================
-- Tabla: app.articles
-- Propósito: Artículos con doble unidad y factor de conversión
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.articles') AND type = 'U')
BEGIN
    CREATE TABLE app.articles (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        article_code NVARCHAR(40) NOT NULL UNIQUE,
        name NVARCHAR(200) NOT NULL,
        classification_full_code NVARCHAR(24) NULL,
        storage_unit NVARCHAR(20) NOT NULL,      -- Caja, Bolsa, Saco, etc. (deprecado: usar *_unit_id)
        retail_unit NVARCHAR(20) NOT NULL,       -- UND, LB, Botella, etc. (deprecado: usar *_unit_id)
        conversion_factor DECIMAL(18,6) NOT NULL CHECK (conversion_factor > 0), -- cuántas unidades detalle equivalen a 1 unidad de almacén
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NULL
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_articles_classification' AND object_id = OBJECT_ID('app.articles'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_articles_classification ON app.articles (classification_full_code) INCLUDE (name);
END;
GO

-- Columnas de clasificación multinivel (3 niveles)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'classification_level1_id' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD classification_level1_id INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'classification_level2_id' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD classification_level2_id INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'classification_level3_id' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD classification_level3_id INT NULL;
END;
GO

-- FKs a app.article_classifications por nivel
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_articles_class_lvl1' AND parent_object_id = OBJECT_ID('app.articles'))
BEGIN
    ALTER TABLE app.articles ADD CONSTRAINT FK_articles_class_lvl1 FOREIGN KEY (classification_level1_id)
        REFERENCES app.article_classifications(id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_articles_class_lvl2' AND parent_object_id = OBJECT_ID('app.articles'))
BEGIN
    ALTER TABLE app.articles ADD CONSTRAINT FK_articles_class_lvl2 FOREIGN KEY (classification_level2_id)
        REFERENCES app.article_classifications(id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_articles_class_lvl3' AND parent_object_id = OBJECT_ID('app.articles'))
BEGIN
    ALTER TABLE app.articles ADD CONSTRAINT FK_articles_class_lvl3 FOREIGN KEY (classification_level3_id)
        REFERENCES app.article_classifications(id);
END;
GO

-- ========================================================
-- NUEVO: Tabla de unidades de medida
-- Propósito: Definir unidades y referenciarlas desde artículos
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.units') AND type = 'U')
BEGIN
    CREATE TABLE app.units (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(20) NOT NULL UNIQUE,
        name NVARCHAR(60) NOT NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME())
    );
END;
GO

-- Columnas nuevas en artículos para referenciar unidades y tipo
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'storage_unit_id' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD storage_unit_id INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'retail_unit_id' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD retail_unit_id INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'article_type' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD article_type NVARCHAR(12) NOT NULL CONSTRAINT DF_articles_article_type DEFAULT('TERMINADO');
END;
GO

-- CHECK constraint para validar valores permitidos del tipo
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_articles_article_type' AND parent_object_id = OBJECT_ID('app.articles')
)
BEGIN
    ALTER TABLE app.articles WITH NOCHECK ADD CONSTRAINT CK_articles_article_type CHECK (article_type IN ('TERMINADO','KIT'));
END;
GO

-- Tabla de bodegas (warehouses) y columna por defecto en artículos
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.warehouses') AND type = 'U')
BEGIN
    CREATE TABLE app.warehouses (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(20) NOT NULL UNIQUE,
        name NVARCHAR(100) NOT NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME())
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'default_warehouse_id' AND Object_ID = Object_ID(N'app.articles'))
BEGIN
    ALTER TABLE app.articles ADD default_warehouse_id INT NULL;
END;
GO

-- FKs (crear solo si no existen)
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_articles_storage_unit_id' AND parent_object_id = OBJECT_ID('app.articles')
)
BEGIN
    ALTER TABLE app.articles ADD CONSTRAINT FK_articles_storage_unit_id FOREIGN KEY (storage_unit_id) REFERENCES app.units(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_articles_retail_unit_id' AND parent_object_id = OBJECT_ID('app.articles')
)
BEGIN
    ALTER TABLE app.articles ADD CONSTRAINT FK_articles_retail_unit_id FOREIGN KEY (retail_unit_id) REFERENCES app.units(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_articles_default_warehouse_id' AND parent_object_id = OBJECT_ID('app.articles')
)
BEGIN
    ALTER TABLE app.articles ADD CONSTRAINT FK_articles_default_warehouse_id FOREIGN KEY (default_warehouse_id) REFERENCES app.warehouses(id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM app.warehouses WHERE code = 'PRINCIPAL')
BEGIN
    INSERT INTO app.warehouses(code, name, is_active) VALUES('PRINCIPAL', 'Almacén principal', 1);
END;
GO

IF NOT EXISTS (SELECT 1 FROM app.warehouses WHERE code = 'COCINA')
BEGIN
    INSERT INTO app.warehouses(code, name, is_active) VALUES('COCINA', 'Cocina', 1);
END;
GO

-- Tabla de alertas de inventario para parametrizar umbrales de insumos
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.inventory_alerts') AND type = 'U')
BEGIN
    CREATE TABLE app.inventory_alerts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(80) NOT NULL,
        description NVARCHAR(200) NULL,
        threshold DECIMAL(18,2) NOT NULL,
        unit_code NVARCHAR(20) NULL,
        notify_channel NVARCHAR(200) NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME())
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_inventory_alerts_active' AND object_id = OBJECT_ID('app.inventory_alerts')
)
BEGIN
    CREATE INDEX IX_inventory_alerts_active ON app.inventory_alerts(is_active, name);
END;
GO

-- Tabla de canales de notificación para envíos automáticos
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.notification_channels') AND type = 'U')
BEGIN
    CREATE TABLE app.notification_channels (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(80) NOT NULL,
        channel_type NVARCHAR(40) NOT NULL,
        target NVARCHAR(200) NOT NULL,
        preferences NVARCHAR(500) NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME())
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_notification_channels_active' AND object_id = OBJECT_ID('app.notification_channels')
)
BEGIN
    CREATE INDEX IX_notification_channels_active ON app.notification_channels(is_active, channel_type);
END;
GO

IF OBJECT_ID('app.tr_articles_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_articles_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_articles_update_timestamp
ON app.articles
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE a
    SET updated_at = SYSUTCDATETIME()
    FROM app.articles a
        INNER JOIN inserted i ON a.id = i.id;
END;
GO

-- ========================================================
-- Listas de precio y precios históricos
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.price_lists') AND type = 'U')
BEGIN
    CREATE TABLE app.price_lists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(30) NOT NULL UNIQUE,
        name NVARCHAR(120) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME())
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.article_prices') AND type = 'U')
BEGIN
    CREATE TABLE app.article_prices (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        article_id BIGINT NOT NULL,
        price_list_id INT NOT NULL,
        price DECIMAL(18,6) NOT NULL CHECK (price >= 0), -- Precio base (unidad detalle). Precios por almacén se derivan por factor.
        start_date DATE NOT NULL,
        end_date DATE NULL,
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_article_prices_article_id FOREIGN KEY (article_id) REFERENCES app.articles(id) ON DELETE CASCADE,
        CONSTRAINT FK_article_prices_price_list_id FOREIGN KEY (price_list_id) REFERENCES app.price_lists(id) ON DELETE CASCADE
    );
END;
GO

-- Migración idempotente: eliminar columna 'unit' si existe y recrear índice acorde
IF EXISTS (
    SELECT 1 FROM sys.columns WHERE Name = N'unit' AND Object_ID = Object_ID(N'app.article_prices')
)
BEGIN
    ALTER TABLE app.article_prices DROP COLUMN unit;
END;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_article_prices_keys' AND object_id = OBJECT_ID('app.article_prices'))
BEGIN
    DROP INDEX IX_article_prices_keys ON app.article_prices;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_article_prices_keys' AND object_id = OBJECT_ID('app.article_prices'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_article_prices_keys ON app.article_prices(article_id, price_list_id, start_date DESC) INCLUDE (price);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.article_price_rules') AND type = 'U')
BEGIN
    CREATE TABLE app.article_price_rules (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        article_id BIGINT NULL,          -- null => aplica a todos en la lista
        price_list_id INT NOT NULL,
        rule_type NVARCHAR(12) NOT NULL, -- 'DISCOUNT' o 'BONUS'
        min_qty DECIMAL(18,4) NOT NULL CHECK (min_qty > 0),
        max_qty DECIMAL(18,4) NULL,
        discount_percent DECIMAL(9,4) NULL, -- para rule_type DISCOUNT
        bonus_qty DECIMAL(18,4) NULL,       -- para rule_type BONUS
        start_date DATE NOT NULL,
        end_date DATE NULL,
        is_active BIT NOT NULL DEFAULT(1),
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_price_rules_article_id FOREIGN KEY (article_id) REFERENCES app.articles(id) ON DELETE CASCADE,
        CONSTRAINT FK_price_rules_price_list_id FOREIGN KEY (price_list_id) REFERENCES app.price_lists(id) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_article_price_rules_keys' AND object_id = OBJECT_ID('app.article_price_rules'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_article_price_rules_keys ON app.article_price_rules(price_list_id, article_id, rule_type, start_date DESC) INCLUDE (min_qty, max_qty, discount_percent, bonus_qty);
END;
GO

-- ========================================================
-- Tabla: app.article_kits (BOM de kits)
-- Propósito: Definir componentes de un artículo tipo KIT
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.article_kits') AND type = 'U')
BEGIN
    CREATE TABLE app.article_kits (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        kit_article_id BIGINT NOT NULL,
        component_article_id BIGINT NOT NULL,
        component_qty_retail DECIMAL(18,6) NOT NULL CHECK (component_qty_retail > 0), -- cantidad en unidad detalle del componente
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_article_kits_kit FOREIGN KEY (kit_article_id) REFERENCES app.articles(id) ON DELETE CASCADE,
        CONSTRAINT FK_article_kits_component FOREIGN KEY (component_article_id) REFERENCES app.articles(id) ON DELETE CASCADE,
        CONSTRAINT UQ_article_kits UNIQUE(kit_article_id, component_article_id)
    );
END;
GO

-- ========================================================
-- Tablas de inventario: transacciones y movimientos
-- Propósito: Registrar ingresos, consumos y ajustes con desglose por componente
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.inventory_transactions') AND type = 'U')
BEGIN
    CREATE TABLE app.inventory_transactions (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        transaction_code NVARCHAR(60) NOT NULL UNIQUE,
        transaction_type NVARCHAR(20) NOT NULL,
        warehouse_id INT NOT NULL,
        reference NVARCHAR(120) NULL,
        counterparty_name NVARCHAR(160) NULL,
        status NVARCHAR(12) NOT NULL DEFAULT('PENDIENTE'),
        notes NVARCHAR(400) NULL,
        occurred_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        authorized_by NVARCHAR(80) NULL,
        created_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        created_by NVARCHAR(80) NULL,
        total_amount DECIMAL(18,2) NULL
    );
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_inventory_transactions_type' AND parent_object_id = OBJECT_ID('app.inventory_transactions')
)
BEGIN
    ALTER TABLE app.inventory_transactions DROP CONSTRAINT CK_inventory_transactions_type;
END;

ALTER TABLE app.inventory_transactions WITH NOCHECK ADD CONSTRAINT CK_inventory_transactions_type CHECK (transaction_type IN ('PURCHASE','CONSUMPTION','ADJUSTMENT','TRANSFER'));
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_inventory_transactions_status' AND parent_object_id = OBJECT_ID('app.inventory_transactions')
)
BEGIN
    ALTER TABLE app.inventory_transactions WITH NOCHECK ADD CONSTRAINT CK_inventory_transactions_status CHECK (status IN ('PENDIENTE','PAGADA','PARCIAL','CONFIRMADO'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_inventory_transactions_warehouse' AND parent_object_id = OBJECT_ID('app.inventory_transactions')
)
BEGIN
    ALTER TABLE app.inventory_transactions ADD CONSTRAINT FK_inventory_transactions_warehouse FOREIGN KEY (warehouse_id) REFERENCES app.warehouses(id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.inventory_transaction_entries') AND type = 'U')
BEGIN
    CREATE TABLE app.inventory_transaction_entries (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        transaction_id BIGINT NOT NULL,
        article_id BIGINT NOT NULL,
        quantity_entered DECIMAL(18,6) NOT NULL,
        entered_unit NVARCHAR(12) NOT NULL,
        direction NVARCHAR(3) NOT NULL,
        unit_conversion_factor DECIMAL(18,6) NULL,
        kit_multiplier DECIMAL(18,6) NULL,
        cost_per_unit DECIMAL(18,6) NULL,
        subtotal DECIMAL(18,2) NULL,
        notes NVARCHAR(300) NULL,
        CONSTRAINT FK_inventory_entries_transaction FOREIGN KEY (transaction_id) REFERENCES app.inventory_transactions(id) ON DELETE CASCADE,
        CONSTRAINT FK_inventory_entries_article FOREIGN KEY (article_id) REFERENCES app.articles(id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_inventory_entries_unit' AND parent_object_id = OBJECT_ID('app.inventory_transaction_entries')
)
BEGIN
    ALTER TABLE app.inventory_transaction_entries WITH NOCHECK ADD CONSTRAINT CK_inventory_entries_unit CHECK (entered_unit IN ('STORAGE','RETAIL'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_inventory_entries_direction' AND parent_object_id = OBJECT_ID('app.inventory_transaction_entries')
)
BEGIN
    ALTER TABLE app.inventory_transaction_entries WITH NOCHECK ADD CONSTRAINT CK_inventory_entries_direction CHECK (direction IN ('IN','OUT'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.inventory_movements') AND type = 'U')
BEGIN
    CREATE TABLE app.inventory_movements (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        transaction_id BIGINT NOT NULL,
        entry_id BIGINT NOT NULL,
        article_id BIGINT NOT NULL,
        direction NVARCHAR(3) NOT NULL,
        quantity_retail DECIMAL(18,6) NOT NULL,
        warehouse_id INT NOT NULL,
        source_kit_article_id BIGINT NULL,
        created_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_inventory_movements_transaction FOREIGN KEY (transaction_id) REFERENCES app.inventory_transactions(id) ON DELETE CASCADE,
        CONSTRAINT FK_inventory_movements_entry FOREIGN KEY (entry_id) REFERENCES app.inventory_transaction_entries(id) ON DELETE CASCADE,
        CONSTRAINT FK_inventory_movements_article FOREIGN KEY (article_id) REFERENCES app.articles(id),
        CONSTRAINT FK_inventory_movements_source_kit FOREIGN KEY (source_kit_article_id) REFERENCES app.articles(id),
        CONSTRAINT FK_inventory_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES app.warehouses(id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_inventory_movements_direction' AND parent_object_id = OBJECT_ID('app.inventory_movements')
)
BEGIN
    ALTER TABLE app.inventory_movements WITH NOCHECK ADD CONSTRAINT CK_inventory_movements_direction CHECK (direction IN ('IN','OUT'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventory_transactions_type' AND object_id = OBJECT_ID('app.inventory_transactions'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_inventory_transactions_type ON app.inventory_transactions(transaction_type, occurred_at DESC);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventory_movements_article' AND object_id = OBJECT_ID('app.inventory_movements'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_inventory_movements_article ON app.inventory_movements(article_id, warehouse_id, created_at DESC);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventory_movements_transaction' AND object_id = OBJECT_ID('app.inventory_movements'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_inventory_movements_transaction ON app.inventory_movements(transaction_id);
END;
GO


-- ========================================================
-- Tabla: app.table_zones
-- Propósito: Catálogo de zonas/ambientes del salón
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.table_zones') AND type = 'U')
BEGIN
    CREATE TABLE app.table_zones (
        id NVARCHAR(40) NOT NULL PRIMARY KEY,
        name NVARCHAR(120) NOT NULL,
        is_active BIT NOT NULL DEFAULT(1),
        sort_order INT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        updated_at DATETIME2 NULL
    );
END;
GO

IF OBJECT_ID('app.tr_table_zones_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_table_zones_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_table_zones_update_timestamp
ON app.table_zones
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE z
    SET updated_at = SYSUTCDATETIME()
    FROM app.table_zones z
        INNER JOIN inserted i ON z.id = i.id;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_table_zones_sort_order' AND object_id = OBJECT_ID('app.table_zones'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_table_zones_sort_order ON app.table_zones(sort_order);
END;
GO

-- ========================================================
-- Tabla: app.tables
-- Propósito: Definición de mesas físicas
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.tables') AND type = 'U')
BEGIN
    CREATE TABLE app.tables (
        id NVARCHAR(40) NOT NULL PRIMARY KEY,
        label NVARCHAR(120) NOT NULL,
        zone_id NVARCHAR(40) NULL,
        capacity INT NULL,
        is_active BIT NOT NULL DEFAULT(1),
        sort_order INT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        updated_at DATETIME2 NULL,
        CONSTRAINT FK_tables_zone FOREIGN KEY(zone_id) REFERENCES app.table_zones(id),
        CONSTRAINT CK_tables_capacity CHECK (capacity IS NULL OR capacity > 0)
    );
END;
GO

IF OBJECT_ID('app.tr_tables_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_tables_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_tables_update_timestamp
ON app.tables
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t
    SET updated_at = SYSUTCDATETIME()
    FROM app.tables t
        INNER JOIN inserted i ON t.id = i.id;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tables_active_order' AND object_id = OBJECT_ID('app.tables'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tables_active_order ON app.tables(is_active, sort_order) INCLUDE(label);
END;
GO

-- ========================================================
-- Tabla: app.table_state
-- Propósito: Estado operativo de cada mesa (mesero, pedidos, estatus)
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.table_state') AND type = 'U')
BEGIN
    CREATE TABLE app.table_state (
        table_id NVARCHAR(40) NOT NULL PRIMARY KEY,
        assigned_waiter_id INT NULL,
        assigned_waiter_name NVARCHAR(150) NULL,
        status NVARCHAR(20) NOT NULL,
        pending_items NVARCHAR(MAX) NOT NULL DEFAULT('[]'),
        sent_items NVARCHAR(MAX) NOT NULL DEFAULT('[]'),
        updated_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_table_state_table FOREIGN KEY(table_id) REFERENCES app.tables(id) ON DELETE CASCADE,
        CONSTRAINT CK_table_state_status CHECK (status IN ('normal','facturado','anulado'))
    );
END;
GO

IF OBJECT_ID('app.tr_table_state_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_table_state_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_table_state_update_timestamp
ON app.table_state
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE ts
    SET updated_at = SYSUTCDATETIME()
    FROM app.table_state ts
        INNER JOIN inserted i ON ts.table_id = i.table_id;
END;
GO

-- ========================================================
-- Tabla: app.table_reservations
-- Propósito: Reservaciones activas por mesa
-- ========================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.table_reservations') AND type = 'U')
BEGIN
    CREATE TABLE app.table_reservations (
        table_id NVARCHAR(40) NOT NULL PRIMARY KEY,
        status NVARCHAR(20) NOT NULL,
        reserved_by NVARCHAR(150) NOT NULL,
        contact_name NVARCHAR(150) NULL,
        contact_phone NVARCHAR(50) NULL,
        party_size INT NULL,
        notes NVARCHAR(MAX) NULL,
        scheduled_for NVARCHAR(50) NULL,
        created_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        updated_at DATETIME2 NOT NULL DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_table_reservations_table FOREIGN KEY(table_id) REFERENCES app.tables(id) ON DELETE CASCADE,
        CONSTRAINT CK_table_reservations_status CHECK (status IN ('holding','seated')),
        CONSTRAINT CK_table_reservations_party CHECK (party_size IS NULL OR party_size > 0)
    );
END;
GO

IF OBJECT_ID('app.tr_table_reservations_update_timestamp', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER app.tr_table_reservations_update_timestamp;
END;
GO

CREATE TRIGGER app.tr_table_reservations_update_timestamp
ON app.table_reservations
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE tr
    SET updated_at = SYSUTCDATETIME()
    FROM app.table_reservations tr
        INNER JOIN inserted i ON tr.table_id = i.table_id;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_table_reservations_status' AND object_id = OBJECT_ID('app.table_reservations'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_table_reservations_status ON app.table_reservations(status, scheduled_for);
END;
GO


