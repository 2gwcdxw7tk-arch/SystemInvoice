-- Active: 1763061241801@@127.0.0.1@5432@facturador
-- ========================================================
-- Script maestro de base de datos para Facturador (PostgreSQL)
-- Proposito: Mantener la estructura necesaria para autenticacion y operaciones basicas
-- Ejecutar en el contexto de la base de datos configurada en DB_CONNECTION_STRING
-- ========================================================

DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    RAISE EXCEPTION 'Este script debe ejecutarse en la base Facturador. Conexión actual: %', current_database();
  END IF;
END;
$$;

-- ========================================================
-- Paso 0: Crear la base de datos (ejecutar conectado a postgres)
-- Ajusta el nombre si lo deseas. Si la base ya existe puedes omitir esta instruccion.
-- ========================================================
-- CREATE DATABASE facturador
--   WITH ENCODING 'UTF8'
--   TEMPLATE template1;

-- Tras crearla, cambia la conexion al esquema "facturador" y continua con el resto del script.

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_language
    WHERE lanname = 'plpgsql'
  ) THEN
    RAISE EXCEPTION 'El lenguaje PL/pgSQL no está habilitado en esta base de datos. Ejecute "CREATE EXTENSION plpgsql;" con un usuario con privilegios suficientes y vuelva a correr este script.';
  END IF;
END;
$$;

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
-- Tabla: app.sequence_definitions (máscaras de consecutivos)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.sequence_definitions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  scope VARCHAR(24) NOT NULL,
  prefix VARCHAR(40) NOT NULL DEFAULT '',
  suffix VARCHAR(40) NOT NULL DEFAULT '',
  padding INTEGER NOT NULL DEFAULT 6 CHECK (padding >= 1 AND padding <= 18),
  start_value BIGINT NOT NULL DEFAULT 1 CHECK (start_value >= 0),
  step INTEGER NOT NULL DEFAULT 1 CHECK (step > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_sequence_definitions_touch_updated_at ON app.sequence_definitions;
CREATE TRIGGER trg_sequence_definitions_touch_updated_at
BEFORE UPDATE ON app.sequence_definitions
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ========================================================
-- Tabla: app.sequence_counters (estado por alcance)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.sequence_counters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sequence_definition_id INTEGER NOT NULL REFERENCES app.sequence_definitions(id) ON DELETE CASCADE,
  scope_type VARCHAR(24) NOT NULL DEFAULT 'GLOBAL',
  scope_key VARCHAR(80) NOT NULL DEFAULT '',
  current_value BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sequence_counters_scope UNIQUE (sequence_definition_id, scope_type, scope_key)
);

CREATE INDEX IF NOT EXISTS ix_sequence_counters_updated
  ON app.sequence_counters (sequence_definition_id, updated_at DESC);

-- Asegura que los consecutivos compartidos por varias cajas utilicen el mismo contador global
DO $$
DECLARE
  seq_record RECORD;
BEGIN
  FOR seq_record IN
    SELECT sequence_definition_id, MAX(current_value) AS max_value
    FROM app.sequence_counters
    WHERE scope_type = 'CASH_REGISTER'
    GROUP BY sequence_definition_id
  LOOP
    INSERT INTO app.sequence_counters (
      sequence_definition_id,
      scope_type,
      scope_key,
      current_value,
      updated_at
    )
    VALUES (seq_record.sequence_definition_id, 'GLOBAL', '', seq_record.max_value, NOW())
    ON CONFLICT (sequence_definition_id, scope_type, scope_key)
    DO UPDATE
      SET current_value = GREATEST(app.sequence_counters.current_value, EXCLUDED.current_value),
          updated_at = NOW();
  END LOOP;
END $$;

-- Alinear contadores globales cuando varias transacciones de inventario comparten la misma definición
DO $$
DECLARE
  seq_record RECORD;
BEGIN
  FOR seq_record IN
    SELECT sequence_definition_id, MAX(current_value) AS max_value
    FROM app.sequence_counters
    WHERE scope_type = 'INVENTORY_TYPE'
    GROUP BY sequence_definition_id
  LOOP
    INSERT INTO app.sequence_counters (
      sequence_definition_id,
      scope_type,
      scope_key,
      current_value,
      updated_at
    )
    VALUES (seq_record.sequence_definition_id, 'GLOBAL', '', seq_record.max_value, NOW())
    ON CONFLICT (sequence_definition_id, scope_type, scope_key)
    DO UPDATE
      SET current_value = GREATEST(app.sequence_counters.current_value, EXCLUDED.current_value),
          updated_at = NOW();
  END LOOP;
END $$;

-- ========================================================
-- Tabla: app.inventory_sequence_settings (asignaciones por tipo)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.inventory_sequence_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_type VARCHAR(24) NOT NULL UNIQUE,
  sequence_definition_id INTEGER NOT NULL REFERENCES app.sequence_definitions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_inventory_sequence_settings_touch_updated_at ON app.inventory_sequence_settings;
CREATE TRIGGER trg_inventory_sequence_settings_touch_updated_at
BEFORE UPDATE ON app.inventory_sequence_settings
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ========================================================
-- Tabla: app.cash_registers (cajas de facturación)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.cash_registers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES app.warehouses(id),
  allow_manual_warehouse_override BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes VARCHAR(250),
  invoice_sequence_definition_id INTEGER REFERENCES app.sequence_definitions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_cash_registers_touch_updated_at ON app.cash_registers;
CREATE TRIGGER trg_cash_registers_touch_updated_at
BEFORE UPDATE ON app.cash_registers
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_cash_registers_active
  ON app.cash_registers (is_active) INCLUDE (code, warehouse_id);

CREATE INDEX IF NOT EXISTS ix_cash_registers_sequence
  ON app.cash_registers (invoice_sequence_definition_id);

-- ========================================================
-- Tabla: app.cash_register_users (asignación de cajas a usuarios admin)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.cash_register_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cash_register_id INTEGER NOT NULL REFERENCES app.cash_registers(id) ON DELETE CASCADE,
  admin_user_id INTEGER NOT NULL REFERENCES app.admin_users(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cash_register_id, admin_user_id)
);

CREATE INDEX IF NOT EXISTS ix_cash_register_users_admin
  ON app.cash_register_users (admin_user_id, is_default DESC);

-- ========================================================
-- Tabla: app.cash_register_sessions (aperturas/cierres de caja)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.cash_register_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cash_register_id INTEGER NOT NULL REFERENCES app.cash_registers(id) ON DELETE RESTRICT,
  admin_user_id INTEGER NOT NULL REFERENCES app.admin_users(id) ON DELETE RESTRICT,
  opening_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  opening_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_notes VARCHAR(400),
  opening_denominations JSONB,
  closing_amount NUMERIC(18,2),
  closing_at TIMESTAMPTZ,
  closing_notes VARCHAR(400),
  closing_denominations JSONB,
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  closing_user_id INTEGER REFERENCES app.admin_users(id) ON DELETE SET NULL,
  totals_snapshot JSONB,
  invoice_sequence_start VARCHAR(60),
  invoice_sequence_end VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_cash_register_sessions_touch_updated_at ON app.cash_register_sessions;
CREATE TRIGGER trg_cash_register_sessions_touch_updated_at
BEFORE UPDATE ON app.cash_register_sessions
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_register_sessions_open_by_register
  ON app.cash_register_sessions (cash_register_id)
  WHERE status = 'OPEN';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_register_sessions_open_by_user
  ON app.cash_register_sessions (admin_user_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS ix_cash_register_sessions_register
  ON app.cash_register_sessions (cash_register_id, status);

-- ========================================================
-- Tabla: app.cash_register_session_payments (resumen por método)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.cash_register_session_payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES app.cash_register_sessions(id) ON DELETE CASCADE,
  payment_method VARCHAR(40) NOT NULL,
  expected_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expected_amount >= 0),
  reported_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, payment_method)
);

CREATE INDEX IF NOT EXISTS ix_cash_register_session_payments_session
  ON app.cash_register_session_payments (session_id);

-- ========================================================
-- Tabla: app.payment_terms
-- ========================================================
CREATE TABLE IF NOT EXISTS app.payment_terms (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(250),
  days SMALLINT NOT NULL,
  grace_days SMALLINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_payment_terms_touch_updated_at ON app.payment_terms;
CREATE TRIGGER trg_payment_terms_touch_updated_at
BEFORE UPDATE ON app.payment_terms
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_payment_terms_active
  ON app.payment_terms (is_active, code);

INSERT INTO app.payment_terms (code, name, days, is_active)
VALUES
  ('CONTADO', 'Contado', 0, TRUE),
  ('PT-15', 'Crédito 15 días', 15, TRUE),
  ('PT-30', 'Crédito 30 días', 30, TRUE),
  ('PT-60', 'Crédito 60 días', 60, TRUE),
  ('PT-90', 'Crédito 90 días', 90, TRUE),
  ('PT-120', 'Crédito 120 días', 120, TRUE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  days = EXCLUDED.days,
  is_active = EXCLUDED.is_active;

-- ========================================================
-- Tabla: app.customers
-- ========================================================
CREATE TABLE IF NOT EXISTS app.customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  trade_name VARCHAR(200),
  tax_id VARCHAR(30),
  email VARCHAR(150),
  phone VARCHAR(50),
  mobile_phone VARCHAR(50),
  billing_address VARCHAR(250),
  city VARCHAR(120),
  state VARCHAR(120),
  country_code VARCHAR(3) DEFAULT 'NI',
  postal_code VARCHAR(20),
  payment_term_id INTEGER REFERENCES app.payment_terms(id) ON DELETE SET NULL,
  credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  credit_used NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit_used >= 0),
  credit_on_hold NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit_on_hold >= 0),
  credit_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  credit_hold_reason VARCHAR(250),
  last_credit_review_at TIMESTAMPTZ,
  next_credit_review_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes VARCHAR(400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
-- Asegura la columna payment_term_id en instalaciones previas
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS payment_term_id INTEGER REFERENCES app.payment_terms(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_customers_touch_updated_at ON app.customers;
CREATE TRIGGER trg_customers_touch_updated_at
BEFORE UPDATE ON app.customers
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_customers_active_status
  ON app.customers (is_active, credit_status, code);

CREATE INDEX IF NOT EXISTS ix_customers_tax_id
  ON app.customers (tax_id);

-- ========================================================
CREATE TABLE IF NOT EXISTS app.invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL,
  table_code VARCHAR(40) REFERENCES app.tables(id) ON DELETE SET NULL,
  waiter_code VARCHAR(50) REFERENCES app.waiters(code) ON DELETE SET NULL,
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origin_order_id BIGINT REFERENCES app.orders(id) ON DELETE SET NULL,
  subtotal NUMERIC(18,2) NOT NULL CHECK (subtotal >= 0),
  service_charge NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  vat_rate NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0),
  total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'NIO',
  notes VARCHAR(400),
  customer_name VARCHAR(160),
  customer_tax_id VARCHAR(30),
  customer_id BIGINT REFERENCES app.customers(id) ON DELETE SET NULL,
  payment_term_id INTEGER REFERENCES app.payment_terms(id) ON DELETE SET NULL,
  due_date DATE,
  issuer_admin_user_id INTEGER REFERENCES app.admin_users(id) ON DELETE SET NULL,
  cash_register_id INTEGER REFERENCES app.cash_registers(id) ON DELETE SET NULL,
  cash_register_session_id BIGINT REFERENCES app.cash_register_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (invoice_number)
);
-- Asegura la columna payment_term_id en instalaciones previas
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS payment_term_id INTEGER REFERENCES app.payment_terms(id) ON DELETE SET NULL;

-- Asegura la columna customer_id en instalaciones previas
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES app.customers(id) ON DELETE SET NULL;

-- Asegura la columna due_date en instalaciones previas
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS due_date DATE;

DROP TRIGGER IF EXISTS trg_invoices_touch_updated_at ON app.invoices;
CREATE TRIGGER trg_invoices_touch_updated_at
BEFORE UPDATE ON app.invoices
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_invoices_created_at
  ON app.invoices (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_invoices_waiter_code
  ON app.invoices (waiter_code) WHERE waiter_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_invoices_cash_session
  ON app.invoices (cash_register_session_id);

CREATE INDEX IF NOT EXISTS ix_invoices_customer
  ON app.invoices (customer_id);

CREATE INDEX IF NOT EXISTS ix_invoices_payment_term
  ON app.invoices (payment_term_id);

-- Cambios: Estado y fecha de anulación en facturas
ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'FACTURADA';

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;

-- ========================================================
-- Tabla: app.invoice_payments (pagos asociados a facturas)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.invoice_payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  payment_method VARCHAR(40) NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  reference VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_invoice_payments_invoice_id
  ON app.invoice_payments (invoice_id);

CREATE INDEX IF NOT EXISTS ix_invoice_payments_method
  ON app.invoice_payments (payment_method);

-- ========================================================
-- Tabla: app.invoice_items (detalle de facturas)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.invoice_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  article_code VARCHAR(40),
  description VARCHAR(200) NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(18,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS ix_invoice_items_invoice
  ON app.invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS ix_invoice_items_article
  ON app.invoice_items (article_code)
  WHERE article_code IS NOT NULL;

-- ========================================================
CREATE TABLE IF NOT EXISTS app.customer_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  payment_term_id INTEGER REFERENCES app.payment_terms(id) ON DELETE SET NULL,
  related_invoice_id BIGINT REFERENCES app.invoices(id) ON DELETE SET NULL,
  document_type VARCHAR(12) NOT NULL,
  document_number VARCHAR(60) NOT NULL,
  document_date DATE NOT NULL,
  due_date DATE,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'NIO',
  original_amount NUMERIC(18,2) NOT NULL CHECK (original_amount >= 0),
  balance_amount NUMERIC(18,2) NOT NULL CHECK (balance_amount >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  reference VARCHAR(120),
  notes VARCHAR(400),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (document_type, document_number)
);
-- Asegura la columna payment_term_id en instalaciones previas
ALTER TABLE app.customer_documents ADD COLUMN IF NOT EXISTS payment_term_id INTEGER REFERENCES app.payment_terms(id) ON DELETE SET NULL;

-- Asegura la columna customer_id en instalaciones previas
ALTER TABLE app.customer_documents ADD COLUMN IF NOT EXISTS customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS trg_customer_documents_touch_updated_at ON app.customer_documents;
CREATE TRIGGER trg_customer_documents_touch_updated_at
BEFORE UPDATE ON app.customer_documents
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_customer_documents_customer_status
  ON app.customer_documents (customer_id, status, document_date DESC);

CREATE INDEX IF NOT EXISTS ix_customer_documents_invoice
  ON app.customer_documents (related_invoice_id);

-- ========================================================
-- Tabla: app.customer_document_applications
-- ========================================================
CREATE TABLE IF NOT EXISTS app.customer_document_applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  applied_document_id BIGINT NOT NULL REFERENCES app.customer_documents(id) ON DELETE CASCADE,
  target_document_id BIGINT NOT NULL REFERENCES app.customer_documents(id) ON DELETE CASCADE,
  application_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reference VARCHAR(120),
  notes VARCHAR(400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_customer_document_applications_applied
  ON app.customer_document_applications (applied_document_id);

CREATE INDEX IF NOT EXISTS ix_customer_document_applications_target
  ON app.customer_document_applications (target_document_id);

-- ========================================================
CREATE TABLE IF NOT EXISTS app.customer_credit_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  approved_limit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (approved_limit >= 0),
  available_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
  blocked_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  reviewer_admin_user_id INTEGER REFERENCES app.admin_users(id) ON DELETE SET NULL,
  review_notes VARCHAR(400),
  reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Asegura la columna customer_id en instalaciones previas
ALTER TABLE app.customer_credit_lines ADD COLUMN IF NOT EXISTS customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS trg_customer_credit_lines_touch_updated_at ON app.customer_credit_lines;
CREATE TRIGGER trg_customer_credit_lines_touch_updated_at
BEFORE UPDATE ON app.customer_credit_lines
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_customer_credit_lines_status
  ON app.customer_credit_lines (customer_id, status);

-- ========================================================
CREATE TABLE IF NOT EXISTS app.collection_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  document_id BIGINT REFERENCES app.customer_documents(id) ON DELETE SET NULL,
  contact_method VARCHAR(40),
  contact_name VARCHAR(160),
  notes VARCHAR(500),
  outcome VARCHAR(120),
  follow_up_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES app.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Asegura la columna customer_id en instalaciones previas
ALTER TABLE app.collection_logs ADD COLUMN IF NOT EXISTS customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_collection_logs_follow_up
  ON app.collection_logs (customer_id, follow_up_at);

-- ========================================================
CREATE TABLE IF NOT EXISTS app.customer_disputes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  document_id BIGINT REFERENCES app.customer_documents(id) ON DELETE SET NULL,
  dispute_code VARCHAR(40),
  description VARCHAR(400),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  resolution_notes VARCHAR(400),
  resolved_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES app.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Asegura la columna customer_id en instalaciones previas
ALTER TABLE app.customer_disputes ADD COLUMN IF NOT EXISTS customer_id BIGINT NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS trg_customer_disputes_touch_updated_at ON app.customer_disputes;
CREATE TRIGGER trg_customer_disputes_touch_updated_at
BEFORE UPDATE ON app.customer_disputes
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS ix_customer_disputes_status
  ON app.customer_disputes (customer_id, status);

-- ========================================================
-- Vista: app.invoice_items_movements (ventas por item)
-- ========================================================
DROP VIEW IF EXISTS app.invoice_items_movements;
CREATE VIEW app.invoice_items_movements AS
SELECT
  ii.id AS item_id,
  COALESCE(ii.quantity, 0) AS quantity,
  ii.line_total AS total_amount,
  i.invoice_date AS created_at
FROM app.invoice_items ii
INNER JOIN app.invoices i ON i.id = ii.invoice_id
WHERE i.status = 'FACTURADA';

-- ========================================================
-- Tabla: app.roles y asignación de permisos
-- ========================================================
CREATE TABLE IF NOT EXISTS app.roles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(250),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_roles_touch_updated_at ON app.roles;
CREATE TRIGGER trg_roles_touch_updated_at
BEFORE UPDATE ON app.roles
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ========================================================
-- Tabla: app.permissions
-- ========================================================
CREATE TABLE IF NOT EXISTS app.permissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(250),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_permissions_touch_updated_at ON app.permissions;
CREATE TRIGGER trg_permissions_touch_updated_at
BEFORE UPDATE ON app.permissions
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE IF NOT EXISTS app.role_permissions (
  role_id INTEGER NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES app.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS ix_role_permissions_permission
  ON app.role_permissions (permission_id);

DO $$
DECLARE
  has_permission_code BOOLEAN;
  fk_exists BOOLEAN;
  uq_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'role_permissions'
      AND column_name = 'permission_code'
  ) INTO has_permission_code;

  IF has_permission_code THEN
    ALTER TABLE app.role_permissions
      ADD COLUMN IF NOT EXISTS permission_id INTEGER;

    INSERT INTO app.permissions (code, name, description)
    SELECT DISTINCT rp.permission_code, rp.permission_code, 'Migrado automáticamente'
    FROM app.role_permissions rp
    LEFT JOIN app.permissions p ON p.code = rp.permission_code
    WHERE p.id IS NULL
      AND rp.permission_code IS NOT NULL;

    UPDATE app.role_permissions rp
    SET permission_id = p.id
    FROM app.permissions p
    WHERE rp.permission_code = p.code
      AND rp.permission_id IS NULL;

    ALTER TABLE app.role_permissions
      DROP COLUMN IF EXISTS permission_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.role_permissions WHERE permission_id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se pudo asignar permission_id a todos los registros de app.role_permissions. Verifica el catálogo de permisos.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'app'
      AND tc.table_name = 'role_permissions'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name = 'role_permissions_permission_id_fkey'
  ) INTO fk_exists;

  IF NOT fk_exists THEN
    ALTER TABLE app.role_permissions
      ADD CONSTRAINT role_permissions_permission_id_fkey
      FOREIGN KEY (permission_id) REFERENCES app.permissions(id) ON DELETE CASCADE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'app'
      AND tc.table_name = 'role_permissions'
      AND tc.constraint_type = 'UNIQUE'
      AND tc.constraint_name = 'role_permissions_role_id_permission_id_key'
  ) INTO uq_exists;

  IF NOT uq_exists THEN
    PERFORM 1
    FROM pg_indexes
    WHERE schemaname = 'app'
      AND tablename = 'role_permissions'
      AND indexname = 'role_permissions_role_id_permission_id_key';

    IF FOUND THEN
      EXECUTE 'ALTER TABLE app.role_permissions ADD CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE USING INDEX role_permissions_role_id_permission_id_key';
    ELSE
      EXECUTE 'ALTER TABLE app.role_permissions ADD CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id)';
    END IF;
  END IF;

  ALTER TABLE app.role_permissions
    ALTER COLUMN permission_id SET NOT NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS app.admin_user_roles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id INTEGER NOT NULL REFERENCES app.admin_users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS ix_admin_user_roles_admin
  ON app.admin_user_roles (admin_user_id, is_primary DESC);

INSERT INTO app.permissions (code, name, description)
VALUES
  ('cash.register.open',      'Apertura de caja',            'Permite abrir sesiones de caja'),
  ('cash.register.close',     'Cierre de caja',              'Autoriza cerrar sesiones de caja'),
  ('invoice.issue',           'Emisión de facturas',         'Permite crear y cancelar facturas'),
  ('cash.report.view',        'Reportes de caja',            'Acceso a reportes y arqueos de caja'),
  ('admin.users.manage',      'Gestión de usuarios',         'Permite administrar usuarios y roles'),
  ('menu.dashboard.view',     'Acceso a Dashboard',          'Permite acceder al panel principal y KPIs'),
  ('menu.facturacion.view',   'Acceso a Facturación',        'Permite abrir la pantalla de facturación'),
  ('menu.caja.view',          'Acceso a Caja',               'Permite acceder al módulo de caja'),
  ('menu.articulos.view',     'Acceso a Artículos',          'Permite acceder al catálogo de artículos'),
  ('menu.inventario.view',    'Acceso a Inventario',         'Permite acceder al módulo de inventario'),
  ('menu.mesas.view',         'Acceso a Mesas',              'Permite acceder al mantenimiento de mesas'),
  ('menu.meseros.view',       'Acceso a Meseros',            'Permite administrar meseros'),
  ('menu.usuarios.view',      'Acceso a Usuarios',           'Permite administrar usuarios administrativos'),
  ('menu.roles.view',         'Acceso a Roles',              'Permite administrar roles y permisos'),
  ('menu.reportes.view',      'Acceso a Reportes',           'Permite acceder a reportes y descargas'),
  ('menu.preferencias.view',  'Acceso a Preferencias',       'Permite acceder a preferencias y configuraciones'),
  ('menu.cxc.view',           'Acceso a Cuentas por Cobrar', 'Permite consultar clientes, documentos y gestiones de cartera'),
  ('customers.manage',        'Gestión de clientes',         'Permite crear y editar clientes del catálogo'),
  ('payment-terms.manage',    'Gestión de condiciones',      'Permite administrar las condiciones de pago disponibles'),
  ('customer.documents.manage','Gestión de documentos CxC',  'Permite crear documentos de cuentas por cobrar y notas asociadas'),
  ('customer.documents.apply','Aplicación de documentos',    'Permite aplicar y revertir pagos, recibos y retenciones'),
  ('customer.credit.manage',  'Gestión de líneas de crédito','Permite asignar y ajustar límites de crédito por cliente'),
  ('customer.collections.manage','Gestión de cobranza',      'Permite registrar seguimientos, promesas y actividades de cobranza'),
  ('customer.disputes.manage','Gestión de disputas',         'Permite registrar y resolver disputas asociadas a documentos')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO app.roles (code, name, description, is_active)
SELECT 'FACTURADOR', 'Facturador POS', 'Puede aperturar y cerrar caja además de emitir facturas en punto de venta', TRUE
WHERE NOT EXISTS (SELECT 1 FROM app.roles WHERE code = 'FACTURADOR');

WITH role_target AS (
  SELECT id FROM app.roles WHERE code = 'FACTURADOR' LIMIT 1
)
INSERT INTO app.role_permissions (role_id, permission_id)
SELECT rt.id, p.id
FROM role_target rt
JOIN app.permissions p ON p.code IN (
  'cash.register.open',
  'cash.register.close',
  'invoice.issue',
  'cash.report.view',
  'menu.dashboard.view',
  'menu.facturacion.view',
  'menu.caja.view',
  'menu.reportes.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO app.roles (code, name, description, is_active)
SELECT 'ADMINISTRADOR', 'Administrador General', 'Acceso completo al mantenimiento y operaciones', TRUE
WHERE NOT EXISTS (SELECT 1 FROM app.roles WHERE code = 'ADMINISTRADOR');

WITH admin_role AS (
  SELECT id FROM app.roles WHERE code = 'ADMINISTRADOR' LIMIT 1
)
INSERT INTO app.role_permissions (role_id, permission_id)
SELECT ar.id, p.id
FROM admin_role ar
JOIN app.permissions p ON p.code IN (
  'cash.register.open',
  'cash.register.close',
  'invoice.issue',
  'cash.report.view',
  'admin.users.manage',
  'menu.dashboard.view',
  'menu.facturacion.view',
  'menu.caja.view',
  'menu.articulos.view',
  'menu.inventario.view',
  'menu.mesas.view',
  'menu.meseros.view',
  'menu.usuarios.view',
  'menu.roles.view',
  'menu.reportes.view',
  'menu.preferencias.view',
  'menu.cxc.view',
  'customers.manage',
  'payment-terms.manage',
  'customer.documents.manage',
  'customer.documents.apply',
  'customer.credit.manage',
  'customer.collections.manage',
  'customer.disputes.manage'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ========================================================
-- Usuario administrador por defecto con clave temporal
-- ========================================================
-- La contraseña temporal es 'AdminTemporal2024!' y debe cambiarse al primer inicio de sesión.
INSERT INTO app.admin_users (username, password_hash, display_name, is_active)
SELECT 'admin', '$2a$10$38Vo//01YxVjdndfF/MfA.Nb5mKzGRV4F.ol5LI6dmriIRGH6QQti', 'Administrador Principal', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM app.admin_users WHERE username = 'admin'
);

WITH admin_user AS (
  SELECT id FROM app.admin_users WHERE username = 'admin' LIMIT 1
),
admin_role AS (
  SELECT id FROM app.roles WHERE code = 'ADMINISTRADOR' LIMIT 1
)
INSERT INTO app.admin_user_roles (admin_user_id, role_id, is_primary)
SELECT au.id, ar.id, TRUE
FROM admin_user au
CROSS JOIN admin_role ar
ON CONFLICT (admin_user_id, role_id) DO UPDATE
SET is_primary = EXCLUDED.is_primary;

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
-- Tabla: app.article_warehouses (asociación artículo-bodega)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.article_warehouses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES app.articles(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES app.warehouses(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (article_id, warehouse_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_warehouses_primary
  ON app.article_warehouses (article_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS ix_article_warehouses_lookup
  ON app.article_warehouses (warehouse_id, article_id);

-- ========================================================
-- Tabla: app.warehouse_stock (existencias consolidadas por bodega)
-- ========================================================
CREATE TABLE IF NOT EXISTS app.warehouse_stock (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES app.articles(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES app.warehouses(id) ON DELETE CASCADE,
  quantity_retail NUMERIC(30,6) NOT NULL DEFAULT 0 CHECK (quantity_retail >= 0),
  quantity_storage NUMERIC(30,6) NOT NULL DEFAULT 0 CHECK (quantity_storage >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (article_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS ix_warehouse_stock_wh
  ON app.warehouse_stock (warehouse_id, article_id);

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

ALTER TABLE app.cash_registers
  ADD COLUMN IF NOT EXISTS default_customer_id BIGINT REFERENCES app.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_cash_registers_default_customer
  ON app.cash_registers (default_customer_id);

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
  description VARCHAR(200),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'NIO',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_price_lists_touch_updated_at ON app.price_lists;
CREATE TRIGGER trg_price_lists_touch_updated_at
BEFORE UPDATE ON app.price_lists
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_lists_default
  ON app.price_lists (is_default)
  WHERE is_default;

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
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_article_prices_keys
  ON app.article_prices (article_id, price_list_id, start_date DESC) INCLUDE (price);

DROP TRIGGER IF EXISTS trg_article_prices_touch_updated_at ON app.article_prices;
CREATE TRIGGER trg_article_prices_touch_updated_at
BEFORE UPDATE ON app.article_prices
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_prices_article_list
  ON app.article_prices (article_id, price_list_id);

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
  total_amount NUMERIC(18,2),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Asegura la columna updated_at en instalaciones previas
ALTER TABLE app.inventory_transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_inventory_transactions_touch_updated_at ON app.inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_touch_updated_at
BEFORE UPDATE ON app.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

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
