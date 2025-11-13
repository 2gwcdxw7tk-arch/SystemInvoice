import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listUnits, upsertUnit } from "@/lib/db/units";

const unitSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  is_active: z.boolean().optional(),
});

export async function GET() {
  try {
    const items = await listUnits();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/unidades error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener unidades" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = unitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const res = await upsertUnit(parsed.data);
    return NextResponse.json({ id: res.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/unidades error", error);
    return NextResponse.json({ success: false, message: "No se pudo guardar unidad" }, { status: 500 });
  }
}
