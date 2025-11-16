import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { AdminUserService } from "@/lib/services/AdminUserService";
import { RepositoryFactory } from "@/lib/repositories/RepositoryFactory";

const adminUserService = new AdminUserService(RepositoryFactory.getAdminUserRepository());

const createAdminUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(4, "El usuario debe tener al menos 4 caracteres")
    .max(120, "El usuario no puede exceder 120 caracteres"),
  display_name: z
    .string()
    .trim()
    .max(150, "El nombre no puede exceder 150 caracteres")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(64, "La contraseña no puede exceder 64 caracteres"),
  is_active: z.boolean().optional(),
  roles: z
    .array(z.string().trim().min(2, "Código de rol inválido"))
    .optional()
    .default([]),
});

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
    const users = await adminUserService.listAdminDirectory({ includeInactive });
    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("GET /api/admin-users", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los usuarios" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => null);
  const parsed = createAdminUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const user = await adminUserService.createAdminDirectoryEntry({
      username: parsed.data.username,
      displayName: parsed.data.display_name ?? null,
      password: parsed.data.password,
      isActive: parsed.data.is_active ?? true,
      roleCodes: parsed.data.roles,
    });
    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin-users", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar el usuario";
    const normalized = message.toLowerCase();
    const status = normalized.includes("duplic") || normalized.includes("existe") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
