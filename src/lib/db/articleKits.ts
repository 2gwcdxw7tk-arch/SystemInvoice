import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

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
  const pool = await getPool();
  const req = pool.request();
  req.input("kit_article_code", sql.NVarChar(40), kit_article_code);
  const result = await req.query<{
    component_article_id: number;
    component_article_code: string;
    component_article_name: string;
    component_qty_retail: number;
  }>(`
    SELECT ak.component_article_id, ca.article_code AS component_article_code, ca.name AS component_article_name, ak.component_qty_retail
    FROM app.article_kits ak
    INNER JOIN app.articles ka ON ka.id = ak.kit_article_id AND ka.article_code = @kit_article_code
    INNER JOIN app.articles ca ON ca.id = ak.component_article_id
    ORDER BY ca.name`);
  return result.recordset.map(r => ({
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
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // Obtener ID del kit
    const kitReq = new sql.Request(tx);
    kitReq.input("code", sql.NVarChar(40), kit_article_code);
    const kitRes = await kitReq.query<{ id: number }>(`SELECT id FROM app.articles WHERE article_code = @code`);
    if (!kitRes.recordset[0]) throw new Error("Kit no encontrado");
    const kitId = Number(kitRes.recordset[0].id);

    // Limpiar componentes actuales
    await new sql.Request(tx)
      .input("kit_id", sql.BigInt, kitId)
      .query(`DELETE FROM app.article_kits WHERE kit_article_id = @kit_id`);

    // Insertar nuevos
    for (const c of components) {
      const compReq = new sql.Request(tx);
      compReq.input("code", sql.NVarChar(40), c.component_article_code);
      const compRes = await compReq.query<{ id: number }>(`SELECT id FROM app.articles WHERE article_code = @code`);
      if (!compRes.recordset[0]) throw new Error(`Componente no encontrado: ${c.component_article_code}`);
      const compId = Number(compRes.recordset[0].id);

      const ins = new sql.Request(tx);
      ins.input("kit_id", sql.BigInt, kitId);
      ins.input("comp_id", sql.BigInt, compId);
      ins.input("qty", sql.Decimal(18,6), c.component_qty_retail);
      await ins.query(`INSERT INTO app.article_kits(kit_article_id, component_article_id, component_qty_retail) VALUES(@kit_id, @comp_id, @qty)`);
    }

    await tx.commit();
    return { count: components.length };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
