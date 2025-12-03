-- Add updated_at to inventory_transactions for trigger compatibility
ALTER TABLE "app"."inventory_transactions"
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP;

-- Ensure existing rows have a non-null value
UPDATE "app"."inventory_transactions"
SET "updated_at" = COALESCE("updated_at", CURRENT_TIMESTAMP);
