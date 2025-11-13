import { NextRequest, NextResponse } from "next/server";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getWaiterById } from "@/lib/db/auth";

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "waiter") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const waiterId = Number(session.sub);
  if (!Number.isFinite(waiterId)) {
    return NextResponse.json({ success: false, message: "Identificador de mesero inválido" }, { status: 400 });
  }

  try {
    const waiter = await getWaiterById(waiterId);
    if (!waiter) {
      return NextResponse.json({ success: false, message: "Mesero no encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      waiter: {
        id: waiter.id,
        code: waiter.code,
        full_name: waiter.fullName,
      },
    });
  } catch (error) {
    console.error("GET /api/meseros/me", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener el perfil" }, { status: 500 });
  }
}
