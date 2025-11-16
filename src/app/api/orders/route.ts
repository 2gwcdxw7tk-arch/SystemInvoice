import { NextResponse } from "next/server";
import { OrderService } from "@/lib/services/orders/OrderService";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";

const orderService = new OrderService(new OrderRepository());

export async function GET() {
  try {
    const orders = await orderService.listOpenOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("GET /api/orders error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los pedidos" }, { status: 500 });
  }
}
