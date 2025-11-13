import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { updateWaiterDirectoryEntry } from "@/lib/db/auth";

const updateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "El código debe tener al menos 3 caracteres")
      .max(50, "El código no puede exceder 50 caracteres")
      .regex(/^[A-Z0-9-]+$/i, "Usa solo letras, números y guiones")
      .optional(),
    full_name: z.string().trim().min(3, "El nombre es obligatorio").max(150, "El nombre es muy largo").optional(),
    phone: z.string().trim().max(30, "Máximo 30 caracteres").optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .max(150, "Máximo 150 caracteres")
      .email("Correo no válido")
      .optional()
      .or(z.literal("")),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => typeof value !== "undefined"), {
    message: "Proporciona al menos un campo para actualizar",
  });

export async function PATCH(request: NextRequest, context: { params: Promise<{ waiterId: string }> }) {
  const { waiterId: waiterIdParam } = await context.params;
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const waiterId = Number(waiterIdParam);
  if (!Number.isFinite(waiterId)) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const waiter = await updateWaiterDirectoryEntry(waiterId, {
      code: parsed.data.code,
      fullName: parsed.data.full_name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      isActive: parsed.data.is_active,
    });
    return NextResponse.json({ success: true, waiter });
  } catch (error) {
    console.error(`PATCH /api/waiters/${waiterId}`, error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el mesero";
    const normalized = message.toLowerCase();
    const status = normalized.includes("no encontrado") ? 404 : normalized.includes("ya existe") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
