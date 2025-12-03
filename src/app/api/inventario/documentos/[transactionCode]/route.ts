import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import { renderInventoryDocumentHtml } from "@/lib/print/inventory-document-template";

type RouteContext = { params: Promise<{ transactionCode: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { transactionCode } = await context.params;
  const access = await requireAdministrator(request, "Solo un administrador puede consultar documentos de inventario");
  if ("response" in access) return access.response;

  const code = transactionCode?.trim();
  if (!code) {
    return NextResponse.json({ success: false, message: "Folio inválido" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "json").toLowerCase();

  try {
    const document = await inventoryService.getTransactionDocument(code);
    if (!document) {
      return NextResponse.json({ success: false, message: "Documento no encontrado" }, { status: 404 });
    }

    if (format === "html") {
      const html = renderInventoryDocumentHtml(document);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error("GET /api/inventario/documentos", error);
    return NextResponse.json({ success: false, message: "No se pudo recuperar el documento" }, { status: 500 });
  }
}
