import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { roleService } from "@/lib/services/RoleService";

const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(40, "El código no puede exceder 40 caracteres"),
  name: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres"),
  description: z.string().trim().max(250, "La descripción no puede exceder 250 caracteres").nullish(),
  is_active: z.boolean().optional(),
  permissions: z.array(z.string().trim().min(3, "Código de permiso inválido")).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdministrator(request);
  if ("response" in auth) {
    return auth.response;
  }

  const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";

  try {
    const roles = await roleService.listRoles({ includeInactive });
    return NextResponse.json({ success: true, roles });
  } catch (error) {
    console.error("GET /api/roles", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los roles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdministrator(request, "Solo un administrador puede crear roles");
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const role = await roleService.createRole({
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.is_active ?? true,
      permissionCodes: parsed.data.permissions ?? [],
    });

    return NextResponse.json({ success: true, role }, { status: 201 });
  } catch (error) {
    console.error("POST /api/roles", error);
    const message = error instanceof Error ? error.message : "No se pudo crear el rol";
    const normalized = message.toLowerCase();
    const status = normalized.includes("existe") || normalized.includes("duplic") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
