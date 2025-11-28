import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { customerService } from "@/lib/services/cxc/CustomerService";

const moneyField = (min: number) =>
  z.preprocess((value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.trim().replace(/,/g, "."));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }, z.number().min(min));

const optionalNullableString = z
  .union([z.string().trim().max(160), z.literal(""), z.literal(null)])
  .optional()
  .transform((value) => {
    if (typeof value === "undefined") return undefined;
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  });

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  tradeName: optionalNullableString,
  taxId: optionalNullableString,
  email: optionalNullableString,
  phone: optionalNullableString,
  mobilePhone: optionalNullableString,
  billingAddress: optionalNullableString,
  city: optionalNullableString,
  state: optionalNullableString,
  countryCode: z.string().trim().length(2).optional(),
  postalCode: optionalNullableString,
  paymentTermId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
  paymentTermCode: z.union([z.string().trim().max(32), z.literal(null)]).optional(),
  creditLimit: moneyField(0).optional(),
  creditUsed: moneyField(0).optional(),
  creditOnHold: moneyField(0).optional(),
  creditStatus: z.enum(["ACTIVE", "ON_HOLD", "BLOCKED"]).optional(),
  creditHoldReason: optionalNullableString,
  isActive: z.boolean().optional(),
  notes: optionalNullableString,
});

type RouteContext = { params: { code: string } };

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMERS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DISPUTES_MANAGE,
];

function getCode(context: RouteContext): string {
  const raw = context.params?.code ?? "";
  return decodeURIComponent(raw).trim();
}

export async function GET(request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar clientes",
  });
  if ("response" in access) {
    return access.response;
  }

  const code = getCode(context);
  if (!code) {
    return NextResponse.json({ success: false, message: "Debe indicar el código" }, { status: 400 });
  }

  try {
    const customer = await customerService.getByCode(code);
    if (!customer) {
      return NextResponse.json({ success: false, message: "El cliente indicado no existe" }, { status: 404 });
    }
    return NextResponse.json({ customer });
  } catch (error) {
    console.error("GET /api/cxc/clientes/[code]", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener el cliente" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMERS_MANAGE],
    message: "No tienes permisos para actualizar clientes",
  });
  if ("response" in access) {
    return access.response;
  }

  const code = getCode(context);
  if (!code) {
    return NextResponse.json({ success: false, message: "Debe indicar el código" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateCustomerSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const hasChanges = Object.values(data).some((value) => typeof value !== "undefined");
  if (!hasChanges) {
    return NextResponse.json({ success: false, message: "Debe indicar al menos un campo" }, { status: 400 });
  }

  try {
    const customer = await customerService.update(code, {
      name: data.name,
      tradeName: data.tradeName,
      taxId: data.taxId,
      email: data.email,
      phone: data.phone,
      mobilePhone: data.mobilePhone,
      billingAddress: data.billingAddress,
      city: data.city,
      state: data.state,
      countryCode: data.countryCode,
      postalCode: data.postalCode,
      paymentTermId:
        typeof data.paymentTermId === "number"
          ? data.paymentTermId
          : data.paymentTermId === null
            ? null
            : undefined,
      paymentTermCode:
        typeof data.paymentTermCode === "string"
          ? data.paymentTermCode
          : data.paymentTermCode === null
            ? null
            : undefined,
      creditLimit: data.creditLimit,
      creditUsed: data.creditUsed,
      creditOnHold: data.creditOnHold,
      creditStatus: data.creditStatus,
      creditHoldReason: data.creditHoldReason,
      isActive: data.isActive,
      notes: data.notes,
    });
    return NextResponse.json({ customer });
  } catch (error) {
    console.error("PATCH /api/cxc/clientes/[code]", error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el cliente";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
