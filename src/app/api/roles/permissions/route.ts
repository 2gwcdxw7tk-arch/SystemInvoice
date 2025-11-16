import { NextRequest, NextResponse } from "next/server";

import { requireAdministrator } from "@/lib/auth/access";
import { roleService } from "@/lib/services/RoleService";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrator(request, "Solo un administrador puede consultar permisos");
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const permissions = await roleService.listPermissions();
    return NextResponse.json({ success: true, permissions });
  } catch (error) {
    console.error("GET /api/roles/permissions", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los permisos" }, { status: 500 });
  }
}
