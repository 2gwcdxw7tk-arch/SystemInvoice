import { PrismaClient, prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client"; // Type-only Prisma namespace for TransactionClient
import { inventoryService } from "@/lib/services/InventoryService";
import type { InvoiceConsumptionLineInput } from "@/lib/types/inventory";
import type { IInvoiceRepository, InvoiceInsertResult, InvoicePersistenceInput } from "@/lib/repositories/invoices/IInvoiceRepository";
import { toCentralClosedDate, toCentralEndOfDay } from "@/lib/utils/date";

export class InvoiceRepository implements IInvoiceRepository {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async createInvoice(data: InvoicePersistenceInput): Promise<InvoiceInsertResult> {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Validar claves foráneas opcionales para evitar violaciones de FK
      let tableCode: string | null = data.table_code?.trim() || null;
      if (tableCode) {
        const tableExists = await tx.tables.findUnique({ where: { id: tableCode } });
        if (!tableExists) {
          tableCode = null;
        }
      }

      let waiterCode: string | null = data.waiter_code?.trim() || null;
      if (waiterCode) {
        const waiterExists = await tx.waiters.findUnique({ where: { code: waiterCode } });
        if (!waiterExists) {
          waiterCode = null;
        }
      }

      const normalizedInvoiceDate = toCentralClosedDate(data.invoiceDate);

      const invoice = await tx.invoices.create({
        data: {
          invoice_number: data.invoice_number,
          table_code: tableCode,
          waiter_code: waiterCode,
          invoice_date: normalizedInvoiceDate,
          origin_order_id: data.originOrderId,
          status: 'FACTURADA',
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
          .map((row: { article_code: string; quantity: import("@prisma/client/runtime/library").Decimal }) => ({
            article_code: row.article_code.trim().toUpperCase(),
            quantity: Number(row.quantity),
            unit: "RETAIL" as const,
          }))
          .filter((line: { article_code: string; quantity: number; unit: "RETAIL" }) => line.article_code.length > 0 && line.quantity > 0);
      }

      if (movementLines.length > 0 && defaultWarehouseCode) {
        movementLines = movementLines.map((line: InvoiceConsumptionLineInput) => ({
          ...line,
          warehouse_code: line.warehouse_code ?? defaultWarehouseCode,
        }));
      }

      if (movementLines.length > 0) {
        await inventoryService.registerInvoiceMovements({
          invoiceId,
          invoiceNumber: data.invoice_number,
          invoiceDate: normalizedInvoiceDate,
          tableCode: tableCode ?? null,
          customerName: data.customer_name ?? null,
          lines: movementLines,
        });
      }

      return { id: invoiceId, invoice_number: invoice.invoice_number } satisfies InvoiceInsertResult;
    });

    return result;
  }

  async updateInvoiceStatus(invoiceId: number, status: string, cancelledAt?: Date | null): Promise<void> {
    await this.prisma.invoices.update({
      where: { id: BigInt(invoiceId) },
      data: {
        status,
        cancelled_at: cancelledAt ?? null,
        updated_at: new Date(),
      },
    });
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
    const invoice = await this.prisma.invoices.findUnique({
      where: { invoice_number: invoiceNumber },
      select: { id: true, invoice_number: true },
    });
    return invoice ? { id: Number(invoice.id), invoice_number: invoice.invoice_number } : null;
  }

  async getInvoiceBasicById(invoiceId: number): Promise<{ id: number; invoice_number: string } | null> {
    const invoice = await this.prisma.invoices.findUnique({
      where: { id: BigInt(invoiceId) },
      select: { id: true, invoice_number: true },
    });
    return invoice ? { id: Number(invoice.id), invoice_number: invoice.invoice_number } : null;
  }

  async getInvoiceDetailById(invoiceId: number): Promise<{
    id: number;
    invoice_number: string;
    status: string;
    cancelled_at: string | null;
    invoice_date: string;
    table_code: string | null;
    waiter_code: string | null;
    subtotal: number;
    service_charge: number;
    vat_amount: number;
    vat_rate: number;
    total_amount: number;
    currency_code: string;
    notes: string | null;
    customer_name: string | null;
    customer_tax_id: string | null;
    items: Array<{ id: number; line_number: number; description: string; quantity: number; unit_price: number; line_total: number; article_code: string | null }>;
    payments: Array<{ id: number; payment_method: string; amount: number; reference: string | null }>;
  } | null> {
    const row = await this.prisma.invoices.findUnique({
      where: { id: BigInt(invoiceId) },
      select: {
        id: true,
        invoice_number: true,
        status: true,
        cancelled_at: true,
        invoice_date: true,
        table_code: true,
        waiter_code: true,
        subtotal: true,
        service_charge: true,
        vat_amount: true,
        vat_rate: true,
        total_amount: true,
        currency_code: true,
        notes: true,
        customer_name: true,
        customer_tax_id: true,
        invoice_items: {
          select: {
            id: true,
            line_number: true,
            description: true,
            quantity: true,
            unit_price: true,
            line_total: true,
            article_code: true,
          },
          orderBy: { line_number: "asc" },
        },
        invoice_payments: {
          select: { id: true, payment_method: true, amount: true, reference: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!row) return null;
    return {
      id: Number(row.id),
      invoice_number: row.invoice_number,
      status: row.status,
      cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      invoice_date: row.invoice_date.toISOString(),
      table_code: row.table_code,
      waiter_code: row.waiter_code,
      subtotal: Number(row.subtotal),
      service_charge: Number(row.service_charge),
      vat_amount: Number(row.vat_amount),
      vat_rate: Number(row.vat_rate),
      total_amount: Number(row.total_amount),
      currency_code: row.currency_code,
      notes: row.notes ?? null,
      customer_name: row.customer_name ?? null,
      customer_tax_id: row.customer_tax_id ?? null,
      items: row.invoice_items.map((it) => ({
        id: Number(it.id),
        line_number: it.line_number,
        description: it.description,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        line_total: Number(it.line_total),
        article_code: it.article_code ?? null,
      })),
      payments: row.invoice_payments.map((p) => ({
        id: Number(p.id),
        payment_method: p.payment_method,
        amount: Number(p.amount),
        reference: p.reference ?? null,
      })),
    };
  }

  async listInvoices(params: {
    from?: string;
    to?: string;
    q?: string;
    table_code?: string;
    waiter_code?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ total: number; items: Array<{
    id: number;
    invoice_number: string;
    status: string;
    invoice_date: string;
    table_code: string | null;
    waiter_code: string | null;
    subtotal: number;
    service_charge: number;
    vat_amount: number;
    total_amount: number;
    currency_code: string;
    customer_name: string | null;
  }> }> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const skip = (page - 1) * pageSize;
    const from = params.from ? toCentralClosedDate(params.from) : undefined;
    const to = params.to ? toCentralEndOfDay(params.to) : undefined;
    const where: Prisma.invoicesWhereInput = {};
    if (from || to) {
      where.invoice_date = { gte: from ?? undefined, lte: to ?? undefined };
    }
    if (params.table_code) {
      where.table_code = params.table_code;
    }
    if (params.waiter_code) {
      where.waiter_code = params.waiter_code;
    }
    if (params.status && params.status.trim().length > 0) {
      where.status = params.status.trim().toUpperCase();
    }
    if (params.q && params.q.trim().length > 0) {
      const q = params.q.trim();
      where.OR = [
        { invoice_number: { contains: q, mode: "insensitive" } },
        { customer_name: { contains: q, mode: "insensitive" } },
        { table_code: { contains: q, mode: "insensitive" } },
        { waiter_code: { contains: q, mode: "insensitive" } },
      ];
    }

    const total = await this.prisma.invoices.count({ where });
    const rows = await this.prisma.invoices.findMany({
      where,
      orderBy: { invoice_date: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        invoice_number: true,
        status: true,
        invoice_date: true,
        table_code: true,
        waiter_code: true,
        subtotal: true,
        service_charge: true,
        vat_amount: true,
        total_amount: true,
        currency_code: true,
        customer_name: true,
      },
    });

    return {
      total,
      items: rows.map((r) => ({
        id: Number(r.id),
        invoice_number: r.invoice_number,
        status: r.status,
        invoice_date: r.invoice_date.toISOString(),
        table_code: r.table_code,
        waiter_code: r.waiter_code,
        subtotal: Number(r.subtotal),
        service_charge: Number(r.service_charge),
        vat_amount: Number(r.vat_amount),
        total_amount: Number(r.total_amount),
        currency_code: r.currency_code,
        customer_name: r.customer_name ?? null,
      })),
    };
  }
}
