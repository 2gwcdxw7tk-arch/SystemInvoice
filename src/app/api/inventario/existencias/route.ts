import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar existencias");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const article = searchParams.get("article") || undefined;
  const warehouse_code = searchParams.get("warehouse_code") || undefined;

  try {
    const items = await inventoryService.getStockSummary({ article, warehouse_code });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/existencias error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener existencias" }, { status: 500 });
  }
}
