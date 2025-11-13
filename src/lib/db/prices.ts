import "server-only";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";

export interface PriceListRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  currency_code: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface PriceListItemRow {
  article_id: number;
  article_code: string;
  name: string;
  unit: string;
  price: number;
  currency_code: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string | null;
}

type MockPriceList = PriceListRow;
type MockPrice = {
  article_code: string;
  price_list_code: string;
  price: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  updated_at: string;
};

const mockPriceLists: MockPriceList[] = [
  {
    id: 1,
    code: "BASE",
    name: "BASE",
    description: "Lista predeterminada",
    currency_code: process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    is_active: true,
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockPrices: MockPrice[] = [];

function normalizeCurrency(code: string | undefined | null): string {
  const fallback = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO";
  const trimmed = (code || fallback).trim().toUpperCase();
  return trimmed.length === 3 ? trimmed : fallback;
}

function mapDbPriceListRow(row: {
  id: number;
  code: string;
  name: string;
  description: string | null;
  currency_code: string | null;
  start_date: Date;
  end_date: Date | null;
  is_active: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date | null;
}): PriceListRow {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    currency_code: normalizeCurrency(row.currency_code),
    start_date: String(row.start_date).slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
    is_active: !!row.is_active,
    is_default: !!row.is_default,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
  } satisfies PriceListRow;
}

export async function listPriceLists(): Promise<PriceListRow[]> {
  if (env.useMockData) {
    return mockPriceLists.map((row) => ({ ...row }));
  }

  const res = await query({
    text: `SELECT id,
                  code,
                  name,
                  description,
                  currency_code,
                  start_date,
                  end_date,
                  is_active,
                  is_default,
                  created_at,
                  updated_at
             FROM app.price_lists
            ORDER BY is_default DESC, name ASC`,
  });

  return res.rows.map((row) => mapDbPriceListRow(row));
}

export async function getPriceListByCode(code: string): Promise<PriceListRow | null> {
  const normalized = code.trim().toUpperCase();
  if (env.useMockData) {
    const match = mockPriceLists.find((list) => list.code === normalized);
    return match ? { ...match } : null;
  }

  const res = await query({
    text: `SELECT id,
                  code,
                  name,
                  description,
                  currency_code,
                  start_date,
                  end_date,
                  is_active,
                  is_default,
                  created_at,
                  updated_at
             FROM app.price_lists
            WHERE code = $1
            LIMIT 1`,
    values: [normalized],
  });

  const row = res.rows[0];
  return row ? mapDbPriceListRow(row) : null;
}

export async function getDefaultPriceListCodeFromDb(client?: PoolClient): Promise<string | null> {
  if (env.useMockData) {
    const match = mockPriceLists.find((list) => list.is_default) ?? mockPriceLists[0] ?? null;
    return match ? match.code : null;
  }

  const executor = client ? client.query.bind(client) : query;
  const res = await executor<{ code: string }>(
    `SELECT code FROM app.price_lists WHERE is_default = TRUE LIMIT 1`
  );

  return res.rows[0]?.code ?? null;
}

export async function upsertPriceList(input: {
  code: string;
  name?: string;
  description?: string | null;
  currency_code?: string | null;
  start_date?: string;
  end_date?: string | null;
  is_active?: boolean;
  is_default?: boolean;
}): Promise<{ id: number }> {
  if (env.useMockData) {
    const normalizedCode = input.code.trim().toUpperCase();
    const existingIndex = mockPriceLists.findIndex((list) => list.code === normalizedCode);
    const now = new Date().toISOString();
    const payload: MockPriceList = {
      id: existingIndex >= 0 ? mockPriceLists[existingIndex].id : mockPriceLists.length + 1,
      code: normalizedCode,
      name: input.name?.trim() || normalizedCode,
      description: input.description?.trim() || null,
      currency_code: normalizeCurrency(input.currency_code),
      start_date: (input.start_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      end_date: typeof input.end_date === "undefined" ? null : input.end_date,
      is_active: input.is_active ?? true,
      is_default: input.is_default ?? (existingIndex >= 0 ? mockPriceLists[existingIndex].is_default : false),
      created_at: existingIndex >= 0 ? mockPriceLists[existingIndex].created_at : now,
      updated_at: now,
    };

    if (payload.is_default) {
      for (const list of mockPriceLists) {
        list.is_default = list.code === payload.code;
      }
    }

    if (existingIndex >= 0) {
      mockPriceLists[existingIndex] = payload;
    } else {
      if (payload.is_default) {
        mockPriceLists.unshift(payload);
      } else {
        mockPriceLists.push(payload);
      }
    }

    return { id: payload.id };
  }

  const normalizedCode = input.code.trim().toUpperCase();
  const name = (input.name || normalizedCode).trim();
  const description = input.description?.trim() || null;
  const currency = normalizeCurrency(input.currency_code);
  const startDate = input.start_date ?? new Date().toISOString().slice(0, 10);
  const endDate = typeof input.end_date === "undefined" ? null : input.end_date;
  const isActive = typeof input.is_active === "boolean" ? input.is_active : true;
  const markAsDefault = input.is_default === true;

  return withTransaction(async (client) => {
    if (markAsDefault) {
      await client.query(`UPDATE app.price_lists SET is_default = FALSE WHERE is_default = TRUE AND code <> $1`, [normalizedCode]);
    }

    const result = await client.query<{ id: number }>(
      `INSERT INTO app.price_lists (code, name, description, currency_code, start_date, end_date, is_active, is_default)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8)
       ON CONFLICT (code)
       DO UPDATE SET name = EXCLUDED.name,
                     description = EXCLUDED.description,
                     currency_code = EXCLUDED.currency_code,
                     start_date = COALESCE(EXCLUDED.start_date, app.price_lists.start_date),
                     end_date = EXCLUDED.end_date,
                     is_active = COALESCE(EXCLUDED.is_active, app.price_lists.is_active),
                     is_default = CASE WHEN EXCLUDED.is_default THEN TRUE ELSE app.price_lists.is_default END
       RETURNING id`,
      [normalizedCode, name, description, currency, startDate, endDate, isActive, markAsDefault]
    );

    if (!markAsDefault && input.is_default === false) {
      await client.query(`UPDATE app.price_lists SET is_default = FALSE WHERE code = $1`, [normalizedCode]);
    } else if (markAsDefault) {
      await client.query(`UPDATE app.price_lists SET is_default = CASE WHEN code = $1 THEN TRUE ELSE FALSE END`, [normalizedCode]);
    }

    return { id: Number(result.rows[0].id) };
  });
}

export async function setPriceListActiveState(code: string, isActive: boolean): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (env.useMockData) {
    const match = mockPriceLists.find((list) => list.code === normalized);
    if (match) {
      match.is_active = isActive;
      match.updated_at = new Date().toISOString();
    }
    return;
  }

  await query(
    `UPDATE app.price_lists
        SET is_active = $2
      WHERE code = $1`,
    [normalized, isActive]
  );
}

export async function setPriceListAsDefault(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (env.useMockData) {
    for (const list of mockPriceLists) {
      list.is_default = list.code === normalized;
      list.updated_at = new Date().toISOString();
    }
    return;
  }

  await withTransaction(async (client) => {
    await client.query(`UPDATE app.price_lists SET is_default = FALSE WHERE is_default = TRUE AND code <> $1`, [normalized]);
    await client.query(`UPDATE app.price_lists SET is_default = TRUE WHERE code = $1`, [normalized]);
  });
}

function mapMockPriceToItemRow(entry: MockPrice): PriceListItemRow {
  return {
    article_id: Number.parseInt(entry.article_code.replace(/\D+/g, "") || "0", 10) || 0,
    article_code: entry.article_code,
    name: entry.article_code,
    unit: "UNIDAD",
    price: entry.price,
    currency_code: normalizeCurrency(null),
    is_active: entry.is_active,
    start_date: entry.start_date,
    end_date: entry.end_date,
    created_at: entry.updated_at,
    updated_at: entry.updated_at,
  } satisfies PriceListItemRow;
}

function mapDbPriceListItemRow(row: {
  article_id: number;
  article_code: string;
  name: string;
  unit_label: string;
  price: number;
  currency_code: string;
  is_active: boolean;
  start_date: Date;
  end_date: Date | null;
  created_at: Date;
  updated_at: Date | null;
}): PriceListItemRow {
  return {
    article_id: Number(row.article_id),
    article_code: row.article_code,
    name: row.name,
    unit: row.unit_label,
    price: Number(row.price),
    currency_code: normalizeCurrency(row.currency_code),
    is_active: !!row.is_active,
    start_date: row.start_date.toISOString().slice(0, 10),
    end_date: row.end_date ? row.end_date.toISOString().slice(0, 10) : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
  } satisfies PriceListItemRow;
}

export async function listPriceListItems(priceListCode: string): Promise<PriceListItemRow[]> {
  const normalized = priceListCode.trim().toUpperCase();
  if (env.useMockData) {
    return mockPrices
      .filter((row) => row.price_list_code === normalized)
      .map((row) => mapMockPriceToItemRow(row));
  }

  const res = await query({
    text: `SELECT ap.article_id,
                  a.article_code,
                  a.name,
                  COALESCE(ru.name, a.retail_unit) AS unit_label,
                  ap.price,
                  pl.currency_code,
                  ap.is_active,
                  ap.start_date,
                  ap.end_date,
                  ap.created_at,
                  ap.updated_at
             FROM app.article_prices ap
             INNER JOIN app.price_lists pl ON pl.id = ap.price_list_id
             INNER JOIN app.articles a ON a.id = ap.article_id
             LEFT JOIN app.units ru ON ru.id = a.retail_unit_id
            WHERE UPPER(pl.code) = $1
            ORDER BY a.article_code ASC`,
    values: [normalized],
  });

  return res.rows.map((row) => mapDbPriceListItemRow(row));
}

export async function setArticlePrice(input: {
  article_code: string;
  price_list_code: string;
  price: number;
  start_date?: string;
  end_date?: string | null;
}): Promise<{ success: true }> {
  const normalizedList = input.price_list_code.trim().toUpperCase();
  const normalizedArticle = input.article_code.trim().toUpperCase();
  const startDate = (input.start_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const endDate = typeof input.end_date === "undefined" ? null : input.end_date;

  if (env.useMockData) {
    const existing = mockPrices.find(
      (row) => row.price_list_code === normalizedList && row.article_code === normalizedArticle
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.price = input.price;
      existing.start_date = startDate;
      existing.end_date = endDate;
      existing.is_active = true;
      existing.updated_at = now;
    } else {
      mockPrices.push({
        article_code: normalizedArticle,
        price_list_code: normalizedList,
        price: input.price,
        start_date: startDate,
        end_date: endDate,
        is_active: true,
        updated_at: now,
      });
    }
    return { success: true };
  }

  await withTransaction(async (client) => {
    const priceList = await client.query<{ id: number; currency_code: string }>(
      `SELECT id, currency_code FROM app.price_lists WHERE code = $1 LIMIT 1`,
      [normalizedList]
    );

    let priceListId: number;
    if (priceList.rows[0]) {
      priceListId = Number(priceList.rows[0].id);
    } else {
      const insert = await client.query<{ id: number }>(
        `INSERT INTO app.price_lists (code, name, description, currency_code, start_date, is_active, is_default)
         VALUES ($1, $1, NULL, $2, CURRENT_DATE, TRUE, FALSE)
         ON CONFLICT (code)
         DO UPDATE SET name = app.price_lists.name
         RETURNING id`,
        [normalizedList, normalizeCurrency(null)]
      );
      priceListId = Number(insert.rows[0].id);
    }

    const article = await client.query<{ id: number }>(
      `SELECT id FROM app.articles WHERE UPPER(article_code) = $1 LIMIT 1`,
      [normalizedArticle]
    );
    if (!article.rows[0]) {
      throw new Error("Artículo no encontrado");
    }
    const articleId = Number(article.rows[0].id);

    await client.query(
      `INSERT INTO app.article_prices (article_id, price_list_id, price, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4::date, $5::date, TRUE)
       ON CONFLICT (article_id, price_list_id)
       DO UPDATE SET price = EXCLUDED.price,
                     start_date = EXCLUDED.start_date,
                     end_date = EXCLUDED.end_date,
                     is_active = TRUE,
                     updated_at = CURRENT_TIMESTAMP`,
      [articleId, priceListId, input.price, startDate, endDate]
    );
  });

  return { success: true };
}

export async function setArticlePriceActive(params: {
  article_code: string;
  price_list_code: string;
  is_active: boolean;
}): Promise<void> {
  const normalizedList = params.price_list_code.trim().toUpperCase();
  const normalizedArticle = params.article_code.trim().toUpperCase();
  if (env.useMockData) {
    const target = mockPrices.find(
      (row) => row.price_list_code === normalizedList && row.article_code === normalizedArticle
    );
    if (target) {
      target.is_active = params.is_active;
      target.updated_at = new Date().toISOString();
    }
    return;
  }

  await withTransaction(async (client) => {
    const priceList = await client.query<{ id: number }>(
      `SELECT id FROM app.price_lists WHERE UPPER(code) = $1 LIMIT 1`,
      [normalizedList]
    );
    if (!priceList.rows[0]) {
      return;
    }

    const article = await client.query<{ id: number }>(
      `SELECT id FROM app.articles WHERE UPPER(article_code) = $1 LIMIT 1`,
      [normalizedArticle]
    );
    if (!article.rows[0]) {
      return;
    }

    await client.query(
      `UPDATE app.article_prices
          SET is_active = $3
        WHERE price_list_id = $1
          AND article_id = $2`,
      [Number(priceList.rows[0].id), Number(article.rows[0].id), params.is_active]
    );
  });
}

export async function removeArticleFromPriceList(params: {
  article_code: string;
  price_list_code: string;
}): Promise<void> {
  const normalizedList = params.price_list_code.trim().toUpperCase();
  const normalizedArticle = params.article_code.trim().toUpperCase();
  if (env.useMockData) {
    const index = mockPrices.findIndex(
      (row) => row.price_list_code === normalizedList && row.article_code === normalizedArticle
    );
    if (index >= 0) {
      mockPrices.splice(index, 1);
    }
    return;
  }

  await withTransaction(async (client) => {
    const priceList = await client.query<{ id: number }>(
      `SELECT id FROM app.price_lists WHERE UPPER(code) = $1 LIMIT 1`,
      [normalizedList]
    );
    if (!priceList.rows[0]) {
      return;
    }

    const article = await client.query<{ id: number }>(
      `SELECT id FROM app.articles WHERE UPPER(article_code) = $1 LIMIT 1`,
      [normalizedArticle]
    );
    if (!article.rows[0]) {
      return;
    }

    await client.query(
      `DELETE FROM app.article_prices
        WHERE price_list_id = $1
          AND article_id = $2`,
      [Number(priceList.rows[0].id), Number(article.rows[0].id)]
    );
  });
}
