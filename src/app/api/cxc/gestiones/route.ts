import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { env } from "@/lib/env";
import { collectionLogService } from "@/lib/services/cxc/CollectionLogService";

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

const dateLike = z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:[tT ].*)?$/), z.date(), z.literal(null)]).optional();

const createSchema = z.object({
  customerId: z.number().int().positive(),
  documentId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
  contactMethod: nullableString(120),
  contactName: nullableString(160),
  notes: nullableString(512),
  outcome: nullableString(240),
  followUpAt: dateLike,
  createdBy: z.union([z.number().int().positive(), z.literal(null)]).optional(),
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

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE,
];

export async function GET(request: NextRequest) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar gestiones",
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

  try {
    const items = await collectionLogService.list({ customerId, documentId });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/cxc/gestiones", error);
    const message = error instanceof Error ? error.message : "No se pudieron obtener las gestiones";
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
    anyOf: [CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE],
    message: "No tienes permisos para registrar gestiones",
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
    const log = await collectionLogService.create({
      customerId: data.customerId,
      documentId: typeof data.documentId === "number" ? data.documentId : data.documentId ?? null,
      contactMethod: data.contactMethod ?? null,
      contactName: data.contactName ?? null,
      notes: data.notes ?? null,
      outcome: data.outcome ?? null,
      followUpAt: data.followUpAt ?? undefined,
      createdBy: typeof data.createdBy === "number" ? data.createdBy : data.createdBy ?? null,
    });
    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cxc/gestiones", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la gestión";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}