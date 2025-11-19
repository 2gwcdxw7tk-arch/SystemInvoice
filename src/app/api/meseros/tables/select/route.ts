import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { claimWaiterTable, getWaiterTable } from "@/lib/services/TableService";
import { OrderService } from "@/lib/services/orders/OrderService";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";
import { waiterService } from "@/lib/services/WaiterService";

const payloadSchema = z.object({
  table_id: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest) {
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
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const orderService = new OrderService(new OrderRepository());
    const waiter = await waiterService.getWaiterById(waiterId);
    if (!waiter) {
      return NextResponse.json({ success: false, message: "Mesero no encontrado" }, { status: 404 });
    }
    const table = await claimWaiterTable({
      tableId: parsed.data.table_id,
      waiterId: waiter.id,
      waiterName: waiter.fullName,
    });
    await orderService.syncWaiterOrderForTable({
      tableId: table.id,
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
    const refreshed = await getWaiterTable(table.id);
    return NextResponse.json(
      { success: true, table: refreshed ?? table },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("POST /api/meseros/tables/select", error);
    const message = error instanceof Error ? error.message : "No se pudo asignar la mesa";
    const status = message.includes("otro mesero") ? 409 : message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
