import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { TableZoneService } from "@/lib/services/TableZoneService";
import { TableZoneRepository } from "@/lib/repositories/TableZoneRepository";

const tableZoneService = new TableZoneService(new TableZoneRepository());

const upsertSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar zonas");
  if ("response" in access) return access.response;

  try {
    const items = await tableZoneService.listZones({ includeInactive: true });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/zonas", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las zonas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede administrar zonas");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { id, name, isActive } = parsed.data;
  try {
    if (!id) {
      if (!name) {
        return NextResponse.json({ success: false, message: "El nombre es obligatorio" }, { status: 400 });
      }
      const zone = await tableZoneService.createZone({ name, isActive });
      return NextResponse.json({ zone }, { status: 201 });
    }

    if (name === undefined && isActive === undefined) {
      return NextResponse.json({ success: false, message: "No hay cambios para aplicar" }, { status: 400 });
    }

    const zone = await tableZoneService.updateZone(id, { name, isActive });
    return NextResponse.json({ zone }, { status: 200 });
  } catch (error) {
    console.error("POST /api/preferencias/zonas", error);
    const message = error instanceof Error ? error.message : "No se pudo guardar la zona";
    const status = message.includes("existe") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
