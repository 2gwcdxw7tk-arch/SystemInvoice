import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { RESTAURANT_DISABLED_MESSAGE } from "@/lib/features/guards";
import { createTableZone, listTableZones } from "@/lib/services/TableService";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const createPayloadSchema = z.object({
  name: z.string().trim().min(1, "Ingresa el nombre de la zona"),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  if (!env.features.isRestaurant) {
    return NextResponse.json({ success: false, message: RESTAURANT_DISABLED_MESSAGE }, { status: 403 });
  }

  const includeInactive = request.nextUrl.searchParams.get("include_inactive") !== "false";
  try {
    const zones = await listTableZones({ includeInactive });
    return NextResponse.json(
      { success: true, zones },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/tables/zones", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las zonas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  if (!env.features.isRestaurant) {
    return NextResponse.json({ success: false, message: RESTAURANT_DISABLED_MESSAGE }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const zone = await createTableZone({
      name: parsed.data.name,
      isActive: parsed.data.is_active,
    });
    return NextResponse.json({ success: true, zone }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tables/zones", error);
    const message = error instanceof Error ? error.message : "No se pudo crear la zona";
    const status = message.includes("Ya existe") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
