import sql from "mssql";
import type { ConnectionPool, IResult } from "mssql";

export { sql };

import { env } from "@/lib/env";

declare global {
  var __MSSQL_POOL__: ConnectionPool | undefined;
}

export async function getPool(): Promise<ConnectionPool> {
  if (env.useMockData) {
    throw new Error("El pool de SQL Server no está disponible en modo MOCK_DATA");
  }

  if (!globalThis.__MSSQL_POOL__ || !globalThis.__MSSQL_POOL__.connected) {
    globalThis.__MSSQL_POOL__ = await sql.connect(env.DB_CONNECTION_STRING);

    globalThis.__MSSQL_POOL__.on("error", (error: Error) => {
      console.error("Error en el pool de conexiones de SQL Server", error);
      globalThis.__MSSQL_POOL__ = undefined;
    });
  }

  return globalThis.__MSSQL_POOL__;
}

export async function executeQuery<T = unknown>(
  query: string,
  parameters: Record<string, unknown> = {}
): Promise<IResult<T>> {
  const pool = await getPool();
  const request = pool.request();

  Object.entries(parameters).forEach(([key, value]) => {
    request.input(key, value as never);
  });

  const result = await request.query<T>(query);
  return result;
}

export async function closePool(): Promise<void> {
  if (globalThis.__MSSQL_POOL__?.connected) {
    await globalThis.__MSSQL_POOL__.close();
    globalThis.__MSSQL_POOL__ = undefined;
  }
}
