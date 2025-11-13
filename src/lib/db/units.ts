import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

export interface UnitRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

const mockUnits: UnitRow[] = [
  { id: 1, code: "UND", name: "Unidad", is_active: true },
  { id: 2, code: "CJ", name: "Caja", is_active: true },
  { id: 3, code: "LT", name: "Litro", is_active: true },
];

export async function listUnits(): Promise<UnitRow[]> {
  if (env.useMockData) {
    return mockUnits.filter(u => u.is_active);
  }
  const res = await query<{ id: number; code: string; name: string; is_active: boolean }>(
    "SELECT id, code, name, is_active FROM app.units WHERE is_active = true ORDER BY name"
  );
  return res.rows.map(r => ({ id: Number(r.id), code: r.code, name: r.name, is_active: !!r.is_active }));
}

export async function upsertUnit(input: { code: string; name: string; is_active?: boolean }): Promise<{ id: number }> {
  if (env.useMockData) {
    const found = mockUnits.find(u => u.code.toUpperCase() === input.code.toUpperCase());
    if (found) {
      found.name = input.name;
      if (typeof input.is_active === "boolean") found.is_active = input.is_active;
      return { id: found.id };
    }
    const id = mockUnits.length ? Math.max(...mockUnits.map(u => u.id)) + 1 : 1;
    mockUnits.push({ id, code: input.code, name: input.name, is_active: input.is_active ?? true });
    return { id };
  }
  const normalizedCode = input.code.trim().toUpperCase();
  const normalizedName = input.name.trim();
  const isActive = typeof input.is_active === "boolean" ? input.is_active : true;

  const result = await query<{ id: number }>(
    `INSERT INTO app.units(code, name, is_active)
     VALUES($1, $2, $3)
     ON CONFLICT (code)
     DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active
     RETURNING id`,
    [normalizedCode, normalizedName, isActive]
  );

  return { id: Number(result.rows[0].id) };
}
