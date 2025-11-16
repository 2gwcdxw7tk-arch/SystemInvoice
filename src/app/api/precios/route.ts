import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPriceListByCode,
  listPriceListItems,
  listPriceLists,
  removeArticleFromPriceList,
  setArticlePrice,
  setArticlePriceActive,
  setPriceListActiveState,
  setPriceListAsDefault,
  upsertPriceList,
} from "@/lib/db/prices";
import { forbiddenResponse, requireAdministrator, requireSession, isAdministrator, isFacturador, hasPermission } from "@/lib/auth/access";

const priceListSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(200).optional(),
  currency_code: z.string().trim().length(3).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

const togglePriceListSchema = z.object({
  code: z.string().trim().min(1).max(30),
  is_active: z.boolean(),
});

const setDefaultSchema = z.object({
  code: z.string().trim().min(1).max(30),
});

const setPriceSchema = z.object({
  article_code: z.string().trim().min(1).max(40),
  price_list_code: z.string().trim().min(1).max(30),
  price: z.number().nonnegative(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const toggleArticleSchema = z.object({
  price_list_code: z.string().trim().min(1).max(30),
  article_code: z.string().trim().min(1).max(40),
  is_active: z.boolean(),
});

const deleteArticleSchema = z.object({
  price_list_code: z.string().trim().min(1).max(30),
  article_code: z.string().trim().min(1).max(40),
});

export async function GET(request: NextRequest) {
  const access = await requireSession(request);
  if ("response" in access) return access.response;

  const { session } = access;
  const canConsult =
    isAdministrator(session) ||
    isFacturador(session) ||
    hasPermission(session, "invoice.issue") ||
    hasPermission(session, "cash.register.open");

  if (!canConsult) {
    return forbiddenResponse("No tienes permisos para consultar listas de precio");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code")?.trim().toUpperCase() ?? null;
    const includeRaw = searchParams.get("include") ?? "";
    const includeItems = includeRaw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .includes("items");

    if (code) {
      const list = await getPriceListByCode(code);
      if (!list) {
        return NextResponse.json({ success: false, message: "Lista no encontrada" }, { status: 404 });
      }
      const items = includeItems ? await listPriceListItems(code) : undefined;
      return NextResponse.json({ list, items });
    }

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
      return NextResponse.json({ success: true, id: res.id });
    }

    if (body.action === "toggle-active") {
      const parsed = togglePriceListSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      await setPriceListActiveState(parsed.data.code, parsed.data.is_active);
      return NextResponse.json({ success: true });
    }

    if (body.action === "set-default") {
      const parsed = setDefaultSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      await setPriceListAsDefault(parsed.data.code);
      return NextResponse.json({ success: true });
    }
    if (body.action === "set-price") {
      const parsed = setPriceSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      await setArticlePrice(parsed.data);
      return NextResponse.json({ success: true });
    }

    if (body.action === "toggle-article") {
      const parsed = toggleArticleSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      await setArticlePriceActive(parsed.data);
      return NextResponse.json({ success: true });
    }

    if (body.action === "delete-article") {
      const parsed = deleteArticleSchema.safeParse(body.payload);
      if (!parsed.success) return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
      await removeArticleFromPriceList(parsed.data);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, message: "Acción no soportada" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/precios error", error);
    return NextResponse.json({ success: false, message: "Error en operación de precios" }, { status: 500 });
  }
}
