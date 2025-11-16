import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const assignmentActionSchema = z.object({
  admin_user_id: z
    .number({ invalid_type_error: "Identificador de usuario inválido" })
    .int("El identificador debe ser entero")
    .positive("El identificador debe ser positivo"),
  cash_register_code: z
    .string()
    .trim()
    .min(2, "Selecciona una caja válida")
    .max(30, "El código de caja no puede exceder 30 caracteres"),
  action: z.enum(["assign", "unassign", "set_default"]),
  make_default: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const sessionResult = await requireAdministrator(request, "Solo un administrador puede consultar asignaciones de caja");
  if ("response" in sessionResult) return sessionResult.response;

  try {
    const adminUserIdParam = request.nextUrl.searchParams.getAll("admin_user_id");
    const adminUserIds = adminUserIdParam
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0);

    const items = await cashRegisterService.listCashRegisterAssignments({
      adminUserIds: adminUserIds.length > 0 ? adminUserIds : undefined,
    });
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("GET /api/cajas/asignaciones", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las asignaciones" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const sessionResult = await requireAdministrator(request, "Solo un administrador puede actualizar asignaciones de caja");
  if ("response" in sessionResult) return sessionResult.response;

  const body = await request.json().catch(() => null);
  const parsed = assignmentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { admin_user_id, cash_register_code, action, make_default } = parsed.data;

  try {
    if (action === "assign") {
      await cashRegisterService.assignCashRegisterToAdmin({
        adminUserId: admin_user_id,
        cashRegisterCode: cash_register_code,
        makeDefault: make_default ?? false,
      });
    } else if (action === "unassign") {
      await cashRegisterService.unassignCashRegisterFromAdmin({
        adminUserId: admin_user_id,
        cashRegisterCode: cash_register_code,
      });
    } else {
      await cashRegisterService.setDefaultCashRegisterForAdmin({
        adminUserId: admin_user_id,
        cashRegisterCode: cash_register_code,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`POST /api/cajas/asignaciones (${action})`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la asignación";
    const status = /no existe|inactiva|asignad|usuario/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
