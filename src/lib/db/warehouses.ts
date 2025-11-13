import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

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
  const result = await query<{ id: number; code: string; name: string; is_active: boolean }>(
    `SELECT id, code, name, is_active
     FROM app.warehouses
     ${includeInactive ? "" : "WHERE is_active = true"}
     ORDER BY name`
  );
  return result.rows.map((row) => ({
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
  const normalizedCode = code.toUpperCase();
  const result = await query<{ id: number; code: string; name: string; is_active: boolean }>(
    `SELECT id, code, name, is_active
     FROM app.warehouses
     WHERE UPPER(code) = $1
     LIMIT 1`,
    [normalizedCode]
  );
  const row = result.rows[0];
  return row
    ? {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        is_active: !!row.is_active,
      }
    : null;
}
