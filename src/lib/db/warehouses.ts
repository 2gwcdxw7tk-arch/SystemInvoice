import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

export interface WarehouseRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

const mockWarehouses: WarehouseRow[] = [
  { id: 1, code: "PRINCIPAL", name: "Almacén principal", is_active: true },
  { id: 2, code: "COCINA", name: "Cocina", is_active: true },
  { id: 3, code: "BAR", name: "Barra principal", is_active: true },
];

export async function listWarehouses(options: { includeInactive?: boolean } = {}): Promise<WarehouseRow[]> {
  const { includeInactive = false } = options;
  if (env.useMockData) {
    return includeInactive ? mockWarehouses : mockWarehouses.filter((w) => w.is_active);
  }
  const pool = await getPool();
  const req = pool.request();
  if (!includeInactive) {
    req.input("is_active", sql.Bit, 1);
  }
  const result = await req.query<WarehouseRow>(`
    SELECT id, code, name, is_active
    FROM app.warehouses
    ${includeInactive ? "" : "WHERE is_active = 1"}
    ORDER BY name
  `);
  return result.recordset.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    is_active: !!row.is_active,
  }));
}

export async function getWarehouseByCode(code: string): Promise<WarehouseRow | null> {
  if (!code) return null;
  if (env.useMockData) {
    const found = mockWarehouses.find((w) => w.code.toUpperCase() === code.toUpperCase());
    return found ? { ...found } : null;
  }
  const pool = await getPool();
  const req = pool.request();
  req.input("code", sql.NVarChar(20), code.toUpperCase());
  const result = await req.query<WarehouseRow>(`
    SELECT TOP 1 id, code, name, is_active
    FROM app.warehouses
    WHERE UPPER(code) = @code
  `);
  const row = result.recordset[0];
  return row
    ? {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        is_active: !!row.is_active,
      }
    : null;
}
