import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { env } from "@/lib/env";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const createCashRegisterSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(30, "El código no puede exceder 30 caracteres"),
  name: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres"),
  warehouse_code: z
    .string()
    .trim()
    .min(2, "Debes seleccionar un almacén")
    .max(30, "El código de almacén no puede exceder 30 caracteres"),
  allow_manual_warehouse_override: z.boolean().optional(),
  notes: z
    .string()
    .max(250, "Las notas no pueden exceder 250 caracteres")
    .optional()
    .or(z.literal(""))
    .nullable(),
  default_customer_code: z
    .union([
      z.string().trim().max(50),
      z.literal(""),
      z.null(),
    ])
    .optional(),
});

export async function GET(request: NextRequest) {
  const sessionResult = await requireAdministrator(request, "Solo un administrador puede consultar las cajas");
  if ("response" in sessionResult) return sessionResult.response;

  try {
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
    const items = await cashRegisterService.listCashRegisters({ includeInactive });
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("GET /api/cajas", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las cajas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const sessionResult = await requireAdministrator(request, "Solo un administrador puede crear cajas");
  if ("response" in sessionResult) return sessionResult.response;

  const body = await request.json().catch(() => null);
  const parsed = createCashRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;
    const allowDefaultCustomer = env.features.retailModeEnabled;
    const resolvedDefaultCustomerCode =
      typeof payload.default_customer_code === "string"
        ? payload.default_customer_code.trim().length > 0
          ? payload.default_customer_code.trim().toUpperCase()
          : null
        : payload.default_customer_code ?? null;
    const item = await cashRegisterService.createCashRegister({
      code: payload.code,
      name: payload.name,
      warehouseCode: payload.warehouse_code,
      allowManualWarehouseOverride: payload.allow_manual_warehouse_override ?? false,
      notes: payload.notes && payload.notes.trim().length > 0 ? payload.notes.trim() : null,
      defaultCustomerCode: allowDefaultCustomer ? resolvedDefaultCustomerCode ?? undefined : undefined,
    });
    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cajas", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la caja";
    const status = /(existe|duplic|licenci|tope)/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
