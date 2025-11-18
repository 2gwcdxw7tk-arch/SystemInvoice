import { NextRequest, NextResponse } from "next/server";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { listWaiterTables } from "@/lib/services/TableService";

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "waiter") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  try {
    const tables = await listWaiterTables();
    return NextResponse.json({ success: true, tables });
  } catch (error) {
    console.error("GET /api/meseros/tables", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las mesas" }, { status: 500 });
  }
}
