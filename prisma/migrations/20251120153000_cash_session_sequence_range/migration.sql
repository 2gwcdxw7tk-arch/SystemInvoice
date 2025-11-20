-- AlterTable
ALTER TABLE "app"."cash_register_sessions"
  ADD COLUMN IF NOT EXISTS "invoice_sequence_start" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "invoice_sequence_end" VARCHAR(60);
