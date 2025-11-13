import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertArticle, getArticles, getArticleByCode, deleteArticle } from "@/lib/db/articles";
import { listUnits } from "@/lib/db/units";

const articleInputSchema = z.object({
  article_code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  classification_full_code: z.string().trim().max(24).nullable().optional(),
  storage_unit_id: z.number().int().positive(),
  retail_unit_id: z.number().int().positive(),
  conversion_factor: z.number().positive(),
  article_type: z.enum(["TERMINADO", "KIT"]),
  default_warehouse_id: z.number().int().positive().nullable().optional(),
  classification_level1_id: z.number().int().positive().nullable().optional(),
  classification_level2_id: z.number().int().positive().nullable().optional(),
  classification_level3_id: z.number().int().positive().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const article_code = searchParams.get("article_code");
  const price_list_code = searchParams.get("price_list_code") || undefined;
  const unit = (searchParams.get("unit") as "RETAIL" | "STORAGE" | null) || undefined;
  const on_date = searchParams.get("on_date") || undefined;
  const include_units = searchParams.get("include_units") === "1";
  try {
    if (article_code) {
      const item = await getArticleByCode(article_code);
      if (!item) return NextResponse.json({ success: false, message: "Artículo no encontrado" }, { status: 404 });
      return NextResponse.json({ item });
    }
    const data = await getArticles({ price_list_code, unit, on_date });
    if (include_units) {
      const units = await listUnits();
      return NextResponse.json({ items: data, units });
    }
    return NextResponse.json({ items: data });
  } catch (error) {
    console.error("GET /api/articulos error", error);
    return NextResponse.json({ success: false, message: "No se pudo recuperar artículos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = articleInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await upsertArticle(parsed.data);
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/articulos error", error);
    return NextResponse.json({ success: false, message: "No se pudo guardar artículo" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const article_code = searchParams.get("article_code");
  if (!article_code) return NextResponse.json({ success: false, message: "Falta article_code" }, { status: 400 });
  try {
    const res = await deleteArticle(article_code);
    if (!res.deleted) return NextResponse.json({ success: false, message: "Artículo no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/articulos error", error);
    return NextResponse.json({ success: false, message: "No se pudo eliminar artículo" }, { status: 500 });
  }
}
