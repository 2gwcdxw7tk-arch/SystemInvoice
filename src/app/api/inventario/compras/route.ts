import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listPurchases, registerPurchase } from "@/lib/db/inventory";
import { requireAdministrator } from "@/lib/auth/access";

const numericInput = z.union([z.number(), z.string().trim().min(1)]);
const quantitySchema = numericInput.refine((value) => {
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
  return Number.isFinite(num) && num > 0;
}, { message: "La cantidad debe ser mayor a 0" });
const costSchema = z.union([z.number(), z.string().trim()]).optional().refine((value) => {
  if (value === undefined) return true;
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
  return Number.isFinite(num) && num >= 0;
}, { message: "Costo inválido" });

const purchaseSchema = z.object({
  document_number: z.string().trim().min(1).max(120),
  supplier_name: z.string().trim().min(1).max(160),
  occurred_at: z.string().trim().optional(),
  status: z.enum(["PENDIENTE", "PARCIAL", "PAGADA"]).optional(),
  warehouse_code: z.string().trim().min(1).max(20),
  notes: z.string().trim().max(400).optional(),
  lines: z.array(z.object({
    article_code: z.string().trim().min(1).max(40),
    quantity: quantitySchema,
    unit: z.enum(["STORAGE", "RETAIL"]),
    cost_per_unit: costSchema,
    notes: z.string().trim().max(300).optional(),
  })).min(1),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar compras de inventario");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const supplier = searchParams.get("supplier") || undefined;
  const statusParam = searchParams.get("status") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const normalizedStatus = statusParam ? statusParam.toUpperCase() : undefined;
  const status = normalizedStatus && ["PENDIENTE", "PARCIAL", "PAGADA"].includes(normalizedStatus) ? (normalizedStatus as "PENDIENTE" | "PARCIAL" | "PAGADA") : undefined;

  try {
    const items = await listPurchases({ supplier, status, from, to });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/compras error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener el registro de compras" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede registrar compras");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await registerPurchase(parsed.data);
    return NextResponse.json({ transaction_id: result.transaction_id, transaction_code: result.transaction_code }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/inventario/compras error", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la compra";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
