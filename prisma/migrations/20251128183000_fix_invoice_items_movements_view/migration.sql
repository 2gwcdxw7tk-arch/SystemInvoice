-- Corrige la vista para exponer line_total como total_amount
DROP VIEW IF EXISTS app.invoice_items_movements;
CREATE VIEW app.invoice_items_movements AS
SELECT
  ii.id AS item_id,
  COALESCE(ii.quantity, 0) AS quantity,
  ii.line_total AS total_amount,
  i.invoice_date AS created_at
FROM app.invoice_items ii
INNER JOIN app.invoices i ON i.id = ii.invoice_id
WHERE i.status = 'FACTURADA';
