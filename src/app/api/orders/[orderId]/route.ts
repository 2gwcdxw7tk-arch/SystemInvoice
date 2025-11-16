import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { OrderService } from "@/lib/services/orders/OrderService";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";

const orderService = new OrderService(new OrderRepository());

const patchSchema = z
  .object({
    notes: z.string().trim().max(500).nullable().optional(),
    guests: z.number().int().positive().max(30).nullable().optional(),
    status: z.enum(["CANCELLED"]).optional(),
  })
  .refine((value) => value.notes !== undefined || value.guests !== undefined || value.status !== undefined, {
    message: "Debe enviar al menos un campo para actualizar",
  });

type OrderRouteParams = { orderId: string };

export async function PATCH(request: NextRequest, context: { params: Promise<OrderRouteParams> }) {
  const { orderId: rawOrderId } = await context.params;
  const orderId = Number(rawOrderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, message: "Identificador de pedido inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;
    if (payload.status === "CANCELLED") {
      await orderService.cancelOrder(orderId);
    }
    if (payload.notes !== undefined) {
      await orderService.updateOrderNotes(orderId, payload.notes ?? null);
    }
    if (payload.guests !== undefined) {
      await orderService.updateOrderGuests(orderId, payload.guests ?? null);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PATCH /api/orders/${orderId} error`, error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el pedido" }, { status: 500 });
  }
}
