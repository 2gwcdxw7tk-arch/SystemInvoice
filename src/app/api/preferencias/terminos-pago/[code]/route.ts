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

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.union([z.string().trim().max(240), z.literal(null)]).optional(),
    days: numericField(0, 365).optional(),
    graceDays: z.union([numericField(0, 90), z.literal(null)]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Debe indicar al menos un campo a actualizar" });

type RouteContext = { params: Promise<{ code: string }> };

async function getCode(context: RouteContext): Promise<string> {
  const { code } = await context.params;
  return decodeURIComponent(code).trim().toUpperCase();
}

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.PAYMENT_TERMS_MANAGE,
  CXC_PERMISSIONS.CUSTOMERS_MANAGE,
];

export async function GET(_request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(_request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar condiciones de pago",
  });
  if ("response" in access) {
    return access.response;
  }

  const code = await getCode(context);
  if (!code) {
    return NextResponse.json({ success: false, message: "Debe indicar el código" }, { status: 400 });
  }

  try {
    const term = await paymentTermService.getByCode(code);
    if (!term) {
      return NextResponse.json({ success: false, message: "La condición indicada no existe" }, { status: 404 });
    }
    return NextResponse.json({ term });
  } catch (error) {
    console.error("GET /api/preferencias/terminos-pago/[code]", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener la condición" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.PAYMENT_TERMS_MANAGE],
    message: "Solo usuarios autorizados pueden actualizar condiciones de pago",
  });
  if ("response" in access) {
    return access.response;
  }

  const code = await getCode(context);
  if (!code) {
    return NextResponse.json({ success: false, message: "Debe indicar el código" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, description, days, graceDays, isActive } = parsed.data;

  try {
    const term = await paymentTermService.update(code, {
      name,
      description: typeof description === "string" ? description : description ?? undefined,
      days,
      graceDays: typeof graceDays === "number" ? graceDays : graceDays ?? undefined,
      isActive,
    });
    return NextResponse.json({ term });
  } catch (error) {
    console.error("PATCH /api/preferencias/terminos-pago/[code]", error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la condición";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.PAYMENT_TERMS_MANAGE],
    message: "Solo usuarios autorizados pueden eliminar condiciones de pago",
  });
  if ("response" in access) {
    return access.response;
  }

  const code = await getCode(context);
  if (!code) {
    return NextResponse.json({ success: false, message: "Debe indicar el código" }, { status: 400 });
  }

  try {
    await paymentTermService.delete(code);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/preferencias/terminos-pago/[code]", error);
    const message = error instanceof Error ? error.message : "No se pudo eliminar la condición";
    const status = /no existe/i.test(message) ? 404 : /clientes asociados/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
