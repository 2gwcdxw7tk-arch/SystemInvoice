import { env } from "@/lib/env";
import { ArticleService } from "@/lib/services/ArticleService";
import { WarehouseService } from "@/lib/services/WarehouseService";
import type { IArticleWarehouseRepository } from "@/lib/repositories/IArticleWarehouseRepository";
import { ArticleWarehouseRepository } from "@/lib/repositories/ArticleWarehouseRepository";
import type { WarehouseRecord } from "@/lib/repositories/IWarehouseRepository";
import { prisma } from "@/lib/db/prisma";

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

type MockAssociation = {
  articleId: number;
  warehouseId: number;
  isPrimary: boolean;
  associatedAt: string;
};

export type ArticleWarehouseOverview = {
  article: {
    id: number;
    code: string;
    name: string;
    defaultWarehouseId: number | null;
  };
  warehouses: Array<
    WarehouseRecord & {
      isAssociated: boolean;
      isPrimary: boolean;
      associatedAt: string | null;
    }
  >;
};

export class ArticleWarehouseService {
  private readonly repository: IArticleWarehouseRepository;
  private readonly articleService: ArticleService;
  private readonly warehouseService: WarehouseService;
  private readonly mockAssociations: MockAssociation[];

  constructor(
    repository: IArticleWarehouseRepository = new ArticleWarehouseRepository(),
    articleSvc: ArticleService = new ArticleService(),
    warehouseSvc: WarehouseService = new WarehouseService()
  ) {
    this.repository = repository;
    this.articleService = articleSvc;
    this.warehouseService = warehouseSvc;
    this.mockAssociations = [];
  }

  private findMockAssociation(articleId: number, warehouseId: number): MockAssociation | undefined {
    return this.mockAssociations.find(
      (item) => item.articleId === articleId && item.warehouseId === warehouseId
    );
  }

  private ensureMockPrimary(articleId: number, newPrimaryId: number | null): void {
    this.mockAssociations.forEach((item) => {
      if (item.articleId === articleId) {
        item.isPrimary = item.warehouseId === newPrimaryId;
      }
    });
  }

  async getArticleWarehouseOverview(articleCode: string): Promise<ArticleWarehouseOverview | null> {
    const normalizedCode = normalizeCode(articleCode);
    const article = await this.articleService.getArticleByCode(normalizedCode);
    if (!article) {
      return null;
    }

    const allWarehouses = await this.warehouseService.listWarehouses({ includeInactive: true });

    if (env.useMockData) {
      const associations = this.mockAssociations.filter((row) => row.articleId === article.id);
      return {
        article: {
          id: article.id,
          code: article.article_code,
          name: article.name,
          defaultWarehouseId: associations.find((row) => row.isPrimary)?.warehouseId ?? null,
        },
        warehouses: allWarehouses.map((warehouse) => {
          const association = associations.find((row) => row.warehouseId === warehouse.id);
          return {
            ...warehouse,
            isAssociated: Boolean(association),
            isPrimary: Boolean(association?.isPrimary),
            associatedAt: association?.associatedAt ?? null,
          };
        }),
      } satisfies ArticleWarehouseOverview;
    }

    const associations = await this.repository.listAssociations(article.id);
    return {
      article: {
        id: article.id,
        code: article.article_code,
        name: article.name,
        defaultWarehouseId: article.default_warehouse_id ?? null,
      },
      warehouses: allWarehouses.map((warehouse) => {
        const association = associations.find((row) => row.warehouseId === warehouse.id);
        return {
          ...warehouse,
          isAssociated: Boolean(association),
          isPrimary: Boolean(association?.isPrimary),
          associatedAt: association?.associatedAt ?? null,
        };
      }),
    } satisfies ArticleWarehouseOverview;
  }

  async associateWarehouse(params: {
    articleCode: string;
    warehouseCode: string;
    makePrimary?: boolean;
  }): Promise<ArticleWarehouseOverview> {
    const normalizedArticleCode = normalizeCode(params.articleCode);
    const normalizedWarehouseCode = normalizeCode(params.warehouseCode);
    const makePrimary = Boolean(params.makePrimary);

    const article = await this.articleService.getArticleByCode(normalizedArticleCode);
    if (!article) {
      throw new Error(`El artículo ${normalizedArticleCode} no existe`);
    }

    const warehouse = await this.warehouseService.getWarehouseByCode(normalizedWarehouseCode);
    if (!warehouse) {
      throw new Error(`La bodega ${normalizedWarehouseCode} no existe`);
    }

    if (env.useMockData) {
      let association = this.findMockAssociation(article.id, warehouse.id);
      if (!association) {
        association = {
          articleId: article.id,
          warehouseId: warehouse.id,
          isPrimary: false,
          associatedAt: new Date().toISOString(),
        } satisfies MockAssociation;
        this.mockAssociations.push(association);
      }

      association.isPrimary = makePrimary ? true : association.isPrimary;
      if (makePrimary) {
        this.ensureMockPrimary(article.id, warehouse.id);
      }

      return this.getArticleWarehouseOverview(normalizedArticleCode).then((overview) => {
        if (!overview) {
          throw new Error("No se pudo refrescar la información del artículo");
        }
        return overview;
      });
    }

    await prisma.$transaction(async (tx) => {
      if (makePrimary) {
        await this.repository.clearPrimary(article.id, tx);
      }

      await this.repository.upsertAssociation(
        { articleId: article.id, warehouseId: warehouse.id, isPrimary: makePrimary },
        tx
      );

      const currentDefault = article.default_warehouse_id ?? null;
      const targetDefault = makePrimary ? warehouse.id : currentDefault;
      if (targetDefault !== currentDefault) {
        await this.repository.updateArticleDefaultWarehouse(
          { articleId: article.id, warehouseId: targetDefault },
          tx
        );
      }
    });

    const overview = await this.getArticleWarehouseOverview(normalizedArticleCode);
    if (!overview) {
      throw new Error("No se pudo refrescar la información del artículo");
    }
    return overview;
  }

  async markPrimaryWarehouse(params: {
    articleCode: string;
    warehouseCode: string;
  }): Promise<ArticleWarehouseOverview> {
    return this.associateWarehouse({ ...params, makePrimary: true });
  }

  async removeAssociation(params: {
    articleCode: string;
    warehouseCode: string;
  }): Promise<ArticleWarehouseOverview> {
    const normalizedArticleCode = normalizeCode(params.articleCode);
    const normalizedWarehouseCode = normalizeCode(params.warehouseCode);

    const article = await this.articleService.getArticleByCode(normalizedArticleCode);
    if (!article) {
      throw new Error(`El artículo ${normalizedArticleCode} no existe`);
    }

    const warehouse = await this.warehouseService.getWarehouseByCode(normalizedWarehouseCode);
    if (!warehouse) {
      throw new Error(`La bodega ${normalizedWarehouseCode} no existe`);
    }

    if (env.useMockData) {
      const index = this.mockAssociations.findIndex(
        (item) => item.articleId === article.id && item.warehouseId === warehouse.id
      );
      if (index !== -1) {
        this.mockAssociations.splice(index, 1);
      }
      return this.getArticleWarehouseOverview(normalizedArticleCode).then((overview) => {
        if (!overview) {
          throw new Error("No se pudo refrescar la información del artículo");
        }
        return overview;
      });
    }

    await prisma.$transaction(async (tx) => {
      await this.repository.removeAssociation({ articleId: article.id, warehouseId: warehouse.id }, tx);

      if (article.default_warehouse_id === warehouse.id) {
        await this.repository.updateArticleDefaultWarehouse({ articleId: article.id, warehouseId: null }, tx);
      }
    });

    const overview = await this.getArticleWarehouseOverview(normalizedArticleCode);
    if (!overview) {
      throw new Error("No se pudo refrescar la información del artículo");
    }
    return overview;
  }
}

export const articleWarehouseService = new ArticleWarehouseService();
