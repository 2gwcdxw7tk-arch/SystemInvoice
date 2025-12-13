import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import { registerPurchaseSchema } from "@/lib/schemas/inventory";

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
    const items = await inventoryService.listPurchases({ supplier, status, from, to });
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
  const parsed = registerPurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await inventoryService.registerPurchase(parsed.data);
    return NextResponse.json({ transaction_id: result.id, transaction_code: result.transaction_code }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/inventario/compras error", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la compra";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
