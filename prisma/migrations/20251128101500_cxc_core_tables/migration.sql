-- Payment terms catalog
CREATE TABLE "app"."payment_terms" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(250),
  "days" SMALLINT NOT NULL,
  "grace_days" SMALLINT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "payment_terms_code_key"
  ON "app"."payment_terms" ("code");

CREATE INDEX "ix_payment_terms_active"
  ON "app"."payment_terms" ("is_active", "code");

CREATE TRIGGER "trg_payment_terms_touch_updated_at"
BEFORE UPDATE ON "app"."payment_terms"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

INSERT INTO "app"."payment_terms" ("code", "name", "days", "is_active")
VALUES
  ('CONTADO', 'Contado', 0, TRUE),
  ('PT-15', 'Crédito 15 días', 15, TRUE),
  ('PT-30', 'Crédito 30 días', 30, TRUE),
  ('PT-60', 'Crédito 60 días', 60, TRUE),
  ('PT-90', 'Crédito 90 días', 90, TRUE),
  ('PT-120', 'Crédito 120 días', 120, TRUE)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "days" = EXCLUDED."days",
  "is_active" = EXCLUDED."is_active";

-- Customers master data
CREATE TABLE "app"."customers" (
  "id" BIGSERIAL PRIMARY KEY,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "trade_name" VARCHAR(200),
  "tax_id" VARCHAR(30),
  "email" VARCHAR(150),
  "phone" VARCHAR(50),
  "mobile_phone" VARCHAR(50),
  "billing_address" VARCHAR(250),
  "city" VARCHAR(120),
  "state" VARCHAR(120),
  "country_code" VARCHAR(3) DEFAULT 'NI',
  "postal_code" VARCHAR(20),
  "payment_term_id" INTEGER,
  "credit_limit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "credit_used" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "credit_on_hold" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "credit_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "credit_hold_reason" VARCHAR(250),
  "last_credit_review_at" TIMESTAMPTZ,
  "next_credit_review_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" VARCHAR(400),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_payment_term_id_fkey"
    FOREIGN KEY ("payment_term_id")
    REFERENCES "app"."payment_terms"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "customers_code_key"
  ON "app"."customers" ("code");

CREATE INDEX "ix_customers_active_status"
  ON "app"."customers" ("is_active", "credit_status", "code");

CREATE INDEX "ix_customers_tax_id"
  ON "app"."customers" ("tax_id");

CREATE TRIGGER "trg_customers_touch_updated_at"
BEFORE UPDATE ON "app"."customers"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Link invoices with customers/payment terms
ALTER TABLE "app"."invoices"
  ADD COLUMN "customer_id" BIGINT;

ALTER TABLE "app"."invoices"
  ADD COLUMN "payment_term_id" INTEGER;

ALTER TABLE "app"."invoices"
  ADD COLUMN "due_date" DATE;

ALTER TABLE "app"."invoices"
  ADD CONSTRAINT "invoices_customer_id_fkey"
  FOREIGN KEY ("customer_id")
  REFERENCES "app"."customers"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE "app"."invoices"
  ADD CONSTRAINT "invoices_payment_term_id_fkey"
  FOREIGN KEY ("payment_term_id")
  REFERENCES "app"."payment_terms"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE INDEX "ix_invoices_customer"
  ON "app"."invoices" ("customer_id");

CREATE INDEX "ix_invoices_payment_term"
  ON "app"."invoices" ("payment_term_id");

-- Customer documents (CxC ledger)
CREATE TABLE "app"."customer_documents" (
  "id" BIGSERIAL PRIMARY KEY,
  "customer_id" BIGINT NOT NULL,
  "payment_term_id" INTEGER,
  "related_invoice_id" BIGINT,
  "document_type" VARCHAR(12) NOT NULL,
  "document_number" VARCHAR(60) NOT NULL,
  "document_date" DATE NOT NULL,
  "due_date" DATE,
  "currency_code" VARCHAR(3) NOT NULL DEFAULT 'NIO',
  "original_amount" NUMERIC(18,2) NOT NULL,
  "balance_amount" NUMERIC(18,2) NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  "reference" VARCHAR(120),
  "notes" VARCHAR(400),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_documents_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "app"."customers"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_documents_payment_term_id_fkey"
    FOREIGN KEY ("payment_term_id")
    REFERENCES "app"."payment_terms"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_documents_related_invoice_id_fkey"
    FOREIGN KEY ("related_invoice_id")
    REFERENCES "app"."invoices"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_documents_document_type_document_number_key"
    UNIQUE ("document_type", "document_number")
);

CREATE INDEX "ix_customer_documents_customer_status"
  ON "app"."customer_documents" ("customer_id", "status", "document_date" DESC);

CREATE INDEX "ix_customer_documents_invoice"
  ON "app"."customer_documents" ("related_invoice_id");

CREATE TRIGGER "trg_customer_documents_touch_updated_at"
BEFORE UPDATE ON "app"."customer_documents"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Applications (RET -> ROC order control comes from services)
CREATE TABLE "app"."customer_document_applications" (
  "id" BIGSERIAL PRIMARY KEY,
  "applied_document_id" BIGINT NOT NULL,
  "target_document_id" BIGINT NOT NULL,
  "application_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" NUMERIC(18,2) NOT NULL,
  "reference" VARCHAR(120),
  "notes" VARCHAR(400),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_document_applications_applied_document_id_fkey"
    FOREIGN KEY ("applied_document_id")
    REFERENCES "app"."customer_documents"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_document_applications_target_document_id_fkey"
    FOREIGN KEY ("target_document_id")
    REFERENCES "app"."customer_documents"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE INDEX "ix_customer_document_applications_applied"
  ON "app"."customer_document_applications" ("applied_document_id");

CREATE INDEX "ix_customer_document_applications_target"
  ON "app"."customer_document_applications" ("target_document_id");

-- Credit line tracking
CREATE TABLE "app"."customer_credit_lines" (
  "id" BIGSERIAL PRIMARY KEY,
  "customer_id" BIGINT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "approved_limit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "available_limit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "blocked_amount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "reviewer_admin_user_id" INTEGER,
  "review_notes" VARCHAR(400),
  "reviewed_at" TIMESTAMPTZ,
  "next_review_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_credit_lines_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "app"."customers"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_credit_lines_reviewer_admin_user_id_fkey"
    FOREIGN KEY ("reviewer_admin_user_id")
    REFERENCES "app"."admin_users"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE INDEX "ix_customer_credit_lines_status"
  ON "app"."customer_credit_lines" ("customer_id", "status");

CREATE TRIGGER "trg_customer_credit_lines_touch_updated_at"
BEFORE UPDATE ON "app"."customer_credit_lines"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Collection effort logs
CREATE TABLE "app"."collection_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "customer_id" BIGINT NOT NULL,
  "document_id" BIGINT,
  "contact_method" VARCHAR(40),
  "contact_name" VARCHAR(160),
  "notes" VARCHAR(500),
  "outcome" VARCHAR(120),
  "follow_up_at" TIMESTAMPTZ,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_logs_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "app"."customers"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "collection_logs_document_id_fkey"
    FOREIGN KEY ("document_id")
    REFERENCES "app"."customer_documents"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  CONSTRAINT "collection_logs_created_by_fkey"
    FOREIGN KEY ("created_by")
    REFERENCES "app"."admin_users"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE INDEX "ix_collection_logs_follow_up"
  ON "app"."collection_logs" ("customer_id", "follow_up_at");

-- Customer disputes register
CREATE TABLE "app"."customer_disputes" (
  "id" BIGSERIAL PRIMARY KEY,
  "customer_id" BIGINT NOT NULL,
  "document_id" BIGINT,
  "dispute_code" VARCHAR(40),
  "description" VARCHAR(400),
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "resolution_notes" VARCHAR(400),
  "resolved_at" TIMESTAMPTZ,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_disputes_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "app"."customers"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_disputes_document_id_fkey"
    FOREIGN KEY ("document_id")
    REFERENCES "app"."customer_documents"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  CONSTRAINT "customer_disputes_created_by_fkey"
    FOREIGN KEY ("created_by")
    REFERENCES "app"."admin_users"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE INDEX "ix_customer_disputes_status"
  ON "app"."customer_disputes" ("customer_id", "status");

CREATE TRIGGER "trg_customer_disputes_touch_updated_at"
BEFORE UPDATE ON "app"."customer_disputes"
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
