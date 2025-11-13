import "server-only";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";
import { listUnits } from "@/lib/db/units";
import { getDefaultPriceListCodeFromDb } from "@/lib/db/prices";

export interface ArticleInput {
  article_code: string;
  name: string;
  classification_full_code?: string | null;
  storage_unit_id: number; // referencia a app.units
  retail_unit_id: number;  // referencia a app.units
  conversion_factor: number; // cuántas retail equivale 1 storage
  article_type: "TERMINADO" | "KIT";
  default_warehouse_id?: number | null;
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
}

export interface ArticleRow {
  id: number;
  article_code: string;
  name: string;
  classification_full_code: string | null;
  storage_unit: string; // nombre de unidad
  retail_unit: string;  // nombre de unidad
  storage_unit_id?: number | null; // agregado para fallback de edición
  retail_unit_id?: number | null;  // agregado para fallback de edición
  conversion_factor: number;
  is_active: boolean;
  article_type: "TERMINADO" | "KIT";
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
}

export interface EffectivePriceQuery {
  price_list_code?: string; // default env.DEFAULT_PRICE_LIST_CODE
  unit?: "RETAIL" | "STORAGE";
  on_date?: string; // YYYY-MM-DD
}

export interface EffectivePriceResult {
  unit: "RETAIL" | "STORAGE";
  base_price: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ArticleDetail {
  id: number;
  article_code: string;
  name: string;
  article_type: "TERMINADO" | "KIT";
  storage_unit_id: number | null;
  retail_unit_id: number | null;
  storage_unit?: string | null;
  retail_unit?: string | null;
  conversion_factor: number;
  default_warehouse_id: number | null;
  classification_level1_id: number | null;
  classification_level2_id: number | null;
  classification_level3_id: number | null;
  c1_full_code?: string | null;
  c2_full_code?: string | null;
  c3_full_code?: string | null;
}

// Mock stores
type MockArticle = Omit<ArticleRow, "storage_unit"|"retail_unit"> & {
  storage_unit_id: number;
  retail_unit_id: number;
  storage_unit: string;
  retail_unit: string;
  default_warehouse_id?: number | null;
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
};

const mockArticles: MockArticle[] = [];
const mockPriceLists: { id: number; code: string; name: string; start_date: string; end_date: string | null; is_active: boolean }[] = [];
const mockPrices: { id: number; article_id: number; price_list_id: number; price: number; start_date: string; end_date: string | null }[] = [];

async function resolveDefaultPriceListCode(): Promise<string> {
  if (env.useMockData) {
    return process.env.DEFAULT_PRICE_LIST_CODE || "BASE";
  }
  const fromDb = await getDefaultPriceListCodeFromDb();
  return fromDb ?? process.env.DEFAULT_PRICE_LIST_CODE ?? "BASE";
}

type ArticleQueryRow = {
  id: number;
  article_code: string;
  name: string;
  classification_full_code: string | null;
  conversion_factor: number;
  is_active: boolean;
  article_type: "TERMINADO" | "KIT";
  storage_unit_id: number | null;
  retail_unit_id: number | null;
  classification_level1_id: number | null;
  classification_level2_id: number | null;
  classification_level3_id: number | null;
  storage_unit: string | null;
  retail_unit: string | null;
  base_price: number | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
};

type ArticleDetailRow = {
  id: number;
  article_code: string;
  name: string;
  article_type: "TERMINADO" | "KIT";
  storage_unit_id: number | null;
  retail_unit_id: number | null;
  conversion_factor: number;
  default_warehouse_id: number | null;
  classification_level1_id: number | null;
  classification_level2_id: number | null;
  classification_level3_id: number | null;
  storage_unit: string | null;
  retail_unit: string | null;
  c1_full_code: string | null;
  c2_full_code: string | null;
  c3_full_code: string | null;
};

export async function upsertArticle(input: ArticleInput): Promise<{ id: number }> {
  if (env.useMockData) {
    let row = mockArticles.find(a => a.article_code === input.article_code);
    if (!row) {
      row = {
        id: mockArticles.length + 1,
        article_code: input.article_code,
        name: input.name,
        classification_full_code: input.classification_full_code ?? null,
        storage_unit: String(input.storage_unit_id),
        retail_unit: String(input.retail_unit_id),
        storage_unit_id: input.storage_unit_id,
        retail_unit_id: input.retail_unit_id,
        conversion_factor: input.conversion_factor,
        article_type: input.article_type,
        is_active: true,
        default_warehouse_id: input.default_warehouse_id ?? null,
        classification_level1_id: input.classification_level1_id ?? null,
        classification_level2_id: input.classification_level2_id ?? null,
        classification_level3_id: input.classification_level3_id ?? null,
      };
      mockArticles.push(row);
    } else {
      row.name = input.name;
      row.classification_full_code = input.classification_full_code ?? null;
      row.storage_unit_id = input.storage_unit_id;
      row.retail_unit_id = input.retail_unit_id;
      row.storage_unit = String(input.storage_unit_id);
      row.retail_unit = String(input.retail_unit_id);
      row.conversion_factor = input.conversion_factor;
      row.article_type = input.article_type;
      row.default_warehouse_id = input.default_warehouse_id ?? null;
      row.classification_level1_id = input.classification_level1_id ?? null;
      row.classification_level2_id = input.classification_level2_id ?? null;
      row.classification_level3_id = input.classification_level3_id ?? null;
    }
    return { id: row.id };
  }

  const normalizedCode = input.article_code.trim().toUpperCase();
  const normalizedName = input.name.trim();
  const classificationFullCode = input.classification_full_code?.trim() ?? null;

  const articleId = await withTransaction(async (client: PoolClient) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO app.articles (
        article_code,
        name,
        classification_full_code,
        storage_unit_id,
        retail_unit_id,
        conversion_factor,
        article_type,
        default_warehouse_id,
        classification_level1_id,
        classification_level2_id,
        classification_level3_id
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )
      ON CONFLICT (article_code)
      DO UPDATE SET
        name = EXCLUDED.name,
        classification_full_code = EXCLUDED.classification_full_code,
        storage_unit_id = EXCLUDED.storage_unit_id,
        retail_unit_id = EXCLUDED.retail_unit_id,
        conversion_factor = EXCLUDED.conversion_factor,
        article_type = EXCLUDED.article_type,
        default_warehouse_id = EXCLUDED.default_warehouse_id,
        classification_level1_id = EXCLUDED.classification_level1_id,
        classification_level2_id = EXCLUDED.classification_level2_id,
        classification_level3_id = EXCLUDED.classification_level3_id
      RETURNING id`,
      [
        normalizedCode,
        normalizedName,
        classificationFullCode,
        input.storage_unit_id,
        input.retail_unit_id,
        input.conversion_factor,
        input.article_type,
        input.default_warehouse_id ?? null,
        input.classification_level1_id ?? null,
        input.classification_level2_id ?? null,
        input.classification_level3_id ?? null,
      ]
    );

    return Number(result.rows[0].id);
  });

  return { id: articleId };
}

export async function getArticles(params: EffectivePriceQuery = {}): Promise<Array<ArticleRow & { price: EffectivePriceResult | null }>> {
  const priceListCode = (params.price_list_code ? params.price_list_code : await resolveDefaultPriceListCode()).toUpperCase();
  const today = params.on_date || new Date().toISOString().slice(0,10);
  const preferUnit = params.unit || "RETAIL";

  if (env.useMockData) {
    const pl = mockPriceLists.find(p => p.code.toUpperCase() === priceListCode);
    // Resolver nombres de unidades desde el catálogo de unidades
    const units = await listUnits();
    const out: Array<ArticleRow & { price: EffectivePriceResult | null }> = mockArticles.map(a => {
      const suName = units.find(u => u.id === a.storage_unit_id)?.name ?? String(a.storage_unit_id);
      const ruName = units.find(u => u.id === a.retail_unit_id)?.name ?? String(a.retail_unit_id);
      let base = mockPrices
        .filter(p => p.article_id === a.id && (!pl || p.price_list_id === pl.id) && (!p.end_date || p.end_date >= today) && p.start_date <= today)
        .sort((a,b) => b.start_date.localeCompare(a.start_date))[0];
      if (!base && pl) {
        base = mockPrices
          .filter(p => p.article_id === a.id && p.price_list_id === pl.id)
          .sort((a,b) => b.start_date.localeCompare(a.start_date))[0];
      }
      if (!base) return { ...a, storage_unit: suName, retail_unit: ruName, price: null };
      // Precio base se almacena en unidad detalle; convertir si se pide almacenamiento
      let price = base.price;
      const unit: "RETAIL" | "STORAGE" = preferUnit;
      if (preferUnit === "STORAGE") price = price * a.conversion_factor;
      return { ...a, storage_unit: suName, retail_unit: ruName, price: { unit, base_price: price, start_date: base.start_date, end_date: base.end_date } };
    });
    return out;
  }

  const result = await query<ArticleQueryRow>(
    `WITH pl AS (
       SELECT id FROM app.price_lists WHERE UPPER(code) = $1
     )
     SELECT a.id,
            a.article_code,
            a.name,
            a.classification_full_code,
            a.conversion_factor,
            a.is_active,
            a.article_type,
            a.storage_unit_id,
            a.retail_unit_id,
            a.classification_level1_id,
            a.classification_level2_id,
            a.classification_level3_id,
            su.name AS storage_unit,
            ru.name AS retail_unit,
            ap.price AS base_price,
            ap.start_date,
            ap.end_date
     FROM app.articles a
     LEFT JOIN app.units su ON su.id = a.storage_unit_id
     LEFT JOIN app.units ru ON ru.id = a.retail_unit_id
     LEFT JOIN LATERAL (
       SELECT price, start_date, end_date
       FROM app.article_prices ap
       WHERE ap.article_id = a.id
         AND ap.price_list_id IN (SELECT id FROM pl)
         AND ap.is_active = TRUE
       ORDER BY ap.start_date DESC
       LIMIT 1
     ) ap ON true`,
    [priceListCode, today]
  );
  const rows = result.rows ?? [];
  return rows.map((r) => {
    let price = r.base_price == null ? null : Number(r.base_price);
    if (price != null && preferUnit === "STORAGE") {
      price = price * Number(r.conversion_factor);
    }
    const unit = preferUnit as "RETAIL" | "STORAGE";
    const priceObj: EffectivePriceResult | null = price != null
      ? {
          unit,
          base_price: Number(price),
          start_date: r.start_date ? String(r.start_date).slice(0, 10) : null,
          end_date: r.end_date ? String(r.end_date).slice(0, 10) : null,
        }
      : null;
    return {
      id: Number(r.id),
      article_code: r.article_code,
      name: r.name,
      classification_full_code: r.classification_full_code,
      storage_unit: r.storage_unit || "",
      retail_unit: r.retail_unit || "",
      storage_unit_id: r.storage_unit_id ? Number(r.storage_unit_id) : null,
      retail_unit_id: r.retail_unit_id ? Number(r.retail_unit_id) : null,
      conversion_factor: Number(r.conversion_factor),
      is_active: !!r.is_active,
      article_type: r.article_type as "TERMINADO" | "KIT",
      classification_level1_id: r.classification_level1_id ? Number(r.classification_level1_id) : null,
      classification_level2_id: r.classification_level2_id ? Number(r.classification_level2_id) : null,
      classification_level3_id: r.classification_level3_id ? Number(r.classification_level3_id) : null,
      price: priceObj,
    } satisfies ArticleRow & { price: EffectivePriceResult | null };
  });
}

export async function getArticleByCode(article_code: string): Promise<ArticleDetail | null> {
  if (env.useMockData) {
    const row = mockArticles.find(a => a.article_code === article_code);
    if (!row) return null;
    const units = await listUnits();
    const su = units.find(u => u.id === row.storage_unit_id)?.name || null;
    const ru = units.find(u => u.id === row.retail_unit_id)?.name || null;
    return {
      id: row.id,
      article_code: row.article_code,
      name: row.name,
      article_type: row.article_type,
      storage_unit_id: row.storage_unit_id,
      retail_unit_id: row.retail_unit_id,
      storage_unit: su,
      retail_unit: ru,
      conversion_factor: row.conversion_factor,
      default_warehouse_id: row.default_warehouse_id ?? null,
      classification_level1_id: row.classification_level1_id ?? null,
      classification_level2_id: row.classification_level2_id ?? null,
      classification_level3_id: row.classification_level3_id ?? null,
      c1_full_code: null,
      c2_full_code: null,
      c3_full_code: null,
    };
  }
  const result = await query<ArticleDetailRow>(
    `SELECT a.id,
            a.article_code,
            a.name,
            a.article_type,
            a.storage_unit_id,
            a.retail_unit_id,
            a.conversion_factor,
            a.default_warehouse_id,
            a.classification_level1_id,
            a.classification_level2_id,
            a.classification_level3_id,
            su.name AS storage_unit,
            ru.name AS retail_unit,
            c1.full_code AS c1_full_code,
            c2.full_code AS c2_full_code,
            c3.full_code AS c3_full_code
     FROM app.articles a
     LEFT JOIN app.units su ON su.id = a.storage_unit_id
     LEFT JOIN app.units ru ON ru.id = a.retail_unit_id
     LEFT JOIN app.article_classifications c1 ON c1.id = a.classification_level1_id
     LEFT JOIN app.article_classifications c2 ON c2.id = a.classification_level2_id
     LEFT JOIN app.article_classifications c3 ON c3.id = a.classification_level3_id
     WHERE a.article_code = $1
     LIMIT 1`,
    [article_code]
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    article_code: r.article_code,
    name: r.name,
    article_type: r.article_type as "TERMINADO" | "KIT",
    storage_unit_id: r.storage_unit_id ? Number(r.storage_unit_id) : null,
    retail_unit_id: r.retail_unit_id ? Number(r.retail_unit_id) : null,
    storage_unit: r.storage_unit || null,
    retail_unit: r.retail_unit || null,
    conversion_factor: Number(r.conversion_factor),
    default_warehouse_id: r.default_warehouse_id ? Number(r.default_warehouse_id) : null,
    classification_level1_id: r.classification_level1_id ? Number(r.classification_level1_id) : null,
    classification_level2_id: r.classification_level2_id ? Number(r.classification_level2_id) : null,
    classification_level3_id: r.classification_level3_id ? Number(r.classification_level3_id) : null,
    c1_full_code: r.c1_full_code || null,
    c2_full_code: r.c2_full_code || null,
    c3_full_code: r.c3_full_code || null,
  };
}

export async function deleteArticle(article_code: string): Promise<{ deleted: boolean }> {
  if (env.useMockData) {
    const idx = mockArticles.findIndex(a => a.article_code === article_code);
    if (idx >= 0) {
      mockArticles.splice(idx, 1);
      return { deleted: true };
    }
    return { deleted: false };
  }
  const result = await query<{ affected: number }>(
    `DELETE FROM app.articles WHERE article_code = $1 RETURNING 1 AS affected`,
    [article_code]
  );
  return { deleted: (result.rowCount ?? 0) > 0 };
}
