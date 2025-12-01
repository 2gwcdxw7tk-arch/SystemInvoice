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
  .union([z.string().trim().max(160), z.literal(""), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value === "undefined") return undefined;
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  });

const createCustomerSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
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
  creditLimit: moneyField(0).default(0),
  creditUsed: moneyField(0).optional(),
  creditOnHold: moneyField(0).optional(),
  creditStatus: z.enum(["ACTIVE", "ON_HOLD", "BLOCKED"]).optional(),
  creditHoldReason: optionalNullableString,
  isActive: z.boolean().optional(),
  notes: optionalNullableString,
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMERS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DISPUTES_MANAGE,
];

const parseBoolean = (value: string | null): boolean => {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

export async function GET(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar clientes",
  });
  if ("response" in access) {
    return access.response;
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") ?? undefined;
  const limitValue = searchParams.get("limit");
  const summary = parseBoolean(searchParams.get("summary"));
  const includeInactive = parseBoolean(searchParams.get("includeInactive"));
  const limit = limitValue ? Number(limitValue) : undefined;

  try {
    if (summary) {
      const items = await customerService.listSummaries({ search: search ?? undefined, limit });
      return NextResponse.json({ items });
    }
    const items = await customerService.list({ search: search ?? undefined, includeInactive, limit });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/cxc/clientes", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron obtener los clientes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMERS_MANAGE],
    message: "No tienes permisos para crear clientes",
  });
  if ("response" in access) {
    return access.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = createCustomerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const customer = await customerService.create({
      code: data.code,
      name: data.name,
      tradeName: data.tradeName ?? null,
      taxId: data.taxId ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      mobilePhone: data.mobilePhone ?? null,
      billingAddress: data.billingAddress ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      countryCode: data.countryCode ?? undefined,
      postalCode: data.postalCode ?? null,
      paymentTermId: typeof data.paymentTermId === "number" ? data.paymentTermId : data.paymentTermId ?? undefined,
      paymentTermCode:
        typeof data.paymentTermCode === "string" ? data.paymentTermCode : data.paymentTermCode ?? undefined,
      creditLimit: data.creditLimit ?? 0,
      creditUsed: data.creditUsed ?? undefined,
      creditOnHold: data.creditOnHold ?? undefined,
      creditStatus: data.creditStatus,
      creditHoldReason: data.creditHoldReason ?? null,
      isActive: data.isActive,
      notes: data.notes ?? null,
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cxc/clientes", error);
    const message = error instanceof Error ? error.message : "No se pudo crear el cliente";
    const normalized = message.toLowerCase();
    let status = 500;
    if (normalized.includes("condición de pago")) {
      status = 400;
    } else if (normalized.includes("ya existe") && normalized.includes("cliente")) {
      status = 409;
    }
    return NextResponse.json({ success: false, message }, { status });
  }
}
