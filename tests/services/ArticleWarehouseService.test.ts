jest.mock("@/lib/env", () => ({
  env: {
    useMockData: true,
    MOCK_DATA: true,
    DB_CONNECTION_STRING: "postgresql://user:pass@localhost:5432/testdb?schema=app",
    isProduction: false,
    defaultSalesWarehouseCode: null,
  },
}));

import type { ArticleWarehouseOverview } from "@/lib/services/ArticleWarehouseService";
import { ArticleWarehouseService } from "@/lib/services/ArticleWarehouseService";
import type { IArticleWarehouseRepository } from "@/lib/repositories/IArticleWarehouseRepository";
import type { ArticleService } from "@/lib/services/ArticleService";
import type { WarehouseService } from "@/lib/services/WarehouseService";
import type { WarehouseRecord } from "@/lib/repositories/IWarehouseRepository";
import type { Article } from "@/lib/repositories/IArticleRepository";

type StubWarehouse = WarehouseRecord;

describe("ArticleWarehouseService (mock mode)", () => {
  const article: Article = {
    id: 1,
    article_code: "ART-001",
    name: "Artículo de prueba",
    classification_full_code: null,
    storage_unit: "Caja",
    retail_unit: "Pieza",
    storage_unit_id: 1,
    retail_unit_id: 1,
    conversion_factor: 1,
    is_active: true,
    article_type: "TERMINADO",
    default_warehouse_id: null,
    classification_level1_id: null,
    classification_level2_id: null,
    classification_level3_id: null,
    c1_full_code: null,
    c2_full_code: null,
    c3_full_code: null,
  } satisfies Article;

  const warehouses: StubWarehouse[] = [
    { id: 10, code: "PRINCIPAL", name: "Principal", isActive: true, createdAt: new Date().toISOString() },
    { id: 11, code: "COCINA", name: "Cocina", isActive: true, createdAt: new Date().toISOString() },
  ];

  const repositoryStub: IArticleWarehouseRepository = {
    listAssociations: jest.fn(),
    upsertAssociation: jest.fn(),
    clearPrimary: jest.fn(),
    removeAssociation: jest.fn(),
    updateArticleDefaultWarehouse: jest.fn(),
  };

  const articleServiceStub: Pick<ArticleService, "getArticleByCode"> = {
    getArticleByCode: jest.fn(async (code: string) => {
      return code === article.article_code ? { ...article } : null;
    }),
  };

  const warehouseServiceStub: Pick<WarehouseService, "listWarehouses" | "getWarehouseByCode"> = {
    listWarehouses: jest.fn(async () => warehouses.map((w) => ({ ...w }))),
    getWarehouseByCode: jest.fn(async (code: string) => {
      const found = warehouses.find((w) => w.code === code);
      return found ? { ...found } : null;
    }),
  };

  let service: ArticleWarehouseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArticleWarehouseService(
      repositoryStub,
      articleServiceStub as ArticleService,
      warehouseServiceStub as WarehouseService
    );
  });

  it("should list warehouses without associations initially", async () => {
    const overview = (await service.getArticleWarehouseOverview(article.article_code)) as ArticleWarehouseOverview;
    expect(overview).not.toBeNull();
    expect(overview.article.code).toBe(article.article_code);
    const associated = overview.warehouses.filter((w) => w.isAssociated);
    expect(associated).toHaveLength(0);
  });

  it("should associate a warehouse", async () => {
    await service.associateWarehouse({ articleCode: article.article_code, warehouseCode: "PRINCIPAL" });
    const overview = (await service.getArticleWarehouseOverview(article.article_code)) as ArticleWarehouseOverview;
    const principal = overview.warehouses.find((w) => w.code === "PRINCIPAL");
    expect(principal?.isAssociated).toBe(true);
    expect(principal?.isPrimary).toBe(false);
  });

  it("should mark the warehouse as primary", async () => {
    await service.associateWarehouse({ articleCode: article.article_code, warehouseCode: "PRINCIPAL" });
    await service.associateWarehouse({ articleCode: article.article_code, warehouseCode: "PRINCIPAL", makePrimary: true });
    const overview = (await service.getArticleWarehouseOverview(article.article_code)) as ArticleWarehouseOverview;
    const principal = overview.warehouses.find((w) => w.code === "PRINCIPAL");
    expect(principal?.isPrimary).toBe(true);
    expect(overview.article.defaultWarehouseId).toBe(principal?.id);
  });

  it("should remove the association", async () => {
    await service.associateWarehouse({ articleCode: article.article_code, warehouseCode: "PRINCIPAL" });
    await service.removeAssociation({ articleCode: article.article_code, warehouseCode: "PRINCIPAL" });
    const overview = (await service.getArticleWarehouseOverview(article.article_code)) as ArticleWarehouseOverview;
    const principal = overview.warehouses.find((w) => w.code === "PRINCIPAL");
    expect(principal?.isAssociated).toBe(false);
  });
});
