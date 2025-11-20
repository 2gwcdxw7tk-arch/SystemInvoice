import { GET as DefinitionsGET, POST as DefinitionsPOST, PATCH as DefinitionsPATCH } from "@/app/api/preferencias/consecutivos/route";
import { GET as InventoryGET, POST as InventoryPOST } from "@/app/api/preferencias/consecutivos/inventario/route";
import { GET as CashGET, POST as CashPOST } from "@/app/api/preferencias/consecutivos/cajas/route";

const mockSequenceService = {
  listDefinitions: jest.fn(async () => []),
  createDefinition: jest.fn(async (payload: any) => ({ id: 1, ...payload })),
  updateDefinition: jest.fn(async (_code: string, payload: any) => ({ id: 1, code: _code, ...payload })),
  listInventoryAssignments: jest.fn(async () => []),
  setInventorySequence: jest.fn(async () => undefined),
  listCashRegisterAssignments: jest.fn(async () => []),
  setCashRegisterSequence: jest.fn(async () => ({ id: 1, code: "POS-1" })),
};

jest.mock("@/lib/auth/access", () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock("@/lib/services/SequenceService", () => ({
  sequenceService: mockSequenceService,
}));

describe("API Preferencias Consecutivos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /api/preferencias/consecutivos", async () => {
    const res = await DefinitionsGET({ nextUrl: new URL("http://localhost/api/preferencias/consecutivos") } as any);
    expect(res.status).toBe(200);
    expect(mockSequenceService.listDefinitions).toHaveBeenCalled();
  });

  it("POST /api/preferencias/consecutivos crea definicion", async () => {
    const req = new Request("http://localhost/api/preferencias/consecutivos", {
      method: "POST",
      body: JSON.stringify({
        code: "FAC",
        name: "Factura",
        scope: "INVOICE",
        prefix: "FAC-",
        padding: 6,
        startValue: 1,
        step: 1,
        isActive: true,
      }),
      headers: { "Content-Type": "application/json" },
    });
    // @ts-expect-error Next handler compat
    const res = await DefinitionsPOST(req);
    expect(res.status).toBe(201);
    expect(mockSequenceService.createDefinition).toHaveBeenCalledWith(expect.objectContaining({ code: "FAC" }));
  });

  it("PATCH /api/preferencias/consecutivos actualiza definicion", async () => {
    const req = new Request("http://localhost/api/preferencias/consecutivos", {
      method: "PATCH",
      body: JSON.stringify({ code: "FAC", name: "Factura POS" }),
      headers: { "Content-Type": "application/json" },
    });
    // @ts-expect-error Next handler compat
    const res = await DefinitionsPATCH(req);
    expect(res.status).toBe(200);
    expect(mockSequenceService.updateDefinition).toHaveBeenCalledWith("FAC", expect.objectContaining({ name: "Factura POS" }));
  });

  it("GET /api/preferencias/consecutivos/inventario", async () => {
    const res = await InventoryGET({ nextUrl: new URL("http://localhost/api/preferencias/consecutivos/inventario") } as any);
    expect(res.status).toBe(200);
    expect(mockSequenceService.listInventoryAssignments).toHaveBeenCalled();
  });

  it("POST /api/preferencias/consecutivos/inventario actualiza asignacion", async () => {
    const req = new Request("http://localhost/api/preferencias/consecutivos/inventario", {
      method: "POST",
      body: JSON.stringify({ transactionType: "PURCHASE", sequenceCode: "COMP" }),
      headers: { "Content-Type": "application/json" },
    });
    // @ts-expect-error Next handler compat
    const res = await InventoryPOST(req);
    expect(res.status).toBe(200);
    expect(mockSequenceService.setInventorySequence).toHaveBeenCalledWith({ transactionType: "PURCHASE", sequenceCode: "COMP" });
  });

  it("GET /api/preferencias/consecutivos/cajas", async () => {
    const res = await CashGET({ nextUrl: new URL("http://localhost/api/preferencias/consecutivos/cajas") } as any);
    expect(res.status).toBe(200);
    expect(mockSequenceService.listCashRegisterAssignments).toHaveBeenCalled();
  });

  it("POST /api/preferencias/consecutivos/cajas actualiza caja", async () => {
    const req = new Request("http://localhost/api/preferencias/consecutivos/cajas", {
      method: "POST",
      body: JSON.stringify({ cashRegisterCode: "POS-1", sequenceCode: "FAC" }),
      headers: { "Content-Type": "application/json" },
    });
    // @ts-expect-error Next handler compat
    const res = await CashPOST(req);
    expect(res.status).toBe(200);
    expect(mockSequenceService.setCashRegisterSequence).toHaveBeenCalledWith({ cashRegisterCode: "POS-1", sequenceCode: "FAC" });
  });
});
