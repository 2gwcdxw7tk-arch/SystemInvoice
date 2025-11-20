import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { sequenceService } from "@/lib/services/SequenceService";

const transactionTypeSchema = z.enum(["PURCHASE", "CONSUMPTION", "ADJUSTMENT", "TRANSFER"]);

const assignmentSchema = z.object({
  transactionType: transactionTypeSchema,
  sequenceCode: z
    .union([z.string().trim().min(1).max(64), z.literal(null)])
    .optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar consecutivos de inventario");
  if ("response" in access) return access.response;

  try {
    const items = await sequenceService.listInventoryAssignments();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/consecutivos/inventario", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las asignaciones de inventario" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede asignar consecutivos de inventario");
  if ("response" in access) return access.response;

  const payload = await request.json().catch(() => null);
  const parsed = assignmentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { transactionType, sequenceCode } = parsed.data;

  try {
    await sequenceService.setInventorySequence({
      transactionType,
      sequenceCode: sequenceCode ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/preferencias/consecutivos/inventario", error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la asignación";
    const status = /no soportado/i.test(message) ? 400 : /existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
