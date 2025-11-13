import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { resetAdminUserPassword } from "@/lib/db/auth";

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(64, "La contraseña no puede exceder 64 caracteres"),
});

export async function POST(request: NextRequest, context: { params: Promise<{ adminUserId: string }> }) {
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
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const user = await resetAdminUserPassword(adminUserId, parsed.data.password);
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error(`POST /api/admin-users/${adminUserId}/reset-password`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar la contraseña";
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
