import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { warehouseService } from "@/lib/services/WarehouseService";
import { forbiddenResponse, requireSession, isAdministrator, isFacturador, hasPermission, requireAdministrator } from "@/lib/auth/access";

const createWarehouseSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean().optional(),
});

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
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "1";
    const records = await warehouseService.listWarehouses({ includeInactive });
    const items = records.map((record) => ({
      id: record.id,
      code: record.code,
      name: record.name,
      is_active: record.isActive,
    }));
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/warehouses error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los almacenes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede crear bodegas");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = createWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const record = await warehouseService.createWarehouse({
      code: parsed.data.code,
      name: parsed.data.name,
      isActive: parsed.data.is_active,
    });

    return NextResponse.json(
      {
        success: true,
        warehouse: {
          id: record.id,
          code: record.code,
          name: record.name,
          is_active: record.isActive,
          created_at: record.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la bodega";
    const status = error instanceof Error && /ya existe/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
