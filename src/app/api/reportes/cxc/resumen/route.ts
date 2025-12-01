import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { reportService } from "@/lib/services/ReportService";
import type { CustomerDocumentStatus, CustomerDocumentType } from "@/lib/types/cxc";

const DATE_SCHEMA = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: DATE_SCHEMA,
  to: DATE_SCHEMA,
  customer: z.string().trim().optional(),
  status: z.string().trim().optional(),
  document_types: z.string().trim().optional(),
  customer_codes: z.string().trim().optional(),
});

const STATUS_CODES: CustomerDocumentStatus[] = ["PENDIENTE", "PAGADO", "CANCELADO", "BORRADOR"];
const DOCUMENT_TYPES: CustomerDocumentType[] = ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE", "RECEIPT", "RETENTION", "ADJUSTMENT"];

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE,
];

const parseCsv = <T extends string>(value: string | undefined, allowed: readonly T[]): T[] | undefined => {
  if (!value) return undefined;
  const tokens = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is T => (allowed as readonly string[]).includes(item));
  return tokens.length > 0 ? tokens : undefined;
};

const parseCustomerCodes = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const tokens = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0);
  if (tokens.length === 0) return undefined;
  return Array.from(new Set(tokens));
};

export async function GET(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar reportes de CxC",
  });
  if ("response" in access) return access.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 },
    );
  }

  const { from, to, customer, status, document_types, customer_codes } = parsed.data;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const statusList = parseCsv<CustomerDocumentStatus>(status, STATUS_CODES);
  const documentTypes = parseCsv<CustomerDocumentType>(document_types, DOCUMENT_TYPES);
  const customerCodes = parseCustomerCodes(customer_codes);

  try {
    const report = await reportService.getCxcSummary({
      from,
      to,
      customer,
      customerCodes,
      status: statusList,
      documentTypes,
    });
    if (format === "html") {
      const html = reportService.renderCxcSummaryHtml({ from, to, customer, customerCodes, status: statusList, documentTypes }, report);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/cxc/resumen", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el reporte de CxC" },
      { status: 500 },
    );
  }
}
