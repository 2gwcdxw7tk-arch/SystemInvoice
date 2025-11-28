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

const updateSchema = z
  .object({
    approvedLimit: moneyField(0.01).optional(),
    blockedAmount: moneyField(0).optional(),
    availableLimit: moneyField(0).optional(),
    status: z.enum(CREDIT_LINE_STATUSES).optional(),
    reviewerAdminUserId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
    reviewNotes: optionalNullableString,
    reviewedAt: dateLike,
    nextReviewAt: dateLike,
    creditHoldReason: optionalNullableString,
    customerStatus: z.enum(CUSTOMER_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => typeof entry !== "undefined"), {
    message: "Debes indicar al menos un campo para actualizar",
    path: ["approvedLimit"],
  });

const ensureRetailMode = () => {
  if (env.features.isRestaurant) {
    return NextResponse.json(
      { success: false, message: "El módulo de Cuentas por Cobrar no está disponible en modo restaurante" },
      { status: 403 },
    );
  }
  return null;
};

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_CREDIT_MANAGE],
    message: "No tienes permisos para actualizar líneas de crédito",
  });
  if ("response" in access) {
    return access.response;
  }

  const lineId = Number(params.id);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json(
      { success: false, message: "Identificador de línea inválido" },
      { status: 400 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const result = await customerCreditLineService.updateCreditLine({
      id: lineId,
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
      reviewNotes: data.reviewNotes,
      reviewedAt: data.reviewedAt,
      nextReviewAt: data.nextReviewAt,
      creditHoldReason: data.creditHoldReason ?? undefined,
      customerStatus: data.customerStatus,
    });
    const overview = await customerCreditLineService.getOverview(result.customer.code);
    return NextResponse.json({ line: result.line, customer: result.customer, overview });
  } catch (error) {
    console.error(`PATCH /api/cxc/credit-lines/${lineId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la línea de crédito";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
