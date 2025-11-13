import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getInvoiceStatusReport } from "@/lib/db/reports";

const querySchema = z.object({
  from: z.string().trim().min(10, "La fecha inicial es obligatoria"),
  to: z.string().trim().min(10, "La fecha final es obligatoria"),
  customer: z.string().trim().optional(),
  waiter_code: z.string().trim().optional(),
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

  const { from, to, customer, waiter_code } = parsed.data;

  try {
    const report = await getInvoiceStatusReport({ from, to, customer, waiterCode: waiter_code });
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("GET /api/reportes/facturacion/estatus", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el estado de facturación" },
      { status: 500 }
    );
  }
}
