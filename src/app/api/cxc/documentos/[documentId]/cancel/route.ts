import { NextRequest, NextResponse } from "next/server";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { customerDocumentApplicationService } from "@/lib/services/cxc/CustomerDocumentApplicationService";
import { customerDocumentService } from "@/lib/services/cxc/CustomerDocumentService";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_MANAGE],
    message: "No tienes permisos para anular documentos",
  });
  if ("response" in access) {
    return access.response;
  }

  const { documentId: rawId } = await context.params;
  const documentId = Number(rawId);
  if (!Number.isFinite(documentId) || documentId <= 0) {
    return NextResponse.json({ success: false, message: "Identificador de documento inválido" }, { status: 400 });
  }

  try {
    const document = await customerDocumentService.getById(documentId);
    if (!document) {
      return NextResponse.json({ success: false, message: "El documento indicado no existe" }, { status: 404 });
    }

    if (document.relatedInvoiceId) {
      return NextResponse.json(
        {
          success: false,
          message: "Este documento proviene del módulo de facturación. Debes anularlo desde su módulo de origen.",
        },
        { status: 409 },
      );
    }

    const [applied, received] = await Promise.all([
      customerDocumentApplicationService.list({ appliedDocumentId: document.id }),
      customerDocumentApplicationService.list({ targetDocumentId: document.id }),
    ]);

    if (applied.length > 0 || received.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No puedes anular un documento con aplicaciones activas. Reviértelas antes de continuar.",
        },
        { status: 409 },
      );
    }

    if (document.status === "CANCELADO") {
      return NextResponse.json({ success: true, document }, { status: 200 });
    }

    const updated = await customerDocumentService.update(document.id, { status: "CANCELADO", balanceAmount: 0 });
    return NextResponse.json({ success: true, document: updated }, { status: 200 });
  } catch (error) {
    console.error(`POST /api/cxc/documentos/${rawId}/cancel`, error);
    const message = error instanceof Error ? error.message : "No se pudo anular el documento";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
