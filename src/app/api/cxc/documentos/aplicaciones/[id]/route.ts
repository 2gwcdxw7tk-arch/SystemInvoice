import { NextRequest, NextResponse } from "next/server";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { customerDocumentApplicationService } from "@/lib/services/cxc/CustomerDocumentApplicationService";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_DOCUMENTS_APPLY],
    message: "No tienes permisos para revertir aplicaciones",
  });
  if ("response" in access) {
    return access.response;
  }

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }

  try {
    await customerDocumentApplicationService.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/cxc/documentos/aplicaciones/[id]", error);
    return NextResponse.json({ success: false, message: "No se pudo revertir la aplicación" }, { status: 500 });
  }
}
