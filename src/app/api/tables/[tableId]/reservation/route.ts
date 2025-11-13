import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { releaseTableReservation, reserveTable } from "@/lib/db/tables";

const reservationSchema = z.object({
  reserved_by: z.string().trim().min(1),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
  party_size: z.number().int().positive().nullable().optional(),
  scheduled_for: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(200).nullable().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const table = await reserveTable({
      tableId,
      reservedBy: parsed.data.reserved_by,
      contactName: parsed.data.contact_name ?? null,
      contactPhone: parsed.data.contact_phone ?? null,
      partySize: parsed.data.party_size ?? null,
      scheduledFor: parsed.data.scheduled_for ?? null,
      notes: parsed.data.notes ?? null,
    });
    return NextResponse.json({ success: true, table }, { status: 201 });
  } catch (error) {
    console.error(`POST /api/tables/${tableId}/reservation`, error);
    const message = error instanceof Error ? error.message : "No se pudo reservar la mesa";
    const status = message.includes("reservada") ? 409 : message.includes("ocupada") ? 409 : message.includes("inactiva") ? 400 : 500;
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
    const table = await releaseTableReservation(tableId);
    return NextResponse.json({ success: true, table });
  } catch (error) {
    console.error(`DELETE /api/tables/${tableId}/reservation`, error);
    return NextResponse.json({ success: false, message: "No se pudo liberar la reservación" }, { status: 500 });
  }
}
