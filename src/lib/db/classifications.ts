import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

export interface ClassificationRow {
  id: number;
  level: number;
  code: string;
  full_code: string;
  name: string;
  parent_full_code: string | null;
  is_active: boolean;
}

const mockClassifications: ClassificationRow[] = [
  { id: 1, level: 1, code: "01", full_code: "01", name: "Bebidas", parent_full_code: null, is_active: true },
  { id: 2, level: 2, code: "0101", full_code: "0101", name: "Cervezas", parent_full_code: "01", is_active: true },
  { id: 3, level: 3, code: "010101", full_code: "010101", name: "Nacionales", parent_full_code: "0101", is_active: true },
  { id: 4, level: 1, code: "02", full_code: "02", name: "Alimentos", parent_full_code: null, is_active: true },
];

export async function listClassifications(params: { level?: number; parent_full_code?: string | null } = {}): Promise<ClassificationRow[]> {
  if (env.useMockData) {
    return mockClassifications.filter(c => {
      if (typeof params.level === 'number' && c.level !== params.level) return false;
      if (typeof params.parent_full_code !== 'undefined') {
        if (!params.parent_full_code && c.parent_full_code !== null) return false;
        if (params.parent_full_code && c.parent_full_code !== params.parent_full_code) return false;
      }
      return c.is_active;
    });
  }
  const pool = await getPool();
  const req = pool.request();
  let where = "WHERE is_active = 1";
  if (typeof params.level === 'number') {
    req.input("level", sql.TinyInt, params.level);
    where += " AND level = @level";
  }
  if (typeof params.parent_full_code !== 'undefined') {
    req.input("parent_full_code", sql.NVarChar(24), params.parent_full_code);
    if (params.parent_full_code) where += " AND parent_full_code = @parent_full_code"; else where += " AND parent_full_code IS NULL";
  }
  const result = await req.query<{
    id: number;
    level: number;
    code: string;
    full_code: string;
    name: string;
    parent_full_code: string | null;
    is_active: boolean;
  }>(`SELECT id, level, code, full_code, name, parent_full_code, is_active FROM app.article_classifications ${where} ORDER BY full_code`);
  return result.recordset.map((r) => ({
    id: Number(r.id),
    level: Number(r.level),
    code: r.code,
    full_code: r.full_code,
    name: r.name,
    parent_full_code: r.parent_full_code,
    is_active: !!r.is_active,
  }));
}
