import { NextRequest, NextResponse } from "next/server";

import { requireAdministrator } from "@/lib/auth/access";
import { roleService } from "@/lib/services/RoleService";

export async function GET(request: NextRequest) {
  const authResult = await requireAdministrator(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  // No need for further session or permission checks, requireAdministrator handles it.
  // const session = authResult.session;

  try {
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
    const roles = await roleService.listRoles({ includeInactive });
    return NextResponse.json({
      success: true,
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isActive: role.isActive,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin-users/roles", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los roles" }, { status: 500 });
  }
}
