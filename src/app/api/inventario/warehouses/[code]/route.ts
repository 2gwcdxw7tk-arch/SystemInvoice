import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  forbiddenResponse,
  requireAdministrator,
  requireSession,
  isAdministrator,
  isFacturador,
  hasPermission,
} from "@/lib/auth/access";
import { warehouseService } from "@/lib/services/WarehouseService";

const updateWarehouseSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => typeof value.name !== "undefined" || typeof value.is_active !== "undefined", {
    message: "Se requiere al menos un campo a actualizar",
  });

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const access = await requireSession(request);
  if ("response" in access) return access.response;

  const { session } = access;
  const canRead =
    isAdministrator(session) ||
    isFacturador(session) ||
    hasPermission(session, "inventory.report.view") ||
    hasPermission(session, "inventory.view");

  if (!canRead) {
    return forbiddenResponse("No tienes permisos para consultar bodegas");
  }

  const params = await context.params;
  const code = params.code?.trim();
  if (!code) {
    return NextResponse.json({ success: false, message: "Código inválido" }, { status: 400 });
  }

  const warehouse = await warehouseService.getWarehouseByCode(code);
  if (!warehouse) {
    return NextResponse.json({ success: false, message: "Bodega no encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    warehouse: {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      is_active: warehouse.isActive,
      created_at: warehouse.createdAt,
    },
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const access = await requireAdministrator(request, "Solo un administrador puede actualizar bodegas");
  if ("response" in access) return access.response;

  const params = await context.params;
  const code = params.code?.trim();
  if (!code) {
    return NextResponse.json({ success: false, message: "Código inválido" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateWarehouseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const record = await warehouseService.updateWarehouse(code, {
      name: parsed.data.name,
      isActive: parsed.data.is_active,
    });

    return NextResponse.json({
      success: true,
      warehouse: {
        id: record.id,
        code: record.code,
        name: record.name,
        is_active: record.isActive,
        created_at: record.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la bodega";
    const status = error instanceof Error && /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
