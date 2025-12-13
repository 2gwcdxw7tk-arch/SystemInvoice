import { NextRequest, NextResponse } from "next/server";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { customerService } from "@/lib/services/cxc/CustomerService";
import { createCustomerSchema } from "@/lib/schemas/cxc";
import { handleApiError, zodErrorResponse, createdResponse, successResponse } from "@/lib/api";

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
      return successResponse({ items });
    }
    const items = await customerService.list({ search: search ?? undefined, includeInactive, limit });
    return successResponse({ items });
  } catch (error) {
    return handleApiError(error, { operation: "GET /api/cxc/clientes" });
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
    return zodErrorResponse(parsed.error, "Datos de cliente inválidos");
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
    return createdResponse({ customer }, "Cliente creado exitosamente");
  } catch (error) {
    // Handle specific business errors with appropriate status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("condición de pago")) {
        return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      }
      if (message.includes("ya existe") && message.includes("cliente")) {
        return NextResponse.json({ success: false, message: error.message }, { status: 409 });
      }
    }
    return handleApiError(error, { operation: "POST /api/cxc/clientes" });
  }
}
