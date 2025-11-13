import "server-only";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";

export interface PriceListRow { id: number; code: string; name: string; start_date: string; end_date: string | null; is_active: boolean }

const mockPriceLists: PriceListRow[] = [ { id: 1, code: "BASE", name: "BASE", start_date: new Date().toISOString().slice(0,10), end_date: null, is_active: true } ];
const mockPrices: { article_code: string; price_list_code: string; price: number; start_date: string; end_date: string | null }[] = [];

export async function listPriceLists(): Promise<PriceListRow[]> {
  if (env.useMockData) return mockPriceLists;
  const res = await query<{ id: number; code: string; name: string; start_date: Date; end_date: Date | null; is_active: boolean }>(
    "SELECT id, code, name, start_date, end_date, is_active FROM app.price_lists ORDER BY start_date DESC"
  );
  return res.rows.map(r => ({ id: Number(r.id), code: r.code, name: r.name, start_date: String(r.start_date).slice(0,10), end_date: r.end_date ? String(r.end_date).slice(0,10) : null, is_active: !!r.is_active }));
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
  const normalizedCode = input.code.trim().toUpperCase();
  const name = (input.name || normalizedCode).trim();
  const startDate = input.start_date ?? new Date().toISOString().slice(0, 10);
  const endDate = typeof input.end_date === "undefined" ? null : input.end_date;
  const isActive = typeof input.is_active === "boolean" ? input.is_active : true;

  const result = await query<{ id: number }>(
    `INSERT INTO app.price_lists(code, name, start_date, end_date, is_active)
     VALUES($1, $2, $3::date, $4::date, $5)
     ON CONFLICT (code)
     DO UPDATE SET name = EXCLUDED.name,
                   start_date = COALESCE(EXCLUDED.start_date, app.price_lists.start_date),
                   end_date = EXCLUDED.end_date,
                   is_active = EXCLUDED.is_active
     RETURNING id`,
    [normalizedCode, name, startDate, endDate, isActive]
  );

  return { id: Number(result.rows[0].id) };
}

export async function setArticlePrice(input: { article_code: string; price_list_code: string; price: number; start_date: string; end_date?: string | null }) {
  if (env.useMockData) {
    mockPrices.push({ article_code: input.article_code, price_list_code: input.price_list_code, price: input.price, start_date: input.start_date, end_date: input.end_date ?? null });
    return { success: true };
  }
  await withTransaction(async (client: PoolClient) => {
    const priceList = await client.query<{ id: number }>(
      `INSERT INTO app.price_lists(code, name, start_date, is_active)
       VALUES($1, $1, CURRENT_DATE, TRUE)
       ON CONFLICT (code)
       DO UPDATE SET name = app.price_lists.name
       RETURNING id`,
      [input.price_list_code.trim().toUpperCase()]
    );
    const priceListId = Number(priceList.rows[0].id);

    const article = await client.query<{ id: number }>(
      `SELECT id FROM app.articles WHERE article_code = $1 LIMIT 1`,
      [input.article_code]
    );
    if (!article.rows[0]) {
      throw new Error("Artículo no encontrado");
    }
    const articleId = Number(article.rows[0].id);

    await client.query(
      `INSERT INTO app.article_prices(article_id, price_list_id, price, start_date, end_date)
       VALUES($1, $2, $3, $4::date, $5::date)
       ON CONFLICT DO NOTHING`,
      [articleId, priceListId, input.price, input.start_date, input.end_date ?? null]
    );
  });

  return { success: true };
}
