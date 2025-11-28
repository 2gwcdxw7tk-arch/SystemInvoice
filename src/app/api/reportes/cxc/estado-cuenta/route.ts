import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { reportService } from "@/lib/services/ReportService";

const DATE_SCHEMA = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: DATE_SCHEMA,
  to: DATE_SCHEMA,
  customer_id: z.string().trim().optional(),
  customer_code: z.string().trim().optional(),
  include_applications: z.string().trim().optional(),
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

const parseCustomerId = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.trunc(numeric);
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

  const { from, to, customer_id, customer_code, include_applications } = parsed.data;
  const customerId = parseCustomerId(customer_id);
  const customerCode = customer_code?.trim().length ? customer_code.trim() : undefined;

  if (!customerId && !customerCode) {
    return NextResponse.json(
      { success: false, message: "Debes indicar customer_id o customer_code" },
      { status: 400 },
    );
  }

  const includeApplications = parseBoolean(include_applications);
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
    const report = await reportService.getCxcStatement({
      from,
      to,
      customerId,
      customerCode,
      includeApplications,
    });
    if (format === "html") {
      const html = reportService.renderCxcStatementHtml({ from, to, customerId, customerCode, includeApplications }, report);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/cxc/estado-cuenta", error);
    const message = error instanceof Error ? error.message : "No se pudo generar el estado de cuenta";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
