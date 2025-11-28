import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { RESTAURANT_DISABLED_MESSAGE } from "@/lib/features/guards";
import { waiterService } from "@/lib/services/WaiterService";

const createWaiterSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "El código debe tener al menos 3 caracteres")
    .max(50, "El código no puede exceder 50 caracteres")
    .regex(/^[A-Z0-9-]+$/i, "Usa solo letras, números y guiones"),
  full_name: z.string().trim().min(3, "El nombre es obligatorio").max(150, "El nombre es muy largo"),
  phone: z
    .string()
    .trim()
    .max(30, "La extensión máxima es de 30 caracteres")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(150, "La extensión máxima es de 150 caracteres")
    .email("Correo no válido")
    .optional()
    .or(z.literal("")),
  pin: z
    .string()
    .trim()
    .min(4, "El PIN debe tener al menos 4 dígitos")
    .max(12, "El PIN no puede exceder 12 dígitos")
    .regex(/^[0-9]+$/, "El PIN solo debe contener números"),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  if (!env.features.isRestaurant) {
    return NextResponse.json({ message: RESTAURANT_DISABLED_MESSAGE }, { status: 403 });
  }

  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  try {
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
    const waiters = await waiterService.listWaiterDirectory({ includeInactive });
    return NextResponse.json({ success: true, waiters });
  } catch (error) {
    console.error("GET /api/waiters", error);
    return NextResponse.json({ success: false, message: "No se pudieron consultar los meseros" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!env.features.isRestaurant) {
    return NextResponse.json({ message: RESTAURANT_DISABLED_MESSAGE }, { status: 403 });
  }

  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createWaiterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const waiter = await waiterService.createWaiterDirectoryEntry({
      code: parsed.data.code,
      fullName: parsed.data.full_name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      pin: parsed.data.pin,
      isActive: parsed.data.is_active ?? true,
    });
    return NextResponse.json({ success: true, waiter }, { status: 201 });
  } catch (error) {
    console.error("POST /api/waiters", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar el mesero";
    const normalized = message.toLowerCase();
    const status = normalized.includes("ya existe") || normalized.includes("duplic") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
