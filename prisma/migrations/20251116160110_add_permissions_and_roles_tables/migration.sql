-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateTable
CREATE TABLE "app"."admin_user_roles" (
    "id" BIGSERIAL NOT NULL,
    "admin_user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."admin_users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."article_classifications" (
    "id" SERIAL NOT NULL,
    "level" SMALLINT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "full_code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "parent_full_code" VARCHAR(24),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."article_kits" (
    "id" BIGSERIAL NOT NULL,
    "kit_article_id" BIGINT NOT NULL,
    "component_article_id" BIGINT NOT NULL,
    "component_qty_retail" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."article_price_rules" (
    "id" BIGSERIAL NOT NULL,
    "article_id" BIGINT,
    "price_list_id" INTEGER NOT NULL,
    "rule_type" VARCHAR(12) NOT NULL,
    "min_qty" DECIMAL(18,4) NOT NULL,
    "max_qty" DECIMAL(18,4),
    "discount_percent" DECIMAL(9,4),
    "bonus_qty" DECIMAL(18,4),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."article_prices" (
    "id" BIGSERIAL NOT NULL,
    "article_id" BIGINT NOT NULL,
    "price_list_id" INTEGER NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."article_warehouses" (
    "id" BIGSERIAL NOT NULL,
    "article_id" BIGINT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."articles" (
    "id" BIGSERIAL NOT NULL,
    "article_code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "classification_full_code" VARCHAR(24),
    "classification_level1_id" INTEGER,
    "classification_level2_id" INTEGER,
    "classification_level3_id" INTEGER,
    "storage_unit" VARCHAR(20) NOT NULL,
    "retail_unit" VARCHAR(20) NOT NULL,
    "storage_unit_id" INTEGER,
    "retail_unit_id" INTEGER,
    "default_warehouse_id" INTEGER,
    "article_type" VARCHAR(12) NOT NULL DEFAULT 'TERMINADO',
    "conversion_factor" DECIMAL(18,6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."cash_register_session_payments" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "payment_method" VARCHAR(40) NOT NULL,
    "expected_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reported_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "difference_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_session_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."cash_register_sessions" (
    "id" BIGSERIAL NOT NULL,
    "cash_register_id" INTEGER NOT NULL,
    "admin_user_id" INTEGER NOT NULL,
    "opening_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "opening_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_notes" VARCHAR(400),
    "closing_amount" DECIMAL(18,2),
    "closing_at" TIMESTAMPTZ(6),
    "closing_notes" VARCHAR(400),
    "status" VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    "closing_user_id" INTEGER,
    "totals_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."cash_register_users" (
    "id" BIGSERIAL NOT NULL,
    "cash_register_id" INTEGER NOT NULL,
    "admin_user_id" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."cash_registers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "allow_manual_warehouse_override" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(250),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."exchange_rates" (
    "id" SERIAL NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate_value" DECIMAL(18,6) NOT NULL,
    "base_currency_code" VARCHAR(3) NOT NULL,
    "quote_currency_code" VARCHAR(3) NOT NULL,
    "source_name" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."inventory_alerts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),
    "threshold" DECIMAL(18,2) NOT NULL,
    "unit_code" VARCHAR(20),
    "notify_channel" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."inventory_movements" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "entry_id" BIGINT NOT NULL,
    "article_id" BIGINT NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "quantity_retail" DECIMAL(18,6) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "source_kit_article_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."inventory_transaction_entries" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "article_id" BIGINT NOT NULL,
    "quantity_entered" DECIMAL(18,6) NOT NULL,
    "entered_unit" VARCHAR(12) NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "unit_conversion_factor" DECIMAL(18,6),
    "kit_multiplier" DECIMAL(18,6),
    "cost_per_unit" DECIMAL(18,6),
    "subtotal" DECIMAL(18,2),
    "notes" VARCHAR(300),

    CONSTRAINT "inventory_transaction_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."inventory_transactions" (
    "id" BIGSERIAL NOT NULL,
    "transaction_code" VARCHAR(60) NOT NULL,
    "transaction_type" VARCHAR(20) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "reference" VARCHAR(120),
    "counterparty_name" VARCHAR(160),
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
    "notes" VARCHAR(400),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_by" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(80),
    "total_amount" DECIMAL(18,2),

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."login_audit" (
    "id" BIGSERIAL NOT NULL,
    "login_type" VARCHAR(20) NOT NULL,
    "identifier" VARCHAR(150) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(300),

    CONSTRAINT "login_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notification_channels" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "channel_type" VARCHAR(40) NOT NULL,
    "target" VARCHAR(200) NOT NULL,
    "preferences" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."order_items" (
    "id" BIGSERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "article_code" VARCHAR(40) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,6) NOT NULL,
    "modifiers" JSONB,
    "notes" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."orders" (
    "id" BIGSERIAL NOT NULL,
    "order_code" VARCHAR(60) NOT NULL,
    "table_id" VARCHAR(40),
    "waiter_code" VARCHAR(50),
    "waiter_name" VARCHAR(150),
    "guests" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."price_lists" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(200),
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'NIO',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."permissions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(250),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "app"."roles" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(250),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."table_reservations" (
    "table_id" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "reserved_by" VARCHAR(150) NOT NULL,
    "contact_name" VARCHAR(150),
    "contact_phone" VARCHAR(50),
    "party_size" INTEGER,
    "notes" TEXT,
    "scheduled_for" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_reservations_pkey" PRIMARY KEY ("table_id")
);

-- CreateTable
CREATE TABLE "app"."table_state" (
    "table_id" VARCHAR(40) NOT NULL,
    "assigned_waiter_id" INTEGER,
    "assigned_waiter_name" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL,
    "pending_items" TEXT NOT NULL DEFAULT '[]',
    "sent_items" TEXT NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_state_pkey" PRIMARY KEY ("table_id")
);

-- CreateTable
CREATE TABLE "app"."table_zones" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tables" (
    "id" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "zone_id" VARCHAR(40),
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."units" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."waiters" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "pin_hash" VARCHAR(100) NOT NULL,
    "pin_signature" CHAR(64) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waiters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."warehouse_stock" (
    "id" BIGSERIAL NOT NULL,
    "article_id" BIGINT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "quantity_retail" DECIMAL(30,6) NOT NULL DEFAULT 0,
    "quantity_storage" DECIMAL(30,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."warehouses" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_admin_user_roles_admin" ON "app"."admin_user_roles"("admin_user_id", "is_primary" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_roles_admin_user_id_role_id_key" ON "app"."admin_user_roles"("admin_user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "app"."admin_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_classifications_full_code" ON "app"."article_classifications"("full_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_kits" ON "app"."article_kits"("kit_article_id", "component_article_id");

-- CreateIndex
CREATE INDEX "ix_article_price_rules_keys" ON "app"."article_price_rules"("price_list_id", "article_id", "rule_type", "start_date" DESC, "min_qty", "max_qty", "discount_percent", "bonus_qty");

-- CreateIndex
CREATE INDEX "ix_article_prices_keys" ON "app"."article_prices"("article_id", "price_list_id", "start_date" DESC, "price");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_prices_article_list" ON "app"."article_prices"("article_id", "price_list_id");

-- CreateIndex
CREATE INDEX "ix_article_warehouses_lookup" ON "app"."article_warehouses"("warehouse_id", "article_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_warehouses_article_id_warehouse_id_key" ON "app"."article_warehouses"("article_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_article_code_key" ON "app"."articles"("article_code");

-- CreateIndex
CREATE INDEX "ix_articles_classification" ON "app"."articles"("classification_full_code", "name");

-- CreateIndex
CREATE INDEX "ix_cash_register_session_payments_session" ON "app"."cash_register_session_payments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_session_payments_session_id_payment_method_key" ON "app"."cash_register_session_payments"("session_id", "payment_method");

-- CreateIndex
CREATE INDEX "ix_cash_register_sessions_register" ON "app"."cash_register_sessions"("cash_register_id", "status");

-- CreateIndex
CREATE INDEX "ix_cash_register_users_admin" ON "app"."cash_register_users"("admin_user_id", "is_default" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_users_cash_register_id_admin_user_id_key" ON "app"."cash_register_users"("cash_register_id", "admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_code_key" ON "app"."cash_registers"("code");

-- CreateIndex
CREATE INDEX "ix_cash_registers_active" ON "app"."cash_registers"("is_active", "code", "warehouse_id");

-- CreateIndex
CREATE INDEX "ix_exchange_rates_rate_date" ON "app"."exchange_rates"("rate_date" DESC, "rate_value", "base_currency_code", "quote_currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_exchange_rates" ON "app"."exchange_rates"("rate_date", "base_currency_code", "quote_currency_code");

-- CreateIndex
CREATE INDEX "ix_inventory_alerts_active" ON "app"."inventory_alerts"("is_active", "name");

-- CreateIndex
CREATE INDEX "ix_inventory_movements_article" ON "app"."inventory_movements"("article_id", "warehouse_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_inventory_movements_transaction" ON "app"."inventory_movements"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_transaction_code_key" ON "app"."inventory_transactions"("transaction_code");

-- CreateIndex
CREATE INDEX "ix_inventory_transactions_type" ON "app"."inventory_transactions"("transaction_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "ix_login_audit_created_at" ON "app"."login_audit"("created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_notification_channels_active" ON "app"."notification_channels"("is_active", "channel_type");

-- CreateIndex
CREATE INDEX "ix_order_items_order_id" ON "app"."order_items"("order_id", "article_code", "quantity", "unit_price");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "app"."orders"("order_code");

-- CreateIndex
CREATE INDEX "ix_orders_status_opened_at" ON "app"."orders"("status", "opened_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_code_key" ON "app"."price_lists"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "app"."permissions"("code");

-- CreateIndex
CREATE INDEX "ix_role_permissions_permission" ON "app"."role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "app"."role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "app"."roles"("code");

-- CreateIndex
CREATE INDEX "ix_table_reservations_status" ON "app"."table_reservations"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "ix_table_zones_sort_order" ON "app"."table_zones"("sort_order");

-- CreateIndex
CREATE INDEX "ix_tables_active_order" ON "app"."tables"("is_active", "sort_order", "label");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "app"."units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "waiters_code_key" ON "app"."waiters"("code");

-- CreateIndex
CREATE INDEX "ix_waiters_is_active" ON "app"."waiters"("is_active", "code", "full_name");

-- CreateIndex
CREATE INDEX "ix_warehouse_stock_wh" ON "app"."warehouse_stock"("warehouse_id", "article_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_stock_article_id_warehouse_id_key" ON "app"."warehouse_stock"("article_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "app"."warehouses"("code");

-- AddForeignKey
ALTER TABLE "app"."admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "app"."admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_kits" ADD CONSTRAINT "article_kits_component_article_id_fkey" FOREIGN KEY ("component_article_id") REFERENCES "app"."articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_kits" ADD CONSTRAINT "article_kits_kit_article_id_fkey" FOREIGN KEY ("kit_article_id") REFERENCES "app"."articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_price_rules" ADD CONSTRAINT "article_price_rules_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_price_rules" ADD CONSTRAINT "article_price_rules_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "app"."price_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_prices" ADD CONSTRAINT "article_prices_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_prices" ADD CONSTRAINT "article_prices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "app"."price_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_warehouses" ADD CONSTRAINT "article_warehouses_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."article_warehouses" ADD CONSTRAINT "article_warehouses_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_default_warehouse_id_fkey" FOREIGN KEY ("default_warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_retail_unit_id_fkey" FOREIGN KEY ("retail_unit_id") REFERENCES "app"."units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_storage_unit_id_fkey" FOREIGN KEY ("storage_unit_id") REFERENCES "app"."units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."articles" ADD CONSTRAINT "fk_articles_class_lvl1" FOREIGN KEY ("classification_level1_id") REFERENCES "app"."article_classifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."articles" ADD CONSTRAINT "fk_articles_class_lvl2" FOREIGN KEY ("classification_level2_id") REFERENCES "app"."article_classifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."articles" ADD CONSTRAINT "fk_articles_class_lvl3" FOREIGN KEY ("classification_level3_id") REFERENCES "app"."article_classifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_register_session_payments" ADD CONSTRAINT "cash_register_session_payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app"."cash_register_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "app"."admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "app"."cash_registers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_closing_user_id_fkey" FOREIGN KEY ("closing_user_id") REFERENCES "app"."admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_register_users" ADD CONSTRAINT "cash_register_users_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "app"."admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_register_users" ADD CONSTRAINT "cash_register_users_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "app"."cash_registers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."cash_registers" ADD CONSTRAINT "cash_registers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "app"."inventory_transaction_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_source_kit_article_id_fkey" FOREIGN KEY ("source_kit_article_id") REFERENCES "app"."articles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."inventory_transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_transaction_entries" ADD CONSTRAINT "inventory_transaction_entries_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_transaction_entries" ADD CONSTRAINT "inventory_transaction_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."inventory_transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."tables"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "app"."permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."table_reservations" ADD CONSTRAINT "table_reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."tables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."table_state" ADD CONSTRAINT "table_state_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."tables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."tables" ADD CONSTRAINT "tables_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "app"."table_zones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."warehouse_stock" ADD CONSTRAINT "warehouse_stock_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
