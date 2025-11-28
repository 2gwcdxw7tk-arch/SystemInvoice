import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { env } from "@/lib/env";
import { customerCreditLineService } from "@/lib/services/cxc/CustomerCreditLineService";

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
  .union([z.string().trim().max(200), z.literal(""), z.literal(null)])
  .optional()
  .transform((value) => {
    if (typeof value === "undefined") return undefined;
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  });

const dateLike = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:[tT ].*)?$/), z.date(), z.literal(null)])
  .optional();

const CREDIT_LINE_STATUSES = ["ACTIVE", "PAUSED", "BLOCKED"] as const;
const CUSTOMER_STATUSES = ["ACTIVE", "ON_HOLD", "BLOCKED"] as const;

const assignSchema = z.object({
  customerCode: z.string().trim().min(1).max(40),
  approvedLimit: moneyField(0.01),
  blockedAmount: moneyField(0).optional(),
  availableLimit: moneyField(0).optional(),
  status: z.enum(CREDIT_LINE_STATUSES).optional(),
  reviewerAdminUserId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
  reviewNotes: optionalNullableString,
  reviewedAt: dateLike,
  nextReviewAt: dateLike,
  creditHoldReason: optionalNullableString,
  customerStatus: z.enum(CUSTOMER_STATUSES).optional(),
});

const updateStatusSchema = z.object({
  customerCode: z.string().trim().min(1).max(40),
  status: z.enum(CUSTOMER_STATUSES),
  creditHoldReason: optionalNullableString,
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE,
  CXC_PERMISSIONS.CUSTOMERS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
];

const ensureRetailMode = () => {
  if (env.features.isRestaurant) {
    return NextResponse.json(
      { success: false, message: "El módulo de Cuentas por Cobrar no está disponible en modo restaurante" },
      { status: 403 },
    );
  }
  return null;
};

export async function GET(request: NextRequest) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar líneas de crédito",
  });
  if ("response" in access) {
    return access.response;
  }

  const params = request.nextUrl.searchParams;
  const customerCode = params.get("customerCode");
  if (!customerCode) {
    return NextResponse.json(
      { success: false, message: "Debes indicar el código del cliente" },
      { status: 400 },
    );
  }

  try {
    const overview = await customerCreditLineService.getOverview(customerCode);
    return NextResponse.json({ overview });
  } catch (error) {
    console.error("GET /api/cxc/credit-lines", error);
    const message = error instanceof Error ? error.message : "No se pudieron obtener las líneas de crédito";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE],
    message: "No tienes permisos para gestionar líneas de crédito",
  });
  if ("response" in access) {
    return access.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = assignSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const result = await customerCreditLineService.assignCreditLine({
      customerCode: data.customerCode,
      approvedLimit: data.approvedLimit,
      blockedAmount: data.blockedAmount,
      availableLimit: data.availableLimit,
      status: data.status,
      reviewerAdminUserId:
        typeof data.reviewerAdminUserId === "number"
          ? data.reviewerAdminUserId
          : data.reviewerAdminUserId === null
            ? null
            : undefined,
      reviewNotes: data.reviewNotes ?? null,
      reviewedAt: data.reviewedAt ?? undefined,
      nextReviewAt: data.nextReviewAt ?? undefined,
      creditHoldReason: data.creditHoldReason ?? null,
      customerStatus: data.customerStatus ?? null,
    });

    const overview = await customerCreditLineService.getOverview(data.customerCode);
    return NextResponse.json({ line: result.line, customer: result.customer, overview }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cxc/credit-lines", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la línea de crédito";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE],
    message: "No tienes permisos para actualizar el estado de crédito",
  });
  if ("response" in access) {
    return access.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const customer = await customerCreditLineService.updateCustomerCreditStatus({
      customerCode: data.customerCode,
      status: data.status,
      creditHoldReason: data.creditHoldReason ?? null,
    });
    const overview = await customerCreditLineService.getOverview(data.customerCode);
    return NextResponse.json({ customer, overview });
  } catch (error) {
    console.error("PATCH /api/cxc/credit-lines", error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el estado de crédito";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
