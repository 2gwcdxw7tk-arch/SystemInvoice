import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { getActiveCashRegisterSessionByAdmin, listCashRegistersForAdmin } from "@/lib/db/cash-registers";

const responseSchema = z.object({
  success: z.literal(true),
  activeSession: z
    .object({
      id: z.number(),
      status: z.enum(["OPEN", "CLOSED", "CANCELLED"]),
      openingAmount: z.number(),
      openingAt: z.string(),
      openingNotes: z.string().nullable(),
      cashRegister: z.object({
        cashRegisterId: z.number(),
        cashRegisterCode: z.string(),
        cashRegisterName: z.string(),
        warehouseCode: z.string(),
        warehouseName: z.string(),
      }),
    })
    .nullable(),
  cashRegisters: z.array(
    z.object({
      cashRegisterId: z.number(),
      cashRegisterCode: z.string(),
      cashRegisterName: z.string(),
      allowManualWarehouseOverride: z.boolean(),
      warehouseId: z.number(),
      warehouseCode: z.string(),
      warehouseName: z.string(),
      isDefault: z.boolean(),
    })
  ),
  defaultCashRegisterId: z.number().nullable(),
});

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canAccess =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.some((perm) =>
      perm === "cash.register.open" || perm === "cash.register.close" || perm === "cash.report.view"
    );

  if (!canAccess) {
    return NextResponse.json({ success: false, message: "No tienes permisos para operar cajas" }, { status: 403 });
  }

  const adminId = Number(session.sub);
  const [assignments, currentSession] = await Promise.all([
    listCashRegistersForAdmin(adminId),
    getActiveCashRegisterSessionByAdmin(adminId),
  ]);

  const payload = {
    success: true as const,
    activeSession: currentSession
      ? {
          id: currentSession.id,
          status: currentSession.status,
          openingAmount: currentSession.openingAmount,
          openingAt: currentSession.openingAt,
          openingNotes: currentSession.openingNotes,
          cashRegister: {
            cashRegisterId: currentSession.cashRegister.cashRegisterId,
            cashRegisterCode: currentSession.cashRegister.cashRegisterCode,
            cashRegisterName: currentSession.cashRegister.cashRegisterName,
            warehouseCode: currentSession.cashRegister.warehouseCode,
            warehouseName: currentSession.cashRegister.warehouseName,
          },
        }
      : null,
    cashRegisters: assignments,
    defaultCashRegisterId: assignments.find((register) => register.isDefault)?.cashRegisterId ?? null,
  };

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Respuesta de /api/cajas/sesion-activa no válida", parsed.error.flatten());
    return NextResponse.json({ success: false, message: "No se pudo obtener la información de la caja" }, { status: 500 });
  }

  return NextResponse.json(parsed.data, { status: 200 });
}
