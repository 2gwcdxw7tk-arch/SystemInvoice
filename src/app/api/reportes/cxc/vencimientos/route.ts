import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { reportService } from "@/lib/services/ReportService";

const DATE_SCHEMA = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: DATE_SCHEMA,
  to: DATE_SCHEMA,
  customer: z.string().trim().optional(),
  include_future: z.string().trim().optional(),
  customer_codes: z.string().trim().optional(),
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE,
];

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return undefined;
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

  const { from, to, customer, include_future, customer_codes } = parsed.data;
  const includeFuture = parseBoolean(include_future);
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const customerCodes = parseCustomerCodes(customer_codes);

  try {
    const report = await reportService.getCxcDueAnalysis({ from, to, customer, customerCodes, includeFuture });
    if (format === "html") {
      const html = reportService.renderCxcDueAnalysisHtml({ from, to, customer, customerCodes, includeFuture }, report);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/cxc/vencimientos", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el análisis de vencimientos" },
      { status: 500 },
    );
  }
}
