import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { deleteTableZone, updateTableZone } from "@/lib/db/tables";

const updatePayloadSchema = z.object({
  name: z.string().trim().min(1).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const zone = await updateTableZone(zoneId, {
      name: parsed.data.name,
      isActive: parsed.data.is_active,
    });
    return NextResponse.json({ success: true, zone });
  } catch (error) {
    console.error(`PATCH /api/tables/zones/${zoneId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la zona";
    const status = message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  try {
    await deleteTableZone(zoneId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/tables/zones/${zoneId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo eliminar la zona";
    const status = message.includes("No puedes eliminar") ? 409 : message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
