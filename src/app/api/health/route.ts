import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

export async function GET(): Promise<NextResponse> {
  try {
    if (env.useMockData) {
      return NextResponse.json({
        status: "ok",
        db: true,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await query<{ value: number }>("SELECT 1 AS value");
    const isDbHealthy = Number(result.rows[0]?.value) === 1;

    return NextResponse.json({
      status: "ok",
      db: isDbHealthy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en healthcheck", error);
    return NextResponse.json(
      {
        status: "error",
        message: "No se pudo verificar la conexión con PostgreSQL",
      },
      { status: 500 }
    );
  }
}
