import { NextRequest, NextResponse } from "next/server";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { adminUserService } from "@/lib/services/AdminUserService";

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canManage = roles.includes("ADMINISTRADOR") || permissions.includes("admin.users.manage");
  if (!canManage) {
    return NextResponse.json({ success: false, message: "No tienes permisos para gestionar usuarios" }, { status: 403 });
  }

  try {
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
    const roles = await adminUserService.listAdminRoleDefinitions({ includeInactive });
    return NextResponse.json({ success: true, roles });
  } catch (error) {
    console.error("GET /api/admin-users/roles", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los roles" }, { status: 500 });
  }
}
