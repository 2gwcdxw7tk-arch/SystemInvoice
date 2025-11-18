import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unitService } from "@/lib/services/UnitService";
import { requireAdministrator } from "@/lib/auth/access";

const unitSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar unidades");
  if ("response" in access) return access.response;

  try {
    const items = await unitService.listUnits();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/unidades error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener unidades" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede administrar unidades");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = unitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const res = await unitService.upsertUnit(parsed.data);
    return NextResponse.json({ id: res.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/unidades error", error);
    return NextResponse.json({ success: false, message: "No se pudo guardar unidad" }, { status: 500 });
  }
}
