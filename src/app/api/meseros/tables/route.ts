import { NextRequest, NextResponse } from "next/server";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { RESTAURANT_DISABLED_MESSAGE } from "@/lib/features/guards";
import { listWaiterTables } from "@/lib/services/TableService";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "waiter") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  if (!env.features.isRestaurant) {
    return NextResponse.json({ success: false, message: RESTAURANT_DISABLED_MESSAGE }, { status: 403 });
  }

  try {
    const tables = await listWaiterTables();
    return NextResponse.json(
      { success: true, tables },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("GET /api/meseros/tables", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las mesas" }, { status: 500 });
  }
}
