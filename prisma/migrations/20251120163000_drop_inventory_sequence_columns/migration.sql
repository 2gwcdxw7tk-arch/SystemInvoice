-- AlterTable
ALTER TABLE "app"."inventory_movements"
  DROP COLUMN IF EXISTS "invoice_sequence_start",
  DROP COLUMN IF EXISTS "invoice_sequence_end";
