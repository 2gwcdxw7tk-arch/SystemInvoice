import { NextRequest, NextResponse } from "next/server";
import { listClassifications } from "@/lib/db/classifications";
import {
  forbiddenResponse,
  hasPermission,
  isAdministrator,
  isFacturador,
  requireSession,
} from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const access = await requireSession(request);
  if ("response" in access) return access.response;

  const { session } = access;
  const allowed =
    session.role === "waiter" ||
    isAdministrator(session) ||
    isFacturador(session) ||
    hasPermission(session, "catalog.view") ||
    hasPermission(session, "invoice.issue");
  if (!allowed) {
    return forbiddenResponse("No tienes permisos para consultar clasificaciones");
  }

  const { searchParams } = new URL(request.url);
  const levelParam = searchParams.get("level");
  const parent_full_code = searchParams.get("parent_full_code");
  const level = levelParam ? Number(levelParam) : undefined;
  try {
    const items = await listClassifications({ level, parent_full_code: parent_full_code || undefined });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/clasificaciones error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener clasificaciones" }, { status: 500 });
  }
}
