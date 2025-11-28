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

const createSchema = z.object({
  customerId: z.number().int().positive(),
  documentId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
  disputeCode: nullableString(60),
  description: nullableString(600),
  status: statusEnum.optional(),
  resolutionNotes: nullableString(600),
  resolvedAt: dateLike,
  createdBy: z.union([z.number().int().positive(), z.literal(null)]).optional(),
});

const listStatusesSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const tokens = value.split(",").map((entry) => entry.trim().toUpperCase());
    const valid = tokens.filter((entry): entry is typeof statusEnum._type => statusEnum.options.includes(entry as typeof statusEnum._type));
    return valid.length > 0 ? valid : undefined;
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

const viewPermissions = [CXC_PERMISSIONS.MENU_VIEW, CXC_PERMISSIONS.CUSTOMER_DISPUTES_MANAGE];

export async function GET(request: NextRequest) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar disputas",
  });
  if ("response" in access) {
    return access.response;
  }

  const params = request.nextUrl.searchParams;
  const customerIdParam = params.get("customerId");
  if (!customerIdParam) {
    return NextResponse.json({ success: false, message: "Debes indicar el cliente" }, { status: 400 });
  }
  const customerId = Number(customerIdParam);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return NextResponse.json({ success: false, message: "Cliente inválido" }, { status: 400 });
  }

  const documentIdParam = params.get("documentId");
  const documentId = documentIdParam ? Number(documentIdParam) : undefined;
  if (documentIdParam && (!Number.isFinite(documentId!) || documentId! <= 0)) {
    return NextResponse.json({ success: false, message: "Documento inválido" }, { status: 400 });
  }

  const statusesParam = listStatusesSchema.safeParse(params.get("statuses"));
  if (!statusesParam.success) {
    return NextResponse.json({ success: false, message: "Filtro de estatus inválido" }, { status: 400 });
  }

  try {
    const items = await customerDisputeService.list({
      customerId,
      documentId,
      statuses: statusesParam.data,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/cxc/disputas", error);
    const message = error instanceof Error ? error.message : "No se pudieron obtener las disputas";
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
    anyOf: [CXC_PERMISSIONS.CUSTOMER_DISPUTES_MANAGE],
    message: "No tienes permisos para registrar disputas",
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

  const data = parsed.data;

  try {
    const dispute = await customerDisputeService.create({
      customerId: data.customerId,
      documentId: typeof data.documentId === "number" ? data.documentId : data.documentId ?? null,
      disputeCode: data.disputeCode ?? null,
      description: data.description ?? null,
      status: data.status,
      resolutionNotes: data.resolutionNotes ?? null,
      resolvedAt: data.resolvedAt ?? undefined,
      createdBy: typeof data.createdBy === "number" ? data.createdBy : data.createdBy ?? null,
    });
    return NextResponse.json({ dispute }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cxc/disputas", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la disputa";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}