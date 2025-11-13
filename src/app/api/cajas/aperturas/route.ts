import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { openCashRegisterSession } from "@/lib/db/cash-registers";

const payloadSchema = z.object({
  cash_register_code: z.string().trim().min(1, "Selecciona una caja"),
  opening_amount: z.number().min(0, "El monto de apertura no puede ser negativo"),
  opening_notes: z.string().max(400).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canOpen =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.includes("cash.register.open");

  if (!canOpen) {
    return NextResponse.json({ success: false, message: "No tienes permisos para abrir cajas" }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await openCashRegisterSession({
      adminUserId: Number(session.sub),
      cashRegisterCode: parsed.data.cash_register_code,
      openingAmount: parsed.data.opening_amount,
      openingNotes: parsed.data.opening_notes ?? null,
    });

    return NextResponse.json(
      {
        success: true,
        session: {
          id: result.id,
          openingAmount: result.openingAmount,
          openingAt: result.openingAt,
          openingNotes: result.openingNotes,
          status: result.status,
          cashRegister: result.cashRegister,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo abrir la caja";
    const status = /ya (tienes|existe)/i.test(message) ? 409 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
