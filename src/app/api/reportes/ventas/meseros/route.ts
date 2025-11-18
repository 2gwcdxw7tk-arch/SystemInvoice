import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportService } from "@/lib/services/ReportService";
import { requireFacturacionAccess } from "@/lib/auth/access";

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  waiter_code: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireFacturacionAccess(request, "No tienes permisos para consultar el desempeño de meseros");
  if ("response" in access) return access.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 }
    );
  }

  const { from, to, waiter_code } = parsed.data;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
    const rows = await reportService.getWaiterPerformance({ from, to, waiterCode: waiter_code });
    if (format === "html") {
      const html = reportService.renderWaiterPerformanceHtml({ from, to, waiterCode: waiter_code }, rows);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("GET /api/reportes/ventas/meseros", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el reporte por mesero" },
      { status: 500 }
    );
  }
}
