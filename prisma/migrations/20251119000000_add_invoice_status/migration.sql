-- Add status and cancelled_at columns to app.invoices
ALTER TABLE "app"."invoices"
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(12) NOT NULL DEFAULT 'FACTURADA',
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ NULL;

-- Backfill existing rows to FACTURADA where null (safety if existing data existed)
UPDATE "app"."invoices" SET "status" = 'FACTURADA' WHERE "status" IS NULL;
