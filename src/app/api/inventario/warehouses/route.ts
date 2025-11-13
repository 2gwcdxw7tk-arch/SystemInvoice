import { NextRequest, NextResponse } from "next/server";

import { listWarehouses } from "@/lib/db/warehouses";
import { requireAdministrator } from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar almacenes");
  if ("response" in access) return access.response;

  try {
    const items = await listWarehouses();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/warehouses error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los almacenes" }, { status: 500 });
  }
}
