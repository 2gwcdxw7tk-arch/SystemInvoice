import { NextRequest, NextResponse } from "next/server";

import { getStockSummary } from "@/lib/db/inventory";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const article = searchParams.get("article") || undefined;
  const warehouse_code = searchParams.get("warehouse_code") || undefined;

  try {
    const items = await getStockSummary({ article, warehouse_code });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/existencias error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener existencias" }, { status: 500 });
  }
}
