import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { customerDocumentService } from "@/lib/services/cxc/CustomerDocumentService";
import type { CustomerDocumentStatus, CustomerDocumentType } from "@/lib/types/cxc";

const moneyField = (min: number) =>
  z.preprocess((value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.trim().replace(/,/g, "."));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }, z.number().min(min));

const optionalNullableString = z
  .union([z.string().trim().max(160), z.literal(""), z.literal(null)])
  .optional()
  .transform((value) => {
    if (typeof value === "undefined") return undefined;
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  });

const DOCUMENT_TYPES = [
  "INVOICE",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "RECEIPT",
  "RETENTION",
  "ADJUSTMENT",
] as const satisfies ReadonlyArray<CustomerDocumentType>;

const DOCUMENT_STATUSES = ["PENDIENTE", "PAGADO", "CANCELADO", "BORRADOR"] as const satisfies ReadonlyArray<CustomerDocumentStatus>;

const createDocumentSchema = z.object({
  customerId: z.number().int().positive(),
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string().trim().min(1).max(40),
  documentDate: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]),
  dueDate: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.date(), z.literal(null)]).optional(),
  currencyCode: z.string().trim().length(3).optional(),
  originalAmount: moneyField(0.01),
  balanceAmount: moneyField(0).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  reference: optionalNullableString,
  notes: optionalNullableString,
  metadata: z.record(z.unknown()).optional(),
  paymentTermId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
  paymentTermCode: z.union([z.string().trim().max(32), z.literal(null)]).optional(),
  relatedInvoiceId: z.number().int().positive().optional(),
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMERS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
];

const parseBoolean = (value: string | null): boolean => {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const parseDateParam = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
};

export async function GET(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar documentos",
  });
  if ("response" in access) {
    return access.response;
  }

  const params = request.nextUrl.searchParams;
  const customerId = params.get("customerId");
  const typesParam = params.get("types");
  const statusParam = params.get("status");
  const includeSettled = parseBoolean(params.get("includeSettled"));
  const search = params.get("search") ?? undefined;
  const orderBy = params.get("orderBy");
  const orderDirection = params.get("orderDirection")?.toLowerCase() === "asc" ? "asc" : "desc";
  const limit = params.get("limit") ? Number(params.get("limit")) : undefined;
  const documentDateFrom = parseDateParam(params.get("dateFrom"));
  const documentDateTo = parseDateParam(params.get("dateTo"));

  const types = typesParam
    ? typesParam
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value): value is CustomerDocumentType => DOCUMENT_TYPES.includes(value as CustomerDocumentType))
    : undefined;

  const status = statusParam
    ? statusParam
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value): value is CustomerDocumentStatus => DOCUMENT_STATUSES.includes(value as CustomerDocumentStatus))
    : undefined;

  const orderByField = orderBy === "dueDate" ? "dueDate" : orderBy === "createdAt" ? "createdAt" : "documentDate";

  try {
    const items = await customerDocumentService.list({
      customerId: customerId ? Number(customerId) : undefined,
      includeSettled,
      search,
      types,
      status,
      documentDateFrom,
      documentDateTo,
      orderBy: orderByField,
      orderDirection,
      limit,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/cxc/documentos", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los documentos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE],
    message: "No tienes permisos para crear documentos",
  });
  if ("response" in access) {
    return access.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = createDocumentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const document = await customerDocumentService.create({
      customerId: data.customerId,
      documentType: data.documentType,
      documentNumber: data.documentNumber,
      documentDate: data.documentDate,
      dueDate: data.dueDate,
      currencyCode: data.currencyCode,
      originalAmount: data.originalAmount,
      balanceAmount: data.balanceAmount,
      status: data.status,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      metadata: data.metadata,
      paymentTermId:
        typeof data.paymentTermId === "number" ? data.paymentTermId : data.paymentTermId ?? undefined,
      paymentTermCode:
        typeof data.paymentTermCode === "string" ? data.paymentTermCode : data.paymentTermCode ?? undefined,
      relatedInvoiceId: data.relatedInvoiceId,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cxc/documentos", error);
    const message = error instanceof Error ? error.message : "No se pudo crear el documento";
    const status = /existe/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
