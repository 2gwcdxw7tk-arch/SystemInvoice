import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { roleService } from "@/lib/services/RoleService";

const updateRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres")
    .optional(),
  description: z.string().trim().max(250, "La descripción no puede exceder 250 caracteres").optional().or(z.literal(null)),
  is_active: z.boolean().optional(),
  permissions: z.array(z.string().trim().min(3, "Código de permiso inválido")).optional(),
});

async function resolveRoleId(context: { params: Promise<{ roleId: string }> }): Promise<number | null> {
  const { roleId: rawRoleId } = await context.params;
  const roleId = Number.parseInt(rawRoleId, 10);
  return Number.isFinite(roleId) ? roleId : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ roleId: string }> }) {
  const auth = await requireAdministrator(request, "Solo un administrador puede actualizar roles");
  if ("response" in auth) {
    return auth.response;
  }

  const roleId = await resolveRoleId(context);
  if (!roleId) {
    return NextResponse.json({ success: false, message: "Identificador de rol inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (
    typeof parsed.data.name === "undefined" &&
    typeof parsed.data.description === "undefined" &&
    typeof parsed.data.is_active === "undefined" &&
    typeof parsed.data.permissions === "undefined"
  ) {
    return NextResponse.json({ success: false, message: "No se recibió ningún cambio" }, { status: 400 });
  }

  try {
    const role = await roleService.updateRole(roleId, {
      name: parsed.data.name,
      description: parsed.data.description,
      isActive: parsed.data.is_active,
      permissionCodes: parsed.data.permissions,
    });

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error(`PATCH /api/roles/${roleId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el rol";
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ roleId: string }> }) {
  const auth = await requireAdministrator(request, "Solo un administrador puede eliminar roles");
  if ("response" in auth) {
    return auth.response;
  }

  const roleId = await resolveRoleId(context);
  if (!roleId) {
    return NextResponse.json({ success: false, message: "Identificador de rol inválido" }, { status: 400 });
  }

  try {
    await roleService.deleteRole(roleId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/roles/${roleId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo eliminar el rol";
    const normalized = message.toLowerCase();
    const status = normalized.includes("no encontrado") ? 404 : normalized.includes("asignado") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
