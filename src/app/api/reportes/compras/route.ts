import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPurchasesReport } from "@/lib/db/reports";

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
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 }
    );
  }

  const { from, to, supplier, status } = parsed.data;

  try {
  const rows = await getPurchasesReport({ from, to, supplier, status: (status || "") as PurchaseStatusValue | "" });
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("GET /api/reportes/compras", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el reporte de compras" },
      { status: 500 }
    );
  }
}
