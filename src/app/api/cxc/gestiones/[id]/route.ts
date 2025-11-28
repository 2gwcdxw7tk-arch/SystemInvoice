import { NextRequest, NextResponse } from "next/server";

import { CXC_PERMISSIONS, requireCxCPermissions } from "@/lib/auth/cxc-access";
import { env } from "@/lib/env";
import { collectionLogService } from "@/lib/services/cxc/CollectionLogService";

const ensureRetailMode = () => {
  if (env.features.isRestaurant) {
    return NextResponse.json(
      { success: false, message: "El módulo de Cuentas por Cobrar no está disponible en modo restaurante" },
      { status: 403 },
    );
  }
  return null;
};

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const retailGuard = ensureRetailMode();
  if (retailGuard) {
    return retailGuard;
  }

  const access = await requireCxCPermissions(request, {
    anyOf: [CXC_PERMISSIONS.CUSTOMER_COLLECTIONS_MANAGE],
    message: "No tienes permisos para eliminar gestiones",
  });
  if ("response" in access) {
    return access.response;
  }

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }

  try {
    await collectionLogService.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/cxc/gestiones/${id}`, error);
    const message = error instanceof Error ? error.message : "No se pudo eliminar la gestión";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}