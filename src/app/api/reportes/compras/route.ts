import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportService } from "@/lib/services/ReportService";
import { requireAdministrator } from "@/lib/auth/access";

const purchaseStatusEnum = z.enum(["PENDIENTE", "PARCIAL", "PAGADA"]);
type PurchaseStatusValue = z.infer<typeof purchaseStatusEnum>;

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  supplier: z.string().trim().optional(),
  status: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.toUpperCase() : ""))
    .refine((value) => !value || purchaseStatusEnum.safeParse(value).success, {
      message: "Estatus inválido",
    }),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar el reporte de compras");
  if ("response" in access) return access.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 }
    );
  }

  const { from, to, supplier, status } = parsed.data;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
  const rows = await reportService.getPurchases({ from, to, supplier, status: (status || "") as PurchaseStatusValue | "" });
    if (format === "html") {
      const html = reportService.renderPurchasesHtml({ from, to, supplier, status: (status || "") as PurchaseStatusValue | "" }, rows);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("GET /api/reportes/compras", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el reporte de compras" },
      { status: 500 }
    );
  }
}
