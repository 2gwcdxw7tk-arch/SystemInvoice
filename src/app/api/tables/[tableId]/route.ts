import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { deleteTableDefinition, getTableAdminSnapshot, updateTableDefinition } from "@/lib/services/TableService";

const updatePayloadSchema = z.object({
  label: z.string().trim().min(1).optional(),
  zone_id: z.string().trim().min(1).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  try {
    const table = await getTableAdminSnapshot(tableId);
    if (!table) {
      return NextResponse.json({ success: false, message: "Mesa no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true, table });
  } catch (error) {
    console.error(`GET /api/tables/${tableId}`, error);
    return NextResponse.json({ success: false, message: "No se pudo consultar la mesa" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await context.params;
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
    const table = await updateTableDefinition(tableId, {
      label: parsed.data.label,
      zoneId: parsed.data.zone_id ?? undefined,
      capacity: parsed.data.capacity ?? undefined,
      isActive: parsed.data.is_active ?? undefined,
    });
    return NextResponse.json({ success: true, table });
  } catch (error) {
    console.error(`PATCH /api/tables/${tableId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la mesa";
    const status = message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  try {
    await deleteTableDefinition(tableId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/tables/${tableId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo eliminar la mesa";
    const status = message.includes("No puedes eliminar") ? 409 : message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
