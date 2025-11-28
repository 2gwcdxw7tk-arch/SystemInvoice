import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { paymentTermService } from "@/lib/services/cxc/PaymentTermService";

const numericField = (min: number, max?: number) =>
  z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }, max === undefined ? z.number().int().min(min) : z.number().int().min(min).max(max));

const createSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  description: z
    .union([z.string().trim().max(240), z.literal(null)])
    .optional(),
  days: numericField(0, 365),
  graceDays: z
    .union([numericField(0, 90), z.literal(null)])
    .optional(),
  isActive: z.boolean().optional(),
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.PAYMENT_TERMS_MANAGE,
  CXC_PERMISSIONS.CUSTOMERS_MANAGE,
];

export async function GET(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar condiciones de pago",
  });
  if ("response" in access) {
    return access.response;
  }

  const includeInactiveRaw = request.nextUrl.searchParams.get("includeInactive");
  const includeInactive = includeInactiveRaw ? ["1", "true", "yes"].includes(includeInactiveRaw.toLowerCase()) : false;

  try {
    const items = await paymentTermService.list({ includeInactive });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/terminos-pago", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron obtener las condiciones de pago" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.PAYMENT_TERMS_MANAGE],
    message: "Solo usuarios autorizados pueden crear condiciones de pago",
  });
  if ("response" in access) {
    return access.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { code, name, description, days, graceDays, isActive } = parsed.data;

  try {
    const term = await paymentTermService.create({
      code,
      name,
      description: typeof description === "string" ? description : null,
      days,
      graceDays: typeof graceDays === "number" ? graceDays : graceDays ?? undefined,
      isActive,
    });
    return NextResponse.json({ term }, { status: 201 });
  } catch (error) {
    console.error("POST /api/preferencias/terminos-pago", error);
    const message = error instanceof Error ? error.message : "No se pudo crear la condición de pago";
    const status = /existe/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
