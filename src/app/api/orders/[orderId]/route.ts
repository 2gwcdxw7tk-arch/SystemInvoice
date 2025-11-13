import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cancelOrder, updateOrderGuests, updateOrderNotes } from "@/lib/db/orders";

const patchSchema = z
  .object({
    notes: z.string().trim().max(500).nullable().optional(),
    guests: z.number().int().positive().max(30).nullable().optional(),
    status: z.enum(["CANCELLED"]).optional(),
  })
  .refine((value) => value.notes !== undefined || value.guests !== undefined || value.status !== undefined, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export async function PATCH(request: NextRequest, { params }: { params: { orderId: string } }) {
  const orderId = Number(params.orderId);
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
      await cancelOrder(orderId);
    }
    if (payload.notes !== undefined) {
      await updateOrderNotes(orderId, payload.notes ?? null);
    }
    if (payload.guests !== undefined) {
      await updateOrderGuests(orderId, payload.guests ?? null);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PATCH /api/orders/${orderId} error`, error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el pedido" }, { status: 500 });
  }
}
