import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { resetWaiterPin } from "@/lib/db/auth";

const resetSchema = z.object({
  pin: z
    .string()
    .trim()
    .min(4, "El PIN debe tener al menos 4 dígitos")
    .max(12, "El PIN no puede exceder 12 dígitos")
    .regex(/^[0-9]+$/, "El PIN solo debe contener números"),
});

export async function POST(request: NextRequest, context: { params: Promise<{ waiterId: string }> }) {
  const { waiterId: waiterIdParam } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const waiterId = Number(waiterIdParam);
  if (!Number.isFinite(waiterId)) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const waiter = await resetWaiterPin(waiterId, parsed.data.pin);
    return NextResponse.json({ success: true, waiter });
  } catch (error) {
    console.error(`POST /api/waiters/${waiterId}/reset-pin`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el PIN";
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
