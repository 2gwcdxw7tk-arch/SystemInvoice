import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import { registerConsumptionSchema } from "@/lib/schemas/inventory";

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar consumos de inventario");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const article = searchParams.get("article") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  try {
    const items = await inventoryService.listConsumptions({ article, from, to });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/consumos error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener el registro de consumos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede registrar consumos");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = registerConsumptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await inventoryService.registerConsumption(parsed.data);
    return NextResponse.json({ transaction_id: result.id, transaction_code: result.transaction_code }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/inventario/consumos error", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar el consumo";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
