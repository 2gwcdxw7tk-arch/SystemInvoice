import { NextResponse } from "next/server";

import { listWarehouses } from "@/lib/db/warehouses";

export async function GET() {
  try {
    const items = await listWarehouses();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/warehouses error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los almacenes" }, { status: 500 });
  }
}
