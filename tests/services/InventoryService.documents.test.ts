import { InventoryService } from "@/lib/services/InventoryService";
import type {
  InventoryTransactionDocumentRecord,
  InventoryTransactionHeaderRow,
} from "@/lib/repositories/IInventoryTransactionRepository";

const mockInventoryRepository = {
  findTransactionDocumentByCode: jest.fn(),
  listTransactionHeaders: jest.fn(),
};

const service = new InventoryService(
  {} as any,
  {} as any,
  {} as any,
  mockInventoryRepository as any,
  {} as any,
);

describe("InventoryService documents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normaliza y devuelve un documento de inventario", async () => {
    const record: InventoryTransactionDocumentRecord = {
      id: 1,
      transaction_code: "CP-0001",
      transaction_type: "PURCHASE",
      occurred_at: new Date("2025-01-02T12:00:00Z"),
      created_at: new Date("2025-01-02T12:05:00Z"),
      reference: "OC-99",
      counterparty_name: "Proveedor Demo",
      status: "PENDIENTE",
      notes: "Entrega incompleta",
      authorized_by: "Coordinador",
      created_by: "admin",
      total_amount: 150,
      warehouse: { id: 10, code: "WH-01", name: "Principal" },
      entries: [
        {
          id: 20,
          direction: "IN",
          entered_unit: "STORAGE",
          quantity_entered: 5,
          unit_conversion_factor: 2,
          kit_multiplier: null,
          cost_per_unit: 30,
          subtotal: 150,
          notes: "Caja completa",
          article: {
            id: 200,
            article_code: "ART-01",
            name: "Artículo 01",
            retail_unit: "pz",
            storage_unit: "caja",
            conversion_factor: 2,
          },
          movements: [
            {
              id: 30,
              direction: "IN",
              quantity_retail: 10,
              warehouse: { id: 10, code: "WH-01", name: "Principal" },
              article: {
                id: 200,
                article_code: "ART-01",
                name: "Artículo 01",
                retail_unit: "pz",
                storage_unit: "caja",
              },
              source_kit_article_code: null,
            },
          ],
        },
      ],
    };

    mockInventoryRepository.findTransactionDocumentByCode.mockResolvedValue(record);

    const document = await service.getTransactionDocument("  cp-0001  ");

    expect(mockInventoryRepository.findTransactionDocumentByCode).toHaveBeenCalledWith("cp-0001");
    expect(document).not.toBeNull();
    expect(document?.transaction_code).toBe("CP-0001");
    expect(document?.entries[0].quantity_retail).toBe(10);
    expect(document?.entries[0].line_number).toBe(1);
  });

  it("retorna encabezados normalizados con filtros", async () => {
    const rows: InventoryTransactionHeaderRow[] = [
      {
        id: 1,
        transaction_code: "CP-0001",
        transaction_type: "PURCHASE",
        occurred_at: new Date("2025-01-03T12:00:00Z"),
        reference: "OC-100",
        counterparty_name: "Proveedor Demo",
        status: "PENDIENTE",
        notes: null,
        total_amount: 120,
        warehouse: { id: 10, code: "WH-01", name: "Principal" },
        entries_count: 2,
        entries_in: 2,
        entries_out: 0,
      },
    ];

    mockInventoryRepository.listTransactionHeaders.mockResolvedValue(rows);

    const result = await service.listTransactionHeaders({
      transaction_types: ["purchase" as any],
      warehouse_codes: ["wh-01"],
      limit: 5,
      search: "cp",
      from: "2025-01-01",
      to: "2025-01-31",
    });

    expect(mockInventoryRepository.listTransactionHeaders).toHaveBeenCalledTimes(1);
    const args = mockInventoryRepository.listTransactionHeaders.mock.calls[0][0];
    expect(args.transactionTypes).toEqual(["PURCHASE"]);
    expect(args.warehouseCodes).toEqual(["WH-01"]);
    expect(args.limit).toBe(5);
    expect(result[0].transaction_code).toBe("CP-0001");
    expect(result[0].entries_count).toBe(2);
  });
});
