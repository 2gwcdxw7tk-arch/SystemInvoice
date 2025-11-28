import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { customerDocumentApplicationService } from "@/lib/services/cxc/CustomerDocumentApplicationService";

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

const applicationSchema = z.object({
  appliedDocumentId: z.number().int().positive(),
  targetDocumentId: z.number().int().positive(),
  amount: moneyField(0.01),
  applicationDate: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]).optional(),
  reference: optionalNullableString,
  notes: optionalNullableString,
});

const applySchema = z.object({
  applications: z.array(applicationSchema).min(1),
});

const viewPermissions = [
  CXC_PERMISSIONS.MENU_VIEW,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE,
  CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY,
];

export async function GET(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: viewPermissions,
    message: "No tienes permisos para consultar aplicaciones",
  });
  if ("response" in access) {
    return access.response;
  }

  const params = request.nextUrl.searchParams;
  const appliedDocumentId = params.get("appliedDocumentId");
  const targetDocumentId = params.get("targetDocumentId");

  try {
    const items = await customerDocumentApplicationService.list({
      appliedDocumentId: appliedDocumentId ? Number(appliedDocumentId) : undefined,
      targetDocumentId: targetDocumentId ? Number(targetDocumentId) : undefined,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/cxc/documentos/aplicaciones", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las aplicaciones" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY],
    message: "No tienes permisos para aplicar documentos",
  });
  if ("response" in access) {
    return access.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const applications = await customerDocumentApplicationService.apply(parsed.data.applications);
    return NextResponse.json({ applications }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cxc/documentos/aplicaciones", error);
    const message = error instanceof Error ? error.message : "No se pudieron aplicar los documentos";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
