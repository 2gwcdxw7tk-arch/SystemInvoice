import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listInventoryAlerts, setInventoryAlertStatus, upsertInventoryAlert } from "@/lib/db/alerts";

const upsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(200).optional().nullable(),
  threshold: z.number().nonnegative(),
  unitCode: z.string().trim().min(1).max(20).optional().nullable(),
  notifyChannel: z.string().trim().min(1).max(200).optional().nullable(),
  isActive: z.boolean().optional(),
});

const statusSchema = z.object({
  id: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function GET() {
  try {
    const items = await listInventoryAlerts();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/alertas", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las alertas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await upsertInventoryAlert(parsed.data);
    return NextResponse.json({ id: result.id }, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    console.error("POST /api/preferencias/alertas", error);
    return NextResponse.json({ success: false, message: "No se pudo guardar la alerta" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await setInventoryAlertStatus(parsed.data.id, parsed.data.isActive);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/preferencias/alertas", error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el estado" }, { status: 500 });
  }
}
