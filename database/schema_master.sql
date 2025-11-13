-- ========================================================
-- Script maestro de base de datos para Facturador (PostgreSQL)
-- Proposito: Mantener la estructura necesaria para autenticacion y operaciones basicas
-- Ejecutar en el contexto de la base de datos configurada en DB_CONNECTION_STRING
-- ========================================================

CREATE SCHEMA IF NOT EXISTS app;

-- ========================================================
-- Funcion utilitaria: actualiza la columna updated_at antes de cada UPDATE
-- ========================================================
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================================
-- Tabla: app.admin_users
-- ========================================================
CREATE TABLE IF NOT EXISTS app.admin_users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_admin_users_touch_updated_at ON app.admin_users;
CREATE TRIGGER trg_admin_users_touch_updated_at
BEFORE UPDATE ON app.admin_users
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ========================================================
-- Tabla: app.waiters
-- ========================================================
CREATE TABLE IF NOT EXISTS app.waiters (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  pin_hash VARCHAR(100) NOT NULL,
  pin_signature CHAR(64) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_waiters_touch_updated_at ON app.waiters;
CREATE TRIGGER trg_waiters_touch_updated_at
BEFORE UPDATE ON app.waiters
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_waiters_is_active
  ON app.waiters (is_active) INCLUDE (code, full_name);

-- ========================================================
-- Tabla: app.login_audit
-- ========================================================
CREATE TABLE IF NOT EXISTS app.login_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login_type VARCHAR(20) NOT NULL,
  identifier VARCHAR(150) NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS ix_login_audit_created_at
  ON app.login_audit (created_at DESC);

-- ========================================================
-- Tabla: app.exchange_rates
-- ========================================================
CREATE TABLE IF NOT EXISTS app.exchange_rates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rate_date DATE NOT NULL,
  rate_value NUMERIC(18,6) NOT NULL CHECK (rate_value > 0),
  base_currency_code VARCHAR(3) NOT NULL,
  quote_currency_code VARCHAR(3) NOT NULL,
  source_name VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exchange_rates UNIQUE (rate_date, base_currency_code, quote_currency_code)
);

DROP TRIGGER IF EXISTS trg_exchange_rates_touch_updated_at ON app.exchange_rates;
CREATE TRIGGER trg_exchange_rates_touch_updated_at
BEFORE UPDATE ON app.exchange_rates
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_exchange_rates_rate_date
  ON app.exchange_rates (rate_date DESC) INCLUDE (rate_value, base_currency_code, quote_currency_code);

-- ========================================================
-- Tabla: app.orders
-- ========================================================
CREATE TABLE IF NOT EXISTS app.orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_code VARCHAR(60) NOT NULL UNIQUE,
  table_id VARCHAR(40) REFERENCES app.tables(id) ON DELETE SET NULL,
  waiter_code VARCHAR(50),
  waiter_name VARCHAR(150),
  guests INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CANCELLED', 'INVOICED')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON app.orders;
CREATE TRIGGER trg_orders_touch_updated_at
BEFORE UPDATE ON app.orders
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_orders_status_opened_at
  ON app.orders (status, opened_at DESC);

-- ========================================================
-- Tabla: app.order_items
-- ========================================================
CREATE TABLE IF NOT EXISTS app.order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  article_code VARCHAR(40) NOT NULL,
  description VARCHAR(200) NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  modifiers JSONB,
  notes VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_order_items_touch_updated_at ON app.order_items;
CREATE TRIGGER trg_order_items_touch_updated_at
BEFORE UPDATE ON app.order_items
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_order_items_order_id
  ON app.order_items (order_id) INCLUDE (article_code, quantity, unit_price);

-- ========================================================
-- Tabla: app.invoices
-- ========================================================
CREATE TABLE IF NOT EXISTS app.invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  table_code VARCHAR(40),
  waiter_code VARCHAR(50),
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origin_order_id BIGINT REFERENCES app.orders(id) ON DELETE SET NULL,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'MXN',
  notes VARCHAR(300),
  customer_name VARCHAR(150),
  customer_tax_id VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_invoices_origin_order
  ON app.invoices (origin_order_id);

-- ========================================================
-- Tabla: app.invoice_payments
-- ========================================================
CREATE TABLE IF NOT EXISTS app.invoice_payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  payment_method VARCHAR(30) NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  reference VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_invoice_payments_invoice_id
  ON app.invoice_payments (invoice_id) INCLUDE (payment_method, amount);

-- ========================================================
-- Tabla: app.invoice_items
-- ========================================================
CREATE TABLE IF NOT EXISTS app.invoice_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description VARCHAR(200) NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(18,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_invoice_items_invoice_id
  ON app.invoice_items (invoice_id) INCLUDE (line_number, line_total);

-- ========================================================
-- Tabla: app.article_classifications
-- ========================================================
CREATE TABLE IF NOT EXISTS app.article_classifications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 6),
  code VARCHAR(8) NOT NULL,
  full_code VARCHAR(24) NOT NULL,
  name VARCHAR(120) NOT NULL,
  parent_full_code VARCHAR(24),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_article_classifications_full_code UNIQUE (full_code)
);

DROP TRIGGER IF EXISTS trg_article_classifications_touch_updated_at ON app.article_classifications;
CREATE TRIGGER trg_article_classifications_touch_updated_at
BEFORE UPDATE ON app.article_classifications
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ========================================================
-- Tabla: app.units
-- ========================================================
CREATE TABLE IF NOT EXISTS app.units (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(60) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- Tabla: app.warehouses
-- ========================================================
CREATE TABLE IF NOT EXISTS app.warehouses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app.warehouses (code, name, is_active)
VALUES
  ('PRINCIPAL', 'Almacen principal', TRUE),
  ('COCINA', 'Cocina', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ========================================================
-- Tabla: app.articles
-- ========================================================
CREATE TABLE IF NOT EXISTS app.articles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  classification_full_code VARCHAR(24),
  classification_level1_id INTEGER,
  classification_level2_id INTEGER,
  classification_level3_id INTEGER,
  storage_unit VARCHAR(20) NOT NULL,
  retail_unit VARCHAR(20) NOT NULL,
  storage_unit_id INTEGER REFERENCES app.units(id),
  retail_unit_id INTEGER REFERENCES app.units(id),
  default_warehouse_id INTEGER REFERENCES app.warehouses(id),
  article_type VARCHAR(12) NOT NULL DEFAULT 'TERMINADO',
  conversion_factor NUMERIC(18,6) NOT NULL CHECK (conversion_factor > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_articles_class_lvl1 FOREIGN KEY (classification_level1_id) REFERENCES app.article_classifications(id),
  CONSTRAINT fk_articles_class_lvl2 FOREIGN KEY (classification_level2_id) REFERENCES app.article_classifications(id),
  CONSTRAINT fk_articles_class_lvl3 FOREIGN KEY (classification_level3_id) REFERENCES app.article_classifications(id),
  CONSTRAINT ck_articles_article_type CHECK (article_type IN ('TERMINADO', 'KIT'))
);

DROP TRIGGER IF EXISTS trg_articles_touch_updated_at ON app.articles;
CREATE TRIGGER trg_articles_touch_updated_at
BEFORE UPDATE ON app.articles
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_articles_classification
  ON app.articles (classification_full_code) INCLUDE (name);

-- ========================================================
-- Tabla: app.inventory_alerts
-- ========================================================
CREATE TABLE IF NOT EXISTS app.inventory_alerts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200),
  threshold NUMERIC(18,2) NOT NULL,
  unit_code VARCHAR(20),
  notify_channel VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_inventory_alerts_touch_updated_at ON app.inventory_alerts;
CREATE TRIGGER trg_inventory_alerts_touch_updated_at
BEFORE UPDATE ON app.inventory_alerts
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_inventory_alerts_active
  ON app.inventory_alerts (is_active, name);

-- ========================================================
-- Tabla: app.notification_channels
-- ========================================================
CREATE TABLE IF NOT EXISTS app.notification_channels (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  channel_type VARCHAR(40) NOT NULL,
  target VARCHAR(200) NOT NULL,
  preferences VARCHAR(500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_notification_channels_touch_updated_at ON app.notification_channels;
CREATE TRIGGER trg_notification_channels_touch_updated_at
BEFORE UPDATE ON app.notification_channels
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_notification_channels_active
  ON app.notification_channels (is_active, channel_type);

-- ========================================================
-- Tabla: app.price_lists
-- ========================================================
CREATE TABLE IF NOT EXISTS app.price_lists (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- Tabla: app.article_prices
-- ========================================================
CREATE TABLE IF NOT EXISTS app.article_prices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES app.articles(id) ON DELETE CASCADE,
  price_list_id INTEGER NOT NULL REFERENCES app.price_lists(id) ON DELETE CASCADE,
  price NUMERIC(18,6) NOT NULL CHECK (price >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_article_prices_keys
  ON app.article_prices (article_id, price_list_id, start_date DESC) INCLUDE (price);

-- ========================================================
-- Tabla: app.article_price_rules
-- ========================================================
CREATE TABLE IF NOT EXISTS app.article_price_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id BIGINT REFERENCES app.articles(id) ON DELETE CASCADE,
  price_list_id INTEGER NOT NULL REFERENCES app.price_lists(id) ON DELETE CASCADE,
  rule_type VARCHAR(12) NOT NULL CHECK (rule_type IN ('DISCOUNT', 'BONUS')),
  min_qty NUMERIC(18,4) NOT NULL CHECK (min_qty > 0),
  max_qty NUMERIC(18,4),
  discount_percent NUMERIC(9,4),
  bonus_qty NUMERIC(18,4),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_article_price_rules_keys
  ON app.article_price_rules (price_list_id, article_id, rule_type, start_date DESC)
  INCLUDE (min_qty, max_qty, discount_percent, bonus_qty);

-- ========================================================
-- Tabla: app.article_kits
-- ========================================================
CREATE TABLE IF NOT EXISTS app.article_kits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kit_article_id BIGINT NOT NULL REFERENCES app.articles(id) ON DELETE CASCADE,
  component_article_id BIGINT NOT NULL REFERENCES app.articles(id) ON DELETE CASCADE,
  component_qty_retail NUMERIC(18,6) NOT NULL CHECK (component_qty_retail > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_article_kits UNIQUE (kit_article_id, component_article_id)
);

-- ========================================================
-- Tabla: app.inventory_transactions
-- ========================================================
CREATE TABLE IF NOT EXISTS app.inventory_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_code VARCHAR(60) NOT NULL UNIQUE,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'TRANSFER')),
  warehouse_id INTEGER NOT NULL REFERENCES app.warehouses(id),
  reference VARCHAR(120),
  counterparty_name VARCHAR(160),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'PAGADA', 'PARCIAL', 'CONFIRMADO')),
  notes VARCHAR(400),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorized_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(80),
  total_amount NUMERIC(18,2)
);

CREATE INDEX IF NOT EXISTS ix_inventory_transactions_type
  ON app.inventory_transactions (transaction_type, occurred_at DESC);

-- ========================================================
-- Tabla: app.inventory_transaction_entries
-- ========================================================
CREATE TABLE IF NOT EXISTS app.inventory_transaction_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES app.inventory_transactions(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES app.articles(id),
  quantity_entered NUMERIC(18,6) NOT NULL,
  entered_unit VARCHAR(12) NOT NULL CHECK (entered_unit IN ('STORAGE', 'RETAIL')),
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  unit_conversion_factor NUMERIC(18,6),
  kit_multiplier NUMERIC(18,6),
  cost_per_unit NUMERIC(18,6),
  subtotal NUMERIC(18,2),
  notes VARCHAR(300)
);

-- ========================================================
-- Tabla: app.inventory_movements
-- ========================================================
CREATE TABLE IF NOT EXISTS app.inventory_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES app.inventory_transactions(id) ON DELETE CASCADE,
  entry_id BIGINT NOT NULL REFERENCES app.inventory_transaction_entries(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES app.articles(id),
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  quantity_retail NUMERIC(18,6) NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES app.warehouses(id),
  source_kit_article_id BIGINT REFERENCES app.articles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_inventory_movements_article
  ON app.inventory_movements (article_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_inventory_movements_transaction
  ON app.inventory_movements (transaction_id);

-- ========================================================
-- Tabla: app.table_zones
-- ========================================================
CREATE TABLE IF NOT EXISTS app.table_zones (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_table_zones_touch_updated_at ON app.table_zones;
CREATE TRIGGER trg_table_zones_touch_updated_at
BEFORE UPDATE ON app.table_zones
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_table_zones_sort_order
  ON app.table_zones (sort_order);

-- ========================================================
-- Tabla: app.tables
-- ========================================================
CREATE TABLE IF NOT EXISTS app.tables (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  zone_id VARCHAR(40) REFERENCES app.table_zones(id),
  capacity INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_tables_capacity CHECK (capacity IS NULL OR capacity > 0)
);

DROP TRIGGER IF EXISTS trg_tables_touch_updated_at ON app.tables;
CREATE TRIGGER trg_tables_touch_updated_at
BEFORE UPDATE ON app.tables
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_tables_active_order
  ON app.tables (is_active, sort_order) INCLUDE (label);

-- ========================================================
-- Tabla: app.table_state
-- ========================================================
CREATE TABLE IF NOT EXISTS app.table_state (
  table_id VARCHAR(40) NOT NULL PRIMARY KEY REFERENCES app.tables(id) ON DELETE CASCADE,
  assigned_waiter_id INTEGER,
  assigned_waiter_name VARCHAR(150),
  status VARCHAR(20) NOT NULL CHECK (status IN ('normal', 'facturado', 'anulado')),
  pending_items TEXT NOT NULL DEFAULT '[]',
  sent_items TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_table_state_touch_updated_at ON app.table_state;
CREATE TRIGGER trg_table_state_touch_updated_at
BEFORE UPDATE ON app.table_state
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ========================================================
-- Tabla: app.table_reservations
-- ========================================================
CREATE TABLE IF NOT EXISTS app.table_reservations (
  table_id VARCHAR(40) NOT NULL PRIMARY KEY REFERENCES app.tables(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('holding', 'seated')),
  reserved_by VARCHAR(150) NOT NULL,
  contact_name VARCHAR(150),
  contact_phone VARCHAR(50),
  party_size INTEGER,
  notes TEXT,
  scheduled_for VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_table_reservations_party CHECK (party_size IS NULL OR party_size > 0)
);

DROP TRIGGER IF EXISTS trg_table_reservations_touch_updated_at ON app.table_reservations;
CREATE TRIGGER trg_table_reservations_touch_updated_at
BEFORE UPDATE ON app.table_reservations
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_table_reservations_status
  ON app.table_reservations (status, scheduled_for);

-- ========================================================
-- Fin del script maestro
-- ========================================================
