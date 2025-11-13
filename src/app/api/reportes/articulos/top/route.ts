import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getTopItemsReport } from "@/lib/db/reports";
import { requireFacturacionAccess } from "@/lib/auth/access";

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  search: z.string().trim().optional(),
  limit: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .refine((value) => value === undefined || Number.isFinite(value), {
      message: "El límite debe ser numérico",
    }),
});

export async function GET(request: NextRequest) {
  const access = await requireFacturacionAccess(request, "No tienes permisos para consultar el ranking de artículos");
  if ("response" in access) return access.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", issues: parsed.error.format() },
      { status: 400 }
    );
  }

  const { from, to, search, limit } = parsed.data;

  try {
    const rows = await getTopItemsReport({ from, to, search, limit });
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("GET /api/reportes/articulos/top", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el ranking de artículos" },
      { status: 500 }
    );
  }
}
