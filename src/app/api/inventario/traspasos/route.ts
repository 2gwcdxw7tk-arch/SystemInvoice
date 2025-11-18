import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";

const numericInput = z.union([z.number(), z.string().trim().min(1)]);
const quantitySchema = numericInput.refine((value) => {
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
  return Number.isFinite(num) && num > 0;
}, { message: "La cantidad debe ser mayor a 0" });

const transferSchema = z.object({
  from_warehouse_code: z.string().trim().min(1).max(20),
  to_warehouse_code: z.string().trim().min(1).max(20),
  occurred_at: z.string().trim().optional(),
  authorized_by: z.string().trim().max(80).optional(),
  requested_by: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(400).optional(),
  reference: z.string().trim().max(120).optional(),
  lines: z.array(z.object({
    article_code: z.string().trim().min(1).max(40),
    quantity: quantitySchema,
    unit: z.enum(["STORAGE", "RETAIL"]),
    notes: z.string().trim().max(300).optional(),
  })).min(1),
});

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
  const parsed = transferSchema.safeParse(body);
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
      lines: payload.lines.map((line) => ({
        article_code: line.article_code.trim(),
        quantity: line.quantity,
        unit: line.unit,
        notes: line.notes?.trim() || undefined,
      })),
    } as const;
    if (normalized.from_warehouse_code === normalized.to_warehouse_code) {
      return NextResponse.json({ success: false, message: "El almacén origen y destino deben ser distintos" }, { status: 400 });
    }
    const result = await inventoryService.registerTransfer(normalized);
    return NextResponse.json({ transaction_id: result.id, transaction_code: result.transactionCode }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/inventario/traspasos error", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar el traspaso";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
