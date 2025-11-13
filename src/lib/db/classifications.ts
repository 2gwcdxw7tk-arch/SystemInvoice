import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

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
  const conditions: string[] = ["is_active = TRUE"];
  const values: unknown[] = [];
  let index = 1;

  if (typeof params.level === "number") {
    conditions.push(`level = $${index}`);
    values.push(params.level);
    index += 1;
  }

  if (typeof params.parent_full_code !== "undefined") {
    if (params.parent_full_code) {
      conditions.push(`parent_full_code = $${index}`);
      values.push(params.parent_full_code);
      index += 1;
    } else {
      conditions.push("parent_full_code IS NULL");
    }
  }

  const result = await query<{
    id: number;
    level: number;
    code: string;
    full_code: string;
    name: string;
    parent_full_code: string | null;
    is_active: boolean;
  }>(
    `SELECT id, level, code, full_code, name, parent_full_code, is_active
     FROM app.article_classifications
     WHERE ${conditions.join(" AND ")}
     ORDER BY full_code`,
    values
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    level: Number(r.level),
    code: r.code,
    full_code: r.full_code,
    name: r.name,
    parent_full_code: r.parent_full_code,
    is_active: !!r.is_active,
  }));
}
