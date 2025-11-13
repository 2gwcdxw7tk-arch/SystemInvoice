import { NextRequest, NextResponse } from "next/server";

import { listKardex } from "@/lib/db/inventory";
import { requireAdministrator } from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar el kardex");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const article = searchParams.get("article") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const warehouse_code = searchParams.get("warehouse_code") || undefined;

  try {
    const items = await listKardex({ article, from, to, warehouse_code });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/kardex error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener el kardex" }, { status: 500 });
  }
}
