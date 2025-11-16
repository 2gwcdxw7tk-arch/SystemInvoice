import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { NotificationChannelRepository } from "@/lib/repositories/NotificationChannelRepository";
import { NotificationChannelService } from "@/lib/services/NotificationChannelService";

const notificationChannelService = new NotificationChannelService(new NotificationChannelRepository());

const upsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  channelType: z.string().trim().min(1).max(40),
  target: z.string().trim().min(3).max(200),
  preferences: z.string().trim().min(1).max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const statusSchema = z.object({
  id: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function GET() {
  try {
    const items = await notificationChannelService.listNotificationChannels();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/notificaciones", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los canales" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await notificationChannelService.upsertNotificationChannel(parsed.data);
    return NextResponse.json({ id: result.id }, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    console.error("POST /api/preferencias/notificaciones", error);
    return NextResponse.json({ success: false, message: "No se pudo guardar el canal" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await notificationChannelService.setNotificationChannelStatus(parsed.data.id, parsed.data.isActive);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/preferencias/notificaciones", error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el estado" }, { status: 500 });
  }
}
