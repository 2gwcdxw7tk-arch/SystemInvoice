import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportService } from "@/lib/services/ReportService";
import { requireFacturacionAccess } from "@/lib/auth/access";

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  waiter_code: z.string().trim().optional(),
  table_code: z.string().trim().optional(),
  customer: z.string().trim().optional(),
  payment_method: z.string().trim().optional(),
  currency: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireFacturacionAccess(request, "No tienes permisos para consultar el reporte de ventas");
  if ("response" in access) return access.response;

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 }
    );
  }

  const { from, to, waiter_code, table_code, customer, payment_method, currency } = parsed.data;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
    const report = await reportService.getSalesSummary({
      from,
      to,
      waiterCode: waiter_code,
      tableCode: table_code,
      customer,
      paymentMethod: payment_method,
      currency,
    });
    if (format === "html") {
      const html = reportService.renderSalesSummaryHtml({ from, to, waiterCode: waiter_code, tableCode: table_code, customer, paymentMethod: payment_method, currency }, report);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/ventas/resumen", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el reporte de ventas" },
      { status: 500 }
    );
  }
}
