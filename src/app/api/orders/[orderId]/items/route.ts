import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { OrderService } from "@/lib/services/orders/OrderService";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";

const orderService = new OrderService(new OrderRepository());

const bodySchema = z.object({
  article_code: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  modifiers: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().max(200).nullable().optional(),
});

export async function POST(request: NextRequest, context: { params: { orderId: string } }) {
  const { orderId: rawOrderId } = context.params;
  const orderId = Number(rawOrderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, message: "Identificador de pedido inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;
    await orderService.addOrderItem(orderId, {
      articleCode: payload.article_code,
      name: payload.description,
      quantity: payload.quantity,
      unitPrice: payload.unit_price,
      modifiers: payload.modifiers ?? [],
      notes: payload.notes ?? null,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(`POST /api/orders/${orderId}/items error`, error);
    return NextResponse.json({ success: false, message: "No se pudo agregar el artículo" }, { status: 500 });
  }
}
