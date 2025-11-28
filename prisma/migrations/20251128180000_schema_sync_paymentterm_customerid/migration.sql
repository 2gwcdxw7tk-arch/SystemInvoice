-- Migración para asegurar columnas payment_term_id y customer_id en tablas CxC y facturación
-- Idempotente: solo agrega columnas si no existen

ALTER TABLE "app"."customers" ADD COLUMN IF NOT EXISTS "payment_term_id" INTEGER REFERENCES "app"."payment_terms"(id) ON DELETE SET NULL;
ALTER TABLE "app"."invoices" ADD COLUMN IF NOT EXISTS "payment_term_id" INTEGER REFERENCES "app"."payment_terms"(id) ON DELETE SET NULL;
ALTER TABLE "app"."invoices" ADD COLUMN IF NOT EXISTS "customer_id" BIGINT REFERENCES "app"."customers"(id) ON DELETE SET NULL;
ALTER TABLE "app"."customer_documents" ADD COLUMN IF NOT EXISTS "payment_term_id" INTEGER REFERENCES "app"."payment_terms"(id) ON DELETE SET NULL;
ALTER TABLE "app"."customer_documents" ADD COLUMN IF NOT EXISTS "customer_id" BIGINT NOT NULL REFERENCES "app"."customers"(id) ON DELETE CASCADE;
ALTER TABLE "app"."customer_credit_lines" ADD COLUMN IF NOT EXISTS "customer_id" BIGINT NOT NULL REFERENCES "app"."customers"(id) ON DELETE CASCADE;
ALTER TABLE "app"."collection_logs" ADD COLUMN IF NOT EXISTS "customer_id" BIGINT NOT NULL REFERENCES "app"."customers"(id) ON DELETE CASCADE;
ALTER TABLE "app"."customer_disputes" ADD COLUMN IF NOT EXISTS "customer_id" BIGINT NOT NULL REFERENCES "app"."customers"(id) ON DELETE CASCADE;
