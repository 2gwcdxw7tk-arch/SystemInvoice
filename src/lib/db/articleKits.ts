import "server-only";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";

export interface KitComponentInput {
  component_article_code: string;
  component_qty_retail: number;
}

export interface KitComponentRow {
  component_article_id: number;
  component_article_code: string;
  component_article_name: string;
  component_qty_retail: number;
}

const mockKits: { [kitCode: string]: KitComponentRow[] } = {};
const mockArticlesIndex: { [code: string]: { id: number; name: string } } = {};

export async function getKitComponents(kit_article_code: string): Promise<KitComponentRow[]> {
  if (env.useMockData) {
    return mockKits[kit_article_code] || [];
  }
  const result = await query<{
    component_article_id: number;
    component_article_code: string;
    component_article_name: string;
    component_qty_retail: number;
  }>(
    `SELECT ak.component_article_id,
            ca.article_code AS component_article_code,
            ca.name AS component_article_name,
            ak.component_qty_retail
     FROM app.article_kits ak
     INNER JOIN app.articles ka ON ka.id = ak.kit_article_id AND ka.article_code = $1
     INNER JOIN app.articles ca ON ca.id = ak.component_article_id
     ORDER BY ca.name`,
    [kit_article_code]
  );
  return result.rows.map(r => ({
    component_article_id: Number(r.component_article_id),
    component_article_code: r.component_article_code,
    component_article_name: r.component_article_name,
    component_qty_retail: Number(r.component_qty_retail),
  }));
}

export async function upsertKitComponents(kit_article_code: string, components: KitComponentInput[]): Promise<{ count: number }> {
  if (env.useMockData) {
    const mapped: KitComponentRow[] = components.map(c => ({
      component_article_id: mockArticlesIndex[c.component_article_code]?.id || 0,
      component_article_code: c.component_article_code,
      component_article_name: mockArticlesIndex[c.component_article_code]?.name || c.component_article_code,
      component_qty_retail: c.component_qty_retail,
    }));
    mockKits[kit_article_code] = mapped;
    return { count: mapped.length };
  }
  const count = await withTransaction(async (client: PoolClient) => {
    const kit = await client.query<{ id: number }>(
      `SELECT id FROM app.articles WHERE article_code = $1 LIMIT 1`,
      [kit_article_code]
    );
    if (!kit.rows[0]) {
      throw new Error("Kit no encontrado");
    }
    const kitId = Number(kit.rows[0].id);

    await client.query(`DELETE FROM app.article_kits WHERE kit_article_id = $1`, [kitId]);

    for (const component of components) {
      const comp = await client.query<{ id: number }>(
        `SELECT id FROM app.articles WHERE article_code = $1 LIMIT 1`,
        [component.component_article_code]
      );
      if (!comp.rows[0]) {
        throw new Error(`Componente no encontrado: ${component.component_article_code}`);
      }
      const componentId = Number(comp.rows[0].id);

      await client.query(
        `INSERT INTO app.article_kits(kit_article_id, component_article_id, component_qty_retail)
         VALUES($1, $2, $3)`,
        [kitId, componentId, component.component_qty_retail]
      );
    }

    return components.length;
  });

  return { count };
}
