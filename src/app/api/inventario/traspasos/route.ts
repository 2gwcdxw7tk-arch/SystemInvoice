import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import { registerTransferSchema } from "@/lib/schemas/inventory";

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar traspasos");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const article = searchParams.get("article") || undefined;
  const fromWarehouse = searchParams.get("fromWarehouse") || undefined;
  const toWarehouse = searchParams.get("toWarehouse") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  try {
    const items = await inventoryService.listTransfers({
      article,
      from_warehouse_code: fromWarehouse,
      to_warehouse_code: toWarehouse,
      from,
      to,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/traspasos error", error);
    return NextResponse.json({ success: false, message: "No se pudo consultar el historial de traspasos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede registrar traspasos");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = registerTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const payload = parsed.data;
    const normalized = {
      from_warehouse_code: payload.from_warehouse_code.trim(),
      to_warehouse_code: payload.to_warehouse_code.trim(),
      occurred_at: payload.occurred_at?.trim() || undefined,
      authorized_by: payload.authorized_by?.trim() || undefined,
      requested_by: payload.requested_by?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
      reference: payload.reference?.trim() || undefined,
      lines: payload.lines.map((line: { article_code: string; quantity: string | number; unit: "STORAGE" | "RETAIL"; notes?: string }) => ({
        article_code: line.article_code.trim(),
        quantity: line.quantity,
        unit: line.unit,
        notes: line.notes?.trim() || undefined,
      })),
    } as const;
    // Note: Distinct warehouse validation is now in the schema via refine()
    const result = await inventoryService.registerTransfer(normalized);
    return NextResponse.json({ transaction_id: result.id, transaction_code: result.transactionCode }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/inventario/traspasos error", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar el traspaso";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
