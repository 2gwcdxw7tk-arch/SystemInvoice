import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { removeOrderItem, updateOrderItem } from "@/lib/db/orders";

const patchSchema = z
  .object({
    quantity: z.number().positive().optional(),
    unit_price: z.number().nonnegative().optional(),
    modifiers: z.array(z.string().trim().min(1)).optional(),
    notes: z.string().trim().max(200).nullable().optional(),
  })
  .refine((value) =>
    value.quantity !== undefined ||
    value.unit_price !== undefined ||
    value.modifiers !== undefined ||
    value.notes !== undefined,
  {
    message: "Debe especificar al menos un campo para actualizar",
  });

function parseIds(params: { orderId: string; itemId: string }) {
  const orderId = Number(params.orderId);
  const itemId = Number(params.itemId);
  if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
    return null;
  }
  return { orderId, itemId };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ orderId: string; itemId: string }> }) {
  const params = await context.params;
  const ids = parseIds(params);
  if (!ids) {
    return NextResponse.json({ success: false, message: "Identificadores inválidos" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;
    await updateOrderItem(ids.orderId, ids.itemId, {
      quantity: payload.quantity,
      unitPrice: payload.unit_price,
      modifiers: payload.modifiers,
      notes: payload.notes ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PATCH /api/orders/${ids.orderId}/items/${ids.itemId} error`, error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el artículo" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ orderId: string; itemId: string }> }) {
  const params = await context.params;
  const ids = parseIds(params);
  if (!ids) {
    return NextResponse.json({ success: false, message: "Identificadores inválidos" }, { status: 400 });
  }

  try {
    await removeOrderItem(ids.orderId, ids.itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/orders/${ids.orderId}/items/${ids.itemId} error`, error);
    return NextResponse.json({ success: false, message: "No se pudo eliminar el artículo" }, { status: 500 });
  }
}
