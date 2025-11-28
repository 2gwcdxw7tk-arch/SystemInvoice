import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { reportService } from "@/lib/services/ReportService";

const DATE_SCHEMA = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: DATE_SCHEMA,
  to: DATE_SCHEMA,
  customer: z.string().trim().optional(),
  limit: z.string().trim().optional(),
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE,
];

const parseLimit = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric > 0 ? numeric : undefined;
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

  const { from, to, customer, limit } = parsed.data;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
    const report = await reportService.getCxcAging({ from, to, customer, limit: parseLimit(limit) });
    if (format === "html") {
      const html = reportService.renderCxcAgingHtml({ from, to, customer, limit: parseLimit(limit) }, report);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/cxc/antiguedad", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el reporte de antigüedad" },
      { status: 500 },
    );
  }
}
