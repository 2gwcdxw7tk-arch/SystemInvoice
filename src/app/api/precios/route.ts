import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listPriceLists, upsertPriceList, setArticlePrice } from "@/lib/db/prices";
import { requireAdministrator } from "@/lib/auth/access";

const priceListSchema = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(120).optional(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), is_active: z.boolean().optional() });
const setPriceSchema = z.object({ article_code: z.string().trim().min(1).max(40), price_list_code: z.string().trim().min(1).max(30), price: z.number().nonnegative(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar listas de precio");
  if ("response" in access) return access.response;

  try {
    const lists = await listPriceLists();
    return NextResponse.json({ lists });
  } catch (error) {
    console.error("GET /api/precios error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener listas de precios" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede administrar listas de precio");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Body inválido" }, { status: 400 });
  try {
    if (body.action === "price-list") {
      const parsed = priceListSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      const res = await upsertPriceList(parsed.data);
      return NextResponse.json({ id: res.id }, { status: 201 });
    }
    if (body.action === "set-price") {
      const parsed = setPriceSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      await setArticlePrice(parsed.data);
      return NextResponse.json({ success: true }, { status: 201 });
    }
    return NextResponse.json({ success: false, message: "Acción no soportada" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/precios error", error);
    return NextResponse.json({ success: false, message: "Error en operación de precios" }, { status: 500 });
  }
}
