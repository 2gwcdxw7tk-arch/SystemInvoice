import "server-only";

import { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from "pg";

import { env } from "@/lib/env";

declare global {
  var __PG_POOL__: Pool | undefined;
}

function createPool(): Pool {
  if (!env.DB_CONNECTION_STRING) {
    throw new Error("DB_CONNECTION_STRING no está definido");
  }

  const pool = new Pool({
    connectionString: env.DB_CONNECTION_STRING,
    ssl: env.isProduction ? { rejectUnauthorized: false } : undefined,
  });

  pool.on("error", (error) => {
    console.error("Error en el pool de PostgreSQL", error);
    globalThis.__PG_POOL__ = undefined;
  });

  return pool;
}

export async function getPool(): Promise<Pool> {
  if (env.useMockData) {
    throw new Error("El pool de PostgreSQL no está disponible en modo MOCK_DATA");
  }

  if (!globalThis.__PG_POOL__) {
    globalThis.__PG_POOL__ = createPool();
  }

  return globalThis.__PG_POOL__;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>>;
export async function query<T extends QueryResultRow = QueryResultRow>(
  config: QueryConfig,
): Promise<QueryResult<T>>;
export async function query<T extends QueryResultRow = QueryResultRow>(
  config: string | QueryConfig,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const pool = await getPool();
  if (typeof config === "string") {
    return pool.query<T>(config, values);
  }
  return pool.query<T>(config);
}

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la transacción", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalThis.__PG_POOL__) {
    await globalThis.__PG_POOL__.end();
    globalThis.__PG_POOL__ = undefined;
  }
}

export type { PoolClient, QueryResult };
