import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

export interface PriceListRow { id: number; code: string; name: string; start_date: string; end_date: string | null; is_active: boolean }

const mockPriceLists: PriceListRow[] = [ { id: 1, code: "BASE", name: "BASE", start_date: new Date().toISOString().slice(0,10), end_date: null, is_active: true } ];
const mockPrices: { article_code: string; price_list_code: string; price: number; start_date: string; end_date: string | null }[] = [];

export async function listPriceLists(): Promise<PriceListRow[]> {
  if (env.useMockData) return mockPriceLists;
  const pool = await getPool();
  const res = await pool.request().query("SELECT id, code, name, start_date, end_date, is_active FROM app.price_lists ORDER BY start_date DESC");
  return res.recordset.map(r => ({ id: Number(r.id), code: r.code, name: r.name, start_date: String(r.start_date).slice(0,10), end_date: r.end_date ? String(r.end_date).slice(0,10) : null, is_active: !!r.is_active }));
}

export async function upsertPriceList(input: { code: string; name?: string; start_date?: string; end_date?: string | null; is_active?: boolean }): Promise<{ id: number }> {
  if (env.useMockData) {
    const found = mockPriceLists.find(p => p.code.toUpperCase() === input.code.toUpperCase());
    if (found) {
      found.name = input.name || input.code;
      if (input.start_date) found.start_date = input.start_date;
      if (typeof input.end_date !== 'undefined') found.end_date = input.end_date || null;
      if (typeof input.is_active === 'boolean') found.is_active = input.is_active;
      return { id: found.id };
    }
    const id = mockPriceLists.length ? Math.max(...mockPriceLists.map(p => p.id)) + 1 : 1;
    mockPriceLists.push({ id, code: input.code, name: input.name || input.code, start_date: input.start_date || new Date().toISOString().slice(0,10), end_date: input.end_date || null, is_active: input.is_active ?? true });
    return { id };
  }
  const pool = await getPool();
  const req = pool.request();
  req.input("code", sql.NVarChar(30), input.code);
  req.input("name", sql.NVarChar(120), input.name || input.code);
  req.input("start_date", sql.Date, input.start_date || new Date());
  req.input("end_date", sql.Date, input.end_date || null);
  req.input("is_active", sql.Bit, input.is_active ?? true);
  const result = await req.query<{ id: number }>(`
    IF EXISTS (SELECT 1 FROM app.price_lists WHERE UPPER(code) = UPPER(@code))
    BEGIN
      UPDATE app.price_lists SET name=@name, start_date=ISNULL(@start_date, start_date), end_date=@end_date, is_active=@is_active WHERE UPPER(code) = UPPER(@code);
      SELECT id FROM app.price_lists WHERE UPPER(code) = UPPER(@code);
    END
    ELSE BEGIN
      INSERT INTO app.price_lists(code, name, start_date, end_date, is_active) VALUES(@code, @name, @start_date, @end_date, @is_active);
      SELECT SCOPE_IDENTITY() AS id;
    END`);
  return { id: Number(result.recordset[0].id) };
}

export async function setArticlePrice(input: { article_code: string; price_list_code: string; price: number; start_date: string; end_date?: string | null }) {
  if (env.useMockData) {
    mockPrices.push({ article_code: input.article_code, price_list_code: input.price_list_code, price: input.price, start_date: input.start_date, end_date: input.end_date ?? null });
    return { success: true };
  }
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const plReq = new sql.Request(tx);
    plReq.input("code", sql.NVarChar(30), input.price_list_code);
    const plRes = await plReq.query<{ id: number }>(`IF EXISTS (SELECT 1 FROM app.price_lists WHERE code=@code) SELECT id FROM app.price_lists WHERE code=@code ELSE BEGIN INSERT INTO app.price_lists(code, name, start_date, is_active) VALUES(@code, @code, CAST(GETDATE() AS DATE), 1); SELECT SCOPE_IDENTITY() AS id; END`);
    const price_list_id = Number(plRes.recordset[0].id);

    const artReq = new sql.Request(tx);
    artReq.input("code", sql.NVarChar(40), input.article_code);
    const artRes = await artReq.query<{ id: number }>(`SELECT id FROM app.articles WHERE article_code=@code`);
    if (!artRes.recordset[0]) throw new Error("Artículo no encontrado");
    const article_id = Number(artRes.recordset[0].id);

    const ins = new sql.Request(tx);
    ins.input("article_id", sql.BigInt, article_id);
    ins.input("price_list_id", sql.Int, price_list_id);
    ins.input("price", sql.Decimal(18,6), input.price);
    ins.input("start_date", sql.Date, input.start_date);
    ins.input("end_date", sql.Date, input.end_date ?? null);
    await ins.query(`INSERT INTO app.article_prices(article_id, price_list_id, price, start_date, end_date) VALUES(@article_id, @price_list_id, @price, @start_date, @end_date)`);

    await tx.commit();
    return { success: true };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
