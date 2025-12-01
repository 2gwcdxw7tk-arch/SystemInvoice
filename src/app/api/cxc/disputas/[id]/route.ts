import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { env } from "@/lib/env";
import { customerDisputeService } from "@/lib/services/cxc/CustomerDisputeService";

const nullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.literal(null)])
    .optional()
    .transform((value) => {
      if (typeof value === "undefined") return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    });

const statusEnum = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const);
const dateLike = z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:[tT ].*)?$/), z.date(), z.literal(null)]).optional();

const updateSchema = z
  .object({
    documentId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
    disputeCode: nullableString(60),
    description: nullableString(600),
    status: statusEnum.optional(),
    resolutionNotes: nullableString(600),
    resolvedAt: dateLike,
  })
  .refine((value) => Object.values(value).some((entry) => typeof entry !== "undefined"), {
    message: "Debes indicar al menos un campo a actualizar",
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_DISPUTES_MANAGE],
    message: "No tienes permisos para actualizar disputas",
  });
  if ("response" in access) {
    return access.response;
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
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
    const dispute = await customerDisputeService.update({
      id,
      documentId: typeof data.documentId === "number" ? data.documentId : data.documentId ?? undefined,
      disputeCode: data.disputeCode,
      description: data.description,
      status: data.status,
      resolutionNotes: data.resolutionNotes,
      resolvedAt: data.resolvedAt ?? undefined,
    });
    return NextResponse.json({ dispute });
  } catch (error) {
    console.error(`PATCH /api/cxc/disputas/${id}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la disputa";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}