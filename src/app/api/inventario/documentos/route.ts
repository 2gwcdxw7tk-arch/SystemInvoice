import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import type { InventoryDocumentListFilter, TransactionType } from "@/lib/types/inventory";

const VALID_TYPES: TransactionType[] = ["PURCHASE", "CONSUMPTION", "TRANSFER", "ADJUSTMENT"];

function parseMultiValue(paramValues: string[]): string[] {
  const result = new Set<string>();
  for (const value of paramValues) {
    if (!value) continue;
    for (const chunk of value.split(",")) {
      const normalized = chunk.trim();
      if (normalized.length > 0) {
        result.add(normalized);
      }
    }
  }
  return Array.from(result);
}

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar documentos de inventario");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const typeValues = parseMultiValue([...searchParams.getAll("type"), ...(searchParams.getAll("types"))])
    .map((value) => value.toUpperCase());
  const transaction_types = typeValues.filter((value): value is TransactionType => VALID_TYPES.includes(value as TransactionType));

  const warehouseValues = parseMultiValue([...searchParams.getAll("warehouse"), ...searchParams.getAll("warehouse_code")]);
  const warehouse_codes = warehouseValues.map((value) => value.toUpperCase());

  const search = searchParams.get("search") || searchParams.get("q") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const limitParam = searchParams.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : undefined;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

  const filters: InventoryDocumentListFilter = {
    transaction_types: transaction_types.length ? transaction_types : undefined,
    warehouse_codes: warehouse_codes.length ? warehouse_codes : undefined,
    search,
    from,
    to,
    limit,
  };

  try {
    const items = await inventoryService.listTransactionHeaders(filters);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/documentos error", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los documentos" }, { status: 500 });
  }
}
