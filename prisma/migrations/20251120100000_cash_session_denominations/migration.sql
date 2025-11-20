-- Add denomination breakdowns to cash register sessions
ALTER TABLE app.cash_register_sessions
  ADD COLUMN IF NOT EXISTS opening_denominations JSONB NULL,
  ADD COLUMN IF NOT EXISTS closing_denominations JSONB NULL;