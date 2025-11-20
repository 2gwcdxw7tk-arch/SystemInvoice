import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { sequenceService } from "@/lib/services/SequenceService";

const assignmentSchema = z.object({
  cashRegisterCode: z.string().trim().min(1).max(30),
  sequenceCode: z
    .union([z.string().trim().min(1).max(64), z.literal(null)])
    .optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar consecutivos de caja");
  if ("response" in access) return access.response;

  try {
    const items = await sequenceService.listCashRegisterAssignments();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/consecutivos/cajas", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las asignaciones de cajas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede asignar consecutivos a cajas");
  if ("response" in access) return access.response;

  const payload = await request.json().catch(() => null);
  const parsed = assignmentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cashRegisterCode, sequenceCode } = parsed.data;

  try {
    const register = await sequenceService.setCashRegisterSequence({
      cashRegisterCode,
      sequenceCode: sequenceCode ?? null,
    });
    return NextResponse.json({ register });
  } catch (error) {
    console.error("POST /api/preferencias/consecutivos/cajas", error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la caja";
    const status = /no encontrada/i.test(message)
      ? 404
      : /no existe/i.test(message)
        ? 404
        : /no pertenece a facturación/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
