import { CashRegisterService } from "@/lib/services/CashRegisterService";
import type { ICashRegisterRepository } from "@/lib/repositories/cash-registers/ICashRegisterRepository";
import type { CashRegisterRecord } from "@/lib/services/cash-registers/types";
import { env } from "@/lib/env";

describe("CashRegisterService · retail mode", () => {
  const originalRetailMode = env.features.retailModeEnabled;
  const originalUseMockData = env.useMockData;

  const buildRepoStub = () => {
    const baseRecord: CashRegisterRecord = {
      id: 1,
      code: "CAJA-01",
      name: "Caja principal",
      warehouseId: 1,
      warehouseCode: "PRINCIPAL",
      warehouseName: "Principal",
      allowManualWarehouseOverride: false,
      isActive: true,
      notes: null,
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      invoiceSequenceDefinitionId: null,
      invoiceSequenceCode: null,
      invoiceSequenceName: null,
      defaultCustomer: null,
    };

    const unexpectedCall = (method: string) => () => {
      throw new Error(`Unexpected repository call: ${method}`);
    };

    const repo: Partial<ICashRegisterRepository> = {
      listCashRegisters: jest.fn().mockResolvedValue([baseRecord]),
      createCashRegister: jest.fn().mockResolvedValue(baseRecord),
      updateCashRegister: jest.fn().mockResolvedValue(baseRecord),
      getCashRegisterById: jest.fn().mockResolvedValue(baseRecord),
      getCashRegisterByCode: jest.fn().mockResolvedValue(baseRecord),
      countActiveCashRegisters: jest.fn().mockResolvedValue(0),
      countOpenCashRegisterSessions: jest.fn().mockResolvedValue(0),
      listCashRegistersForAdmin: jest.fn().mockResolvedValue([]),
      listCashRegisterAssignments: jest.fn().mockResolvedValue([]),
      assignCashRegisterToAdmin: jest.fn(unexpectedCall("assignCashRegisterToAdmin")),
      unassignCashRegisterFromAdmin: jest.fn(unexpectedCall("unassignCashRegisterFromAdmin")),
      setDefaultCashRegisterForAdmin: jest.fn(unexpectedCall("setDefaultCashRegisterForAdmin")),
      getActiveCashRegisterSessionByAdmin: jest.fn(unexpectedCall("getActiveCashRegisterSessionByAdmin")),
      listCashRegisterSessionsForAdmin: jest.fn(unexpectedCall("listCashRegisterSessionsForAdmin")),
      getCashRegisterSessionById: jest.fn(unexpectedCall("getCashRegisterSessionById")),
      openCashRegisterSession: jest.fn(unexpectedCall("openCashRegisterSession")),
      closeCashRegisterSession: jest.fn(unexpectedCall("closeCashRegisterSession")),
      listActiveCashRegisterSessions: jest.fn(unexpectedCall("listActiveCashRegisterSessions")),
      getCashRegisterClosureReport: jest.fn(unexpectedCall("getCashRegisterClosureReport")),
      updateSessionInvoiceSequenceRange: jest.fn(unexpectedCall("updateSessionInvoiceSequenceRange")),
    };

    return { repo: repo as ICashRegisterRepository, spies: repo };
  };

  beforeEach(() => {
    (env.features as unknown as { retailModeEnabled: boolean }).retailModeEnabled = originalRetailMode;
    (env as unknown as { useMockData: boolean }).useMockData = originalUseMockData;
  });

  afterAll(() => {
    (env.features as unknown as { retailModeEnabled: boolean }).retailModeEnabled = originalRetailMode;
    (env as unknown as { useMockData: boolean }).useMockData = originalUseMockData;
  });

  it("omite la asignación de cliente cuando el modo retail está deshabilitado", async () => {
    (env.features as unknown as { retailModeEnabled: boolean }).retailModeEnabled = false;
    (env as unknown as { useMockData: boolean }).useMockData = false;

    const { repo, spies } = buildRepoStub();
    const service = new CashRegisterService(repo);

    await service.createCashRegister({
      code: "CAJA-01",
      name: "Caja principal",
      warehouseCode: "PRINCIPAL",
      allowManualWarehouseOverride: false,
      defaultCustomerCode: "CLI-001",
    });

    expect(spies.createCashRegister).toHaveBeenCalledTimes(1);
    expect(spies.createCashRegister).toHaveBeenCalledWith(
      expect.objectContaining({ defaultCustomerCode: undefined })
    );
  });

  it("propaga el cliente predeterminado cuando el modo retail está habilitado", async () => {
    (env.features as unknown as { retailModeEnabled: boolean }).retailModeEnabled = true;
    (env as unknown as { useMockData: boolean }).useMockData = false;

    const { repo, spies } = buildRepoStub();
    const service = new CashRegisterService(repo);

    await service.updateCashRegister("CAJA-01", {
      name: "Caja renovada",
      defaultCustomerCode: "CLI-999",
    });

    expect(spies.updateCashRegister).toHaveBeenCalledTimes(1);
    expect(spies.updateCashRegister).toHaveBeenCalledWith(
      "CAJA-01",
      expect.objectContaining({ defaultCustomerCode: "CLI-999" })
    );
  });
});
