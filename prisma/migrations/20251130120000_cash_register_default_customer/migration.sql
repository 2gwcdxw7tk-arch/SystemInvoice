-- Asegura que las cajas puedan almacenar un cliente por defecto asociado
ALTER TABLE app.cash_registers
  ADD COLUMN default_customer_id BIGINT;

ALTER TABLE app.cash_registers
  ADD CONSTRAINT fk_cash_registers_default_customer
    FOREIGN KEY (default_customer_id)
    REFERENCES app.customers(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

CREATE INDEX ix_cash_registers_default_customer
  ON app.cash_registers (default_customer_id);
