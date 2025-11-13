import { NextResponse } from "next/server";

import { getPool } from "@/lib/db/mssql";

export async function GET(): Promise<NextResponse> {
  try {
    const pool = await getPool();
    const result = await pool.request().query<{ value: number }>("SELECT 1 AS value");

    return NextResponse.json({
      status: "ok",
      db: result.recordset[0]?.value === 1,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en healthcheck", error);
    return NextResponse.json(
      {
        status: "error",
        message: "No se pudo verificar la conexión con SQL Server",
      },
      { status: 500 }
    );
  }
}
