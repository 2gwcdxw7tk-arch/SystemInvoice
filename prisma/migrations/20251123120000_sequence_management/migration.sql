-- Create sequence definition catalog
CREATE TABLE "app"."sequence_definitions" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "scope" VARCHAR(24) NOT NULL,
  "prefix" VARCHAR(40) NOT NULL DEFAULT '',
  "suffix" VARCHAR(40) NOT NULL DEFAULT '',
  "padding" INTEGER NOT NULL DEFAULT 6,
  "start_value" BIGINT NOT NULL DEFAULT 1,
  "step" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "sequence_definitions_code_key"
  ON "app"."sequence_definitions" ("code");

CREATE TRIGGER "trg_sequence_definitions_touch_updated_at"
BEFORE UPDATE ON "app"."sequence_definitions"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Create counters per scope
CREATE TABLE "app"."sequence_counters" (
  "id" BIGSERIAL PRIMARY KEY,
  "sequence_definition_id" INTEGER NOT NULL,
  "scope_type" VARCHAR(24) NOT NULL DEFAULT 'GLOBAL',
  "scope_key" VARCHAR(80) NOT NULL DEFAULT '',
  "current_value" BIGINT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sequence_counters_sequence_definition_id_fkey"
    FOREIGN KEY ("sequence_definition_id")
    REFERENCES "app"."sequence_definitions"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "sequence_counters_sequence_definition_id_scope_type_scope_key_key"
    UNIQUE ("sequence_definition_id", "scope_type", "scope_key")
);

CREATE INDEX "ix_sequence_counters_updated"
  ON "app"."sequence_counters" ("sequence_definition_id", "updated_at" DESC);

-- Inventory assignments per transaction type
CREATE TABLE "app"."inventory_sequence_settings" (
  "id" SERIAL PRIMARY KEY,
  "transaction_type" VARCHAR(24) NOT NULL,
  "sequence_definition_id" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "inventory_sequence_settings_transaction_type_key"
  ON "app"."inventory_sequence_settings" ("transaction_type");

ALTER TABLE "app"."inventory_sequence_settings"
  ADD CONSTRAINT "inventory_sequence_settings_sequence_definition_id_fkey"
  FOREIGN KEY ("sequence_definition_id")
  REFERENCES "app"."sequence_definitions"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

CREATE TRIGGER "trg_inventory_sequence_settings_touch_updated_at"
BEFORE UPDATE ON "app"."inventory_sequence_settings"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Cash register link to sequence definitions
ALTER TABLE "app"."cash_registers"
  ADD COLUMN "invoice_sequence_definition_id" INTEGER;

ALTER TABLE "app"."cash_registers"
  ADD CONSTRAINT "cash_registers_invoice_sequence_definition_id_fkey"
  FOREIGN KEY ("invoice_sequence_definition_id")
  REFERENCES "app"."sequence_definitions"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE INDEX "ix_cash_registers_sequence"
  ON "app"."cash_registers" ("invoice_sequence_definition_id");

-- Cash session sequence range tracking
ALTER TABLE "app"."cash_register_sessions"
  ADD COLUMN "invoice_sequence_start" VARCHAR(60);

ALTER TABLE "app"."cash_register_sessions"
  ADD COLUMN "invoice_sequence_end" VARCHAR(60);
