import { NextRequest, NextResponse } from "next/server";
import { listClassifications } from "@/lib/db/classifications";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const levelParam = searchParams.get("level");
  const parent_full_code = searchParams.get("parent_full_code");
  const level = levelParam ? Number(levelParam) : undefined;
  try {
    const items = await listClassifications({ level, parent_full_code: parent_full_code || undefined });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/clasificaciones error", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener clasificaciones" }, { status: 500 });
  }
}
