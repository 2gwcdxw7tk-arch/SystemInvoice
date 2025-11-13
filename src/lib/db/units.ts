import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

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
  const pool = await getPool();
  const res = await pool.request().query("SELECT id, code, name, is_active FROM app.units WHERE is_active = 1 ORDER BY name");
  return res.recordset.map(r => ({ id: Number(r.id), code: r.code, name: r.name, is_active: !!r.is_active }));
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
  const pool = await getPool();
  const req = pool.request();
  req.input("code", sql.NVarChar(20), input.code);
  req.input("name", sql.NVarChar(60), input.name);
  req.input("is_active", sql.Bit, input.is_active ?? true);
  const result = await req.query<{ id: number }>(`
    IF EXISTS (SELECT 1 FROM app.units WHERE UPPER(code) = UPPER(@code))
    BEGIN
      UPDATE app.units SET name=@name, is_active=@is_active WHERE UPPER(code) = UPPER(@code);
      SELECT id FROM app.units WHERE UPPER(code) = UPPER(@code);
    END
    ELSE BEGIN
      INSERT INTO app.units(code, name, is_active) VALUES(@code, @name, @is_active);
      SELECT SCOPE_IDENTITY() AS id;
    END`);
  return { id: Number(result.recordset[0].id) };
}
