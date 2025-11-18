import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createTableDefinition, listAvailableTables, listTableAdminSnapshots } from "@/lib/services/TableService";

const createPayloadSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  zone_id: z.string().trim().min(1).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  try {
    const availableOnly = request.nextUrl.searchParams.get("available") === "true";
    const tables = availableOnly ? await listAvailableTables() : await listTableAdminSnapshots();
    return NextResponse.json({ success: true, tables });
  } catch (error) {
    console.error("GET /api/tables", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar las mesas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const table = await createTableDefinition({
      id: parsed.data.id,
      label: parsed.data.label,
      zoneId: parsed.data.zone_id ?? null,
      capacity: parsed.data.capacity ?? null,
      isActive: parsed.data.is_active ?? true,
    });
    return NextResponse.json({ success: true, table }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tables", error);
    const message = error instanceof Error ? error.message : "No se pudo crear la mesa";
    const status = message.includes("Ya existe") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
