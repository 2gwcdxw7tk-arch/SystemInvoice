import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { updateAdminDirectoryEntry } from "@/lib/db/auth";

const updateAdminUserSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(150, "El nombre no puede exceder 150 caracteres")
    .optional()
    .or(z.literal("")),
  is_active: z.boolean().optional(),
  roles: z.array(z.string().trim().min(2, "Código de rol inválido")).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ adminUserId: string }> }) {
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

  const { adminUserId: rawAdminUserId } = await context.params;
  const adminUserId = Number.parseInt(rawAdminUserId, 10);
  if (!Number.isFinite(adminUserId)) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAdminUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const user = await updateAdminDirectoryEntry(adminUserId, {
      displayName: parsed.data.display_name ?? undefined,
      isActive: parsed.data.is_active,
      roleCodes: parsed.data.roles,
    });
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error(`PATCH /api/admin-users/${adminUserId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el usuario";
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
