import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { articleWarehouseService } from "@/lib/services/ArticleWarehouseService";

const upsertAssociationSchema = z.object({
  warehouse_code: z.string().trim().min(1).max(40),
  is_primary: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ article_code: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { article_code } = await context.params;
  const access = await requireAdministrator(request, "Solo un administrador puede consultar bodegas asociadas a artículos");
  if ("response" in access) return access.response;

  try {
    const overview = await articleWarehouseService.getArticleWarehouseOverview(article_code);
    if (!overview) {
      return NextResponse.json(
        { success: false, message: `El artículo ${article_code} no existe` },
        { status: 404 }
      );
    }

    const { article, warehouses } = overview;
    return NextResponse.json({
      success: true,
      article: {
        id: article.id,
        code: article.code,
        name: article.name,
        default_warehouse_id: article.defaultWarehouseId,
      },
      warehouses: warehouses.map((warehouse) => ({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        is_active: warehouse.isActive,
        is_associated: warehouse.isAssociated,
        is_primary: warehouse.isPrimary,
        associated_at: warehouse.associatedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/articulos/[article_code]/almacenes error", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron obtener las asociaciones" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { article_code } = await context.params;
  const access = await requireAdministrator(request, "Solo un administrador puede modificar bodegas asociadas a artículos");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = upsertAssociationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const overview = await articleWarehouseService.associateWarehouse({
      articleCode: article_code,
      warehouseCode: parsed.data.warehouse_code,
      makePrimary: parsed.data.is_primary,
    });

    return NextResponse.json({
      success: true,
      article: {
        id: overview.article.id,
        code: overview.article.code,
        name: overview.article.name,
        default_warehouse_id: overview.article.defaultWarehouseId,
      },
      warehouses: overview.warehouses.map((warehouse) => ({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        is_active: warehouse.isActive,
        is_associated: warehouse.isAssociated,
        is_primary: warehouse.isPrimary,
        associated_at: warehouse.associatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo asociar la bodega";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { article_code } = await context.params;
  const access = await requireAdministrator(request, "Solo un administrador puede eliminar bodegas asociadas a artículos");
  if ("response" in access) return access.response;

  const warehouseCode = request.nextUrl.searchParams.get("warehouse_code");
  if (!warehouseCode) {
    return NextResponse.json({ success: false, message: "warehouse_code es requerido" }, { status: 400 });
  }

  try {
    const overview = await articleWarehouseService.removeAssociation({
      articleCode: article_code,
      warehouseCode,
    });

    return NextResponse.json({
      success: true,
      article: {
        id: overview.article.id,
        code: overview.article.code,
        name: overview.article.name,
        default_warehouse_id: overview.article.defaultWarehouseId,
      },
      warehouses: overview.warehouses.map((warehouse) => ({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        is_active: warehouse.isActive,
        is_associated: warehouse.isAssociated,
        is_primary: warehouse.isPrimary,
        associated_at: warehouse.associatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la asociación";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
