import { NextResponse } from "next/server";

import { listOpenOrders } from "@/lib/db/orders";

export async function GET() {
  try {
    const orders = await listOpenOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("GET /api/orders error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los pedidos" }, { status: 500 });
  }
}
