import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportService } from "@/lib/services/ReportService";
import { requireFacturacionAccess } from "@/lib/auth/access";

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  customer: z.string().trim().optional(),
  waiter_code: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireFacturacionAccess(request, "No tienes permisos para consultar el estado de facturación");
  if ("response" in access) return access.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 }
    );
  }

  const { from, to, customer, waiter_code } = parsed.data;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
    const report = await reportService.getInvoiceStatus({ from, to, customer, waiterCode: waiter_code });
    if (format === "html") {
      const html = reportService.renderInvoiceStatusHtml({ from, to, customer, waiterCode: waiter_code }, report);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/facturacion/estatus", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el estado de facturación" },
      { status: 500 }
    );
  }
}
