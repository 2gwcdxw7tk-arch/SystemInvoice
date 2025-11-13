import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getInventoryMovementsReport } from "@/lib/db/reports";

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  article: z.string().trim().optional(),
  warehouse: z.string().trim().optional(),
  transaction_type: z.string().trim().optional(),
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

  const { from, to, article, warehouse, transaction_type } = parsed.data;

  try {
    const report = await getInventoryMovementsReport({ from, to, article, warehouse, transactionType: transaction_type });
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/inventario/movimientos", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron obtener los movimientos de inventario" },
      { status: 500 }
    );
  }
}
