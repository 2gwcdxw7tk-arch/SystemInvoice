import { PrismaClient, prisma } from "@/lib/db/prisma";

export type PriceListRow = {
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
};

export type PriceListItemRow = {
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
};

export class PriceListRepository {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async getDefaultPriceListCode(): Promise<string | null> {
    const row = await this.prisma.price_lists.findFirst({
      where: { is_default: true },
      select: { code: true },
    });
    return row?.code ?? null;
  }

  async listPriceLists(): Promise<PriceListRow[]> {
    const rows = await this.prisma.price_lists.findMany({
      orderBy: [{ is_default: "desc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        currency_code: true,
        start_date: true,
        end_date: true,
        is_active: true,
        is_default: true,
        created_at: true,
        updated_at: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      currency_code: r.currency_code,
      start_date: r.start_date.toISOString().slice(0, 10),
      end_date: r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
      is_active: r.is_active,
      is_default: r.is_default,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at ? r.updated_at.toISOString() : null,
    } satisfies PriceListRow));
  }

  async getPriceListByCode(code: string): Promise<PriceListRow | null> {
    const normalized = code.trim().toUpperCase();
    const r = await this.prisma.price_lists.findUnique({
      where: { code: normalized },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        currency_code: true,
        start_date: true,
        end_date: true,
        is_active: true,
        is_default: true,
        created_at: true,
        updated_at: true,
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      currency_code: r.currency_code,
      start_date: r.start_date.toISOString().slice(0, 10),
      end_date: r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
      is_active: r.is_active,
      is_default: r.is_default,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at ? r.updated_at.toISOString() : null,
    } satisfies PriceListRow;
  }

  async listPriceListItems(priceListCode: string): Promise<PriceListItemRow[]> {
    const normalized = priceListCode.trim().toUpperCase();
    const rows = await this.prisma.article_prices.findMany({
      where: { price_lists: { code: normalized } },
      orderBy: [{ articles: { article_code: "asc" } }],
      select: {
        article_id: true,
        price: true,
        start_date: true,
        end_date: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        price_lists: { select: { currency_code: true } },
        articles: {
          select: {
            article_code: true,
            name: true,
            retail_unit: true,
            units_articles_retail_unit_idTounits: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      article_id: Number(r.article_id),
      article_code: r.articles.article_code,
      name: r.articles.name,
      unit: r.articles.units_articles_retail_unit_idTounits?.name ?? r.articles.retail_unit ?? "UNIDAD",
      price: Number(r.price),
      currency_code: r.price_lists.currency_code,
      is_active: r.is_active,
      start_date: r.start_date.toISOString().slice(0, 10),
      end_date: r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at ? r.updated_at.toISOString() : null,
    } satisfies PriceListItemRow));
  }

  async upsertPriceList(input: {
    code: string;
    name?: string;
    description?: string | null;
    currency_code?: string | null;
    start_date?: string;
    end_date?: string | null;
    is_active?: boolean;
    is_default?: boolean;
  }): Promise<{ id: number }> {
    const normalizedCode = input.code.trim().toUpperCase();
    const markDefault = input.is_default === true;
    const res = await this.prisma.$transaction(async (tx) => {
      if (markDefault) {
        await tx.price_lists.updateMany({ data: { is_default: false }, where: { is_default: true, code: { not: normalizedCode } } });
      }
      const row = await tx.price_lists.upsert({
        where: { code: normalizedCode },
        update: {
          name: (input.name ?? normalizedCode).trim(),
          description: input.description ?? null,
          currency_code: (input.currency_code ?? "NIO").toUpperCase(),
          start_date: input.start_date ? new Date(input.start_date) : undefined,
          end_date: typeof input.end_date === "undefined" ? undefined : input.end_date ? new Date(input.end_date) : null,
          is_active: typeof input.is_active === "boolean" ? input.is_active : undefined,
          is_default: markDefault ? true : undefined,
        },
        create: {
          code: normalizedCode,
          name: (input.name ?? normalizedCode).trim(),
          description: input.description ?? null,
          currency_code: (input.currency_code ?? "NIO").toUpperCase(),
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: typeof input.end_date === "undefined" ? null : input.end_date ? new Date(input.end_date) : null,
          is_active: typeof input.is_active === "boolean" ? input.is_active : true,
          is_default: markDefault,
        },
        select: { id: true },
      });
      if (!markDefault && input.is_default === false) {
        await tx.price_lists.update({ where: { code: normalizedCode }, data: { is_default: false } });
      }
      return { id: row.id };
    });
    return { id: res.id };
  }

  async setPriceListActiveState(code: string, isActive: boolean): Promise<void> {
    const normalized = code.trim().toUpperCase();
    await this.prisma.price_lists.update({ where: { code: normalized }, data: { is_active: !!isActive } });
  }

  async setPriceListAsDefault(code: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      await tx.price_lists.updateMany({ data: { is_default: false }, where: { is_default: true, code: { not: normalized } } });
      await tx.price_lists.update({ where: { code: normalized }, data: { is_default: true } });
    });
  }

  async setArticlePrice(input: {
    article_code: string;
    price_list_code: string;
    price: number;
    start_date?: string;
    end_date?: string | null;
  }): Promise<{ success: true }> {
    const listCode = input.price_list_code.trim().toUpperCase();
    const articleCode = input.article_code.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      const list = await tx.price_lists.upsert({
        where: { code: listCode },
        update: {},
        create: { code: listCode, name: listCode, start_date: new Date(), currency_code: "NIO", is_active: true, is_default: false },
        select: { id: true },
      });
      const art = await tx.articles.findUnique({ where: { article_code: articleCode }, select: { id: true } });
      if (!art) throw new Error("Artículo no encontrado");
      await tx.article_prices.upsert({
        where: { article_id_price_list_id: { article_id: art.id, price_list_id: list.id } },
        update: {
          price: input.price,
          start_date: input.start_date ? new Date(input.start_date) : undefined,
          end_date: typeof input.end_date === "undefined" ? undefined : input.end_date ? new Date(input.end_date) : null,
          is_active: true,
          updated_at: new Date(),
        },
        create: {
          article_id: art.id,
          price_list_id: list.id,
          price: input.price,
          start_date: input.start_date ? new Date(input.start_date) : new Date(),
          end_date: typeof input.end_date === "undefined" ? null : input.end_date ? new Date(input.end_date) : null,
          is_active: true,
        },
      });
    });
    return { success: true } as const;
  }

  async setArticlePriceActive(params: { article_code: string; price_list_code: string; is_active: boolean }): Promise<void> {
    const listCode = params.price_list_code.trim().toUpperCase();
    const articleCode = params.article_code.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      const list = await tx.price_lists.findUnique({ where: { code: listCode }, select: { id: true } });
      if (!list) return;
      const art = await tx.articles.findUnique({ where: { article_code: articleCode }, select: { id: true } });
      if (!art) return;
      await tx.article_prices.update({
        where: { article_id_price_list_id: { article_id: art.id, price_list_id: list.id } },
        data: { is_active: !!params.is_active, updated_at: new Date() },
      }).catch(() => undefined);
    });
  }

  async removeArticleFromPriceList(params: { article_code: string; price_list_code: string }): Promise<void> {
    const listCode = params.price_list_code.trim().toUpperCase();
    const articleCode = params.article_code.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      const list = await tx.price_lists.findUnique({ where: { code: listCode }, select: { id: true } });
      if (!list) return;
      const art = await tx.articles.findUnique({ where: { article_code: articleCode }, select: { id: true } });
      if (!art) return;
      await tx.article_prices.delete({
        where: { article_id_price_list_id: { article_id: art.id, price_list_id: list.id } },
      }).catch(() => undefined);
    });
  }
}

export const priceListRepository = new PriceListRepository();
