import { registerInvoiceMovements, type InvoiceConsumptionLineInput } from "@/lib/db/inventory";
import { query, withTransaction } from "@/lib/db/postgres";
import type { IInvoiceRepository, InvoiceInsertResult, InvoicePersistenceInput } from "@/lib/repositories/invoices/IInvoiceRepository";

export class InvoiceRepository implements IInvoiceRepository {
  async createInvoice(data: InvoicePersistenceInput): Promise<InvoiceInsertResult> {
    const result = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO app.invoices (
           invoice_number,
           table_code,
           waiter_code,
           invoice_date,
           origin_order_id,
           subtotal,
           service_charge,
           vat_amount,
           vat_rate,
           total_amount,
           currency_code,
           notes,
           customer_name,
           customer_tax_id,
           issuer_admin_user_id,
           cash_register_id,
           cash_register_session_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
         )
         RETURNING id`,
        [
          data.invoice_number,
          data.table_code,
          data.waiter_code,
          data.invoiceDate,
          data.originOrderId ?? null,
          data.subtotal,
          data.service_charge,
          data.vat_amount,
          data.vat_rate,
          data.total_amount,
          data.currency_code,
          data.notes ?? null,
          data.customer_name ?? null,
          data.customer_tax_id ?? null,
          data.issuer_admin_user_id ?? null,
          data.cash_register_id ?? null,
          data.cash_register_session_id ?? null,
        ]
      );

      const invoiceId = Number(inserted.rows[0]?.id);
      if (!invoiceId || Number.isNaN(invoiceId)) {
        throw new Error("No se pudo obtener el ID de la factura");
      }

      if (data.payments.length > 0) {
        for (const payment of data.payments) {
          await client.query(
            `INSERT INTO app.invoice_payments (invoice_id, payment_method, amount, reference)
             VALUES ($1, $2, $3, $4)`,
            [invoiceId, payment.method, payment.amount, payment.reference ?? null]
          );
        }
      }

      if (data.items.length > 0) {
        let line = 1;
        for (const item of data.items) {
          await client.query(
            `INSERT INTO app.invoice_items (invoice_id, line_number, description, quantity, unit_price, line_total)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [invoiceId, line++, item.description, item.quantity, item.unit_price, item.line_total]
          );
        }
      }

      let movementLines: InvoiceConsumptionLineInput[] = data.movementLines.slice();
      const defaultWarehouseCode = data.cashRegisterWarehouseCode?.trim()?.toUpperCase() ?? null;

      if (movementLines.length === 0 && data.originOrderId) {
        const orderItems = await client.query<{ article_code: string; quantity: number }>(
          `SELECT article_code, quantity
             FROM app.order_items
            WHERE order_id = $1`,
          [data.originOrderId]
        );
        movementLines = orderItems.rows
          .map((row) => ({
            article_code: row.article_code.trim().toUpperCase(),
            quantity: Number(row.quantity),
            unit: "RETAIL" as const,
          }))
          .filter((line) => line.article_code.length > 0 && line.quantity > 0);
      }

      if (movementLines.length > 0 && defaultWarehouseCode) {
        movementLines = movementLines.map((line) => ({
          ...line,
          warehouse_code: line.warehouse_code ?? defaultWarehouseCode,
        }));
      }

      if (movementLines.length > 0) {
        await registerInvoiceMovements({
          invoiceId,
          invoiceNumber: data.invoice_number,
          invoiceDate: data.invoiceDate,
          tableCode: data.table_code ?? null,
          customerName: data.customer_name ?? null,
          lines: movementLines,
          client,
        });
      }

      return { id: invoiceId, invoice_number: data.invoice_number } satisfies InvoiceInsertResult;
    });

    return result;
  }

  async deleteInvoice(invoiceId: number): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM app.invoices WHERE id = $1`, [invoiceId]);
    });
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
    const result = await query<{ id: number; invoice_number: string }>(
      "SELECT id, invoice_number FROM app.invoices WHERE invoice_number = $1",
      [invoiceNumber]
    );
    const row = result.rows[0];
    return row ? { id: Number(row.id), invoice_number: row.invoice_number } : null;
  }
}
