import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getWaiterTable, storeWaiterTableOrder } from "@/lib/services/TableService";
import { OrderService } from "@/lib/services/orders/OrderService";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";
import { waiterService } from "@/lib/services/WaiterService";

const orderLineSchema = z.object({
  articleCode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  unitPrice: z.number().finite().nullable(),
  quantity: z.number().int().positive(),
  notes: z.string().trim().max(200).optional(),
});

const updatePayloadSchema = z.object({
  pending_items: z.array(orderLineSchema),
  sent_items: z.array(orderLineSchema),
});

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, context: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "waiter") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const waiterId = Number(session.sub);
  if (!Number.isFinite(waiterId)) {
    return NextResponse.json({ success: false, message: "Identificador de mesero inválido" }, { status: 400 });
  }

  try {
    const table = await getWaiterTable(tableId);
    if (!table) {
      return NextResponse.json({ success: false, message: "Mesa no encontrada" }, { status: 404 });
    }
    if (table.assigned_waiter_id && table.assigned_waiter_id !== waiterId) {
      return NextResponse.json({ success: false, message: "La mesa está asignada a otro mesero" }, { status: 409 });
    }
    return NextResponse.json(
      { success: true, table },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error(`GET /api/meseros/tables/${tableId}`, error);
    return NextResponse.json({ success: false, message: "No se pudo consultar la mesa" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "waiter") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const waiterId = Number(session.sub);
  if (!Number.isFinite(waiterId)) {
    return NextResponse.json({ success: false, message: "Identificador de mesero inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const orderService = new OrderService(new OrderRepository());
    const previous = await getWaiterTable(tableId);
    const waiter = await waiterService.getWaiterById(waiterId);
    if (!waiter) {
      return NextResponse.json({ success: false, message: "Mesero no encontrado" }, { status: 404 });
    }
    const table = await storeWaiterTableOrder({
      tableId,
      waiterId: waiter.id,
      waiterName: waiter.fullName,
      pendingItems: parsed.data.pending_items,
      sentItems: parsed.data.sent_items,
    });
    const previousSentSignature = JSON.stringify(previous?.order?.sent_items ?? []);
    const currentSentSignature = JSON.stringify(table.order?.sent_items ?? []);

    let responseTable = table;
    if (previousSentSignature !== currentSentSignature) {
      await orderService.syncWaiterOrderForTable({
        tableId,
        waiterId: waiter.id,
        waiterCode: waiter.code,
        waiterName: waiter.fullName,
        sentItems: (table.order?.sent_items ?? []).map((it) => ({
          articleCode: it.articleCode,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice ?? 0,
          notes: it.notes ?? null,
        })),
      });
      const refreshed = await getWaiterTable(tableId);
      if (refreshed) {
        responseTable = refreshed;
      }
    }

    return NextResponse.json(
      { success: true, table: responseTable },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error(`PATCH /api/meseros/tables/${tableId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo guardar la comanda";
    const status = message.includes("otro mesero") ? 409 : message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
