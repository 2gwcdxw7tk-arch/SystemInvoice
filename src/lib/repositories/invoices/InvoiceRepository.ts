import { PrismaClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client"; // Import Prisma namespace for TransactionClient type
import { registerInvoiceMovements, type InvoiceConsumptionLineInput } from "@/lib/db/inventory";
import type { IInvoiceRepository, InvoiceInsertResult, InvoicePersistenceInput } from "@/lib/repositories/invoices/IInvoiceRepository";

export class InvoiceRepository implements IInvoiceRepository {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  async createInvoice(data: InvoicePersistenceInput): Promise<InvoiceInsertResult> {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoice = await tx.invoices.create({
        data: {
          invoice_number: data.invoice_number,
          table_code: data.table_code,
          waiter_code: data.waiter_code,
          invoice_date: data.invoiceDate,
          origin_order_id: data.originOrderId,
          subtotal: data.subtotal,
          service_charge: data.service_charge,
          vat_amount: data.vat_amount,
          vat_rate: data.vat_rate,
          total_amount: data.total_amount,
          currency_code: data.currency_code,
          notes: data.notes,
          customer_name: data.customer_name,
          customer_tax_id: data.customer_tax_id,
          issuer_admin_user_id: data.issuer_admin_user_id,
          cash_register_id: data.cash_register_id,
          cash_register_session_id: data.cash_register_session_id,
          invoice_payments: {
            createMany: {
              data: data.payments.map((p) => ({
                payment_method: p.method,
                amount: p.amount,
                reference: p.reference,
              })),
            },
          },
          invoice_items: {
            createMany: {
              data: data.items.map((item, idx) => ({
                line_number: idx + 1,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                line_total: item.line_total,
                article_code: item.article_code,
              })),
            },
          },
        },
      });

      const invoiceId = Number(invoice.id);

      let movementLines: InvoiceConsumptionLineInput[] = data.movementLines.slice();
      const defaultWarehouseCode = data.cashRegisterWarehouseCode?.trim()?.toUpperCase() ?? null;

      if (movementLines.length === 0 && data.originOrderId) {
        const orderItems = await tx.order_items.findMany({
          where: { order_id: data.originOrderId },
          select: { article_code: true, quantity: true },
        });
        movementLines = orderItems
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
        // NOTE: registerInvoiceMovements still uses direct SQL. This will be addressed in a later phase.
        // For now, we pass the Prisma transaction client if it can be used, otherwise it will use its own connection.
        await registerInvoiceMovements({
          invoiceId,
          invoiceNumber: data.invoice_number,
          invoiceDate: data.invoiceDate,
          tableCode: data.table_code ?? null,
          customerName: data.customer_name ?? null,
          lines: movementLines,
          // client: tx, // Assuming registerInvoiceMovements can accept a Prisma transaction client
        });
      }

      return { id: invoiceId, invoice_number: invoice.invoice_number } satisfies InvoiceInsertResult;
    });

    return result;
  }

  async deleteInvoice(invoiceId: number): Promise<void> {
    await this.prisma.invoices.delete({
      where: { id: BigInt(invoiceId) },
    });
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
    const invoice = await this.prisma.invoices.findUnique({
      where: { invoice_number: invoiceNumber },
      select: { id: true, invoice_number: true },
    });
    return invoice ? { id: Number(invoice.id), invoice_number: invoice.invoice_number } : null;
  }
}
