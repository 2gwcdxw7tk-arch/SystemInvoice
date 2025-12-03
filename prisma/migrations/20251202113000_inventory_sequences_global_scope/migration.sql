-- Align inventory movements with shared global counters when multiple transaction types reuse the same sequence
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
