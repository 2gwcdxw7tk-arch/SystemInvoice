import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getKitComponents, upsertKitComponents } from "@/lib/db/articleKits";

const upsertSchema = z.object({
  kit_article_code: z.string().trim().min(1).max(40),
  components: z.array(z.object({
    component_article_code: z.string().trim().min(1).max(40),
    component_qty_retail: z.number().positive(),
  })).min(1),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const kit_article_code = searchParams.get("kit_article_code");
  if (!kit_article_code) return NextResponse.json({ success: false, message: "Falta kit_article_code" }, { status: 400 });
  try {
    const items = await getKitComponents(kit_article_code);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/kits error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener armado" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const res = await upsertKitComponents(parsed.data.kit_article_code, parsed.data.components);
    return NextResponse.json({ updated: res.count }, { status: 200 });
  } catch (error) {
    console.error("POST /api/kits error", error);
    return NextResponse.json({ success: false, message: "No se pudo guardar armado" }, { status: 500 });
  }
}
