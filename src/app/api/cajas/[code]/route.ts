import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { env } from "@/lib/env";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const updateCashRegisterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "El nombre debe tener al menos 3 caracteres")
      .max(120, "El nombre no puede exceder 120 caracteres")
      .optional(),
    warehouse_code: z
      .string()
      .trim()
      .min(2, "Selecciona un almacén válido")
      .max(30, "El código de almacén no puede exceder 30 caracteres")
      .optional(),
    allow_manual_warehouse_override: z.boolean().optional(),
    is_active: z.boolean().optional(),
    notes: z
      .string()
      .max(250, "Las notas no pueden exceder 250 caracteres")
      .optional()
      .or(z.literal(""))
      .nullable(),
    default_customer_code: z
      .union([
        z.string().trim().min(0).max(50),
        z.null(),
      ])
      .optional(),
  })
  .refine(
    (data) =>
      typeof data.name !== "undefined" ||
      typeof data.warehouse_code !== "undefined" ||
      typeof data.allow_manual_warehouse_override !== "undefined" ||
      typeof data.is_active !== "undefined" ||
      typeof data.notes !== "undefined" ||
      typeof data.default_customer_code !== "undefined",
    {
      message: "No hay cambios para aplicar",
      path: [],
    }
  );

type RouteContext = { params: Promise<{ code: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const sessionResult = await requireAdministrator(request, "Solo un administrador puede modificar cajas");
  if ("response" in sessionResult) return sessionResult.response;

  const params = await context.params;
  const code = params?.code?.trim();
  if (!code) {
    return NextResponse.json({ success: false, message: "Código de caja inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateCashRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;
    const allowDefaultCustomer = env.features.retailModeEnabled;
    const rawDefaultCustomerCode =
      typeof data.default_customer_code === "string"
        ? data.default_customer_code.trim().length > 0
          ? data.default_customer_code.trim().toUpperCase()
          : null
        : data.default_customer_code;
    const sanitizedDefaultCustomerCode = allowDefaultCustomer ? rawDefaultCustomerCode : undefined;
    const item = await cashRegisterService.updateCashRegister(code, {
      name: data.name,
      warehouseCode: data.warehouse_code,
      allowManualWarehouseOverride: data.allow_manual_warehouse_override,
      isActive: data.is_active,
      notes: data.notes != null && data.notes.trim().length > 0 ? data.notes.trim() : data.notes === null ? null : undefined,
      defaultCustomerCode: sanitizedDefaultCustomerCode,
    });
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error(`PATCH /api/cajas/${code}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la caja";
    const status = /(licenci|tope)/i.test(message)
      ? 409
      : /no existe/i.test(message)
        ? 404
        : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
