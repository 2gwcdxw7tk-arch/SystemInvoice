import { NextRequest, NextResponse } from "next/server";

import { listWarehouses } from "@/lib/db/warehouses";
import {
  forbiddenResponse,
  requireSession,
  isAdministrator,
  isFacturador,
  hasPermission,
} from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const access = await requireSession(request);
  if ("response" in access) return access.response;

  const { session } = access;
  const canReadWarehouses =
    isAdministrator(session) ||
    isFacturador(session) ||
    hasPermission(session, "inventory.report.view") ||
    hasPermission(session, "inventory.view");

  if (!canReadWarehouses) {
    return forbiddenResponse("No tienes permisos para consultar bodegas");
  }

  try {
    const items = await listWarehouses();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/warehouses error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los almacenes" }, { status: 500 });
  }
}
