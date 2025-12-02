import { CashRegisterRepository } from "@/lib/repositories/cash-registers/CashRegisterRepository";
import type { PrismaClient } from "@prisma/client";

describe("CashRegisterRepository fallback", () => {
  it("omite el include de default_customer cuando la relación no existe", async () => {
    const baseRegisterRow = {
      id: BigInt(1),
      code: "CAJA1",
      name: "Caja 1",
      warehouse_id: 2,
      allow_manual_warehouse_override: false,
      is_active: true,
      notes: null,
      created_at: new Date("2024-01-01T00:00:00Z"),
      updated_at: new Date("2024-01-01T12:00:00Z"),
      warehouses: { id: 2, code: "ALM", name: "Principal" },
      invoice_sequence_definition_id: null,
      sequence_definitions: null,
      default_customer_id: null,
      default_customer: null,
    } as const;

    let transactionAttempts = 0;
    let capturedIncludeFromFind: unknown;
    let capturedIncludeFromUpdate: unknown;
    let capturedUpdateData: Record<string, unknown> | undefined;

    const fakeTx = {
      cash_registers: {
        findUnique: jest.fn(async (args: any) => {
          capturedIncludeFromFind = args.include;
          return { ...baseRegisterRow };
        }),
        update: jest.fn(async (args: any) => {
          capturedIncludeFromUpdate = args.include;
          capturedUpdateData = args.data;
          return {
            ...baseRegisterRow,
            name: (args.data?.name as string | undefined) ?? baseRegisterRow.name,
            updated_at: new Date("2024-01-02T08:00:00Z"),
          };
        }),
      },
      warehouses: {
        findFirst: jest.fn(),
      },
      sequence_definitions: {
        findUnique: jest.fn(),
      },
      customers: {
        findUnique: jest.fn(),
        findMany: jest.fn(async () => []),
      },
      $executeRaw: jest.fn(),
    };

    const fakePrisma = {
      $transaction: jest.fn(async (callback: (tx: typeof fakeTx) => Promise<unknown>) => {
        transactionAttempts += 1;
        if (transactionAttempts === 1) {
          throw new Error("missing relation: default_customer");
        }
        return callback(fakeTx);
      }),
    } as unknown as PrismaClient;

    const repository = new CashRegisterRepository(fakePrisma);

    const result = await repository.updateCashRegister("caja1", { name: "Caja actualizada" });

    expect(transactionAttempts).toBe(2);
    expect(fakeTx.cash_registers.findUnique).toHaveBeenCalledTimes(1);
    expect(fakeTx.cash_registers.update).toHaveBeenCalledTimes(1);
    expect(capturedIncludeFromFind && (capturedIncludeFromFind as Record<string, unknown>).default_customer).toBeUndefined();
    expect(capturedIncludeFromUpdate && (capturedIncludeFromUpdate as Record<string, unknown>).default_customer).toBeUndefined();
    expect(capturedUpdateData).toMatchObject({ name: "Caja actualizada" });
    expect(capturedUpdateData && Object.prototype.hasOwnProperty.call(capturedUpdateData, "default_customer")).toBe(false);
    expect(result.code).toBe("CAJA1");
    expect(result.name).toBe("Caja actualizada");
    expect(result.defaultCustomer).toBeNull();
  });

  it("hidrata el cliente predeterminado después del fallback", async () => {
    const baseRegisterRow = {
      id: BigInt(2),
      code: "CAJA2",
      name: "Caja secundaria",
      warehouse_id: 3,
      allow_manual_warehouse_override: true,
      is_active: true,
      notes: "",
      created_at: new Date("2024-01-01T00:00:00Z"),
      updated_at: new Date("2024-01-01T12:00:00Z"),
      warehouses: { id: 3, code: "ALM2", name: "Secundario" },
      invoice_sequence_definition_id: null,
      sequence_definitions: null,
      default_customer_id: BigInt(5),
      default_customer: null,
    } as const;

    let transactionAttempts = 0;
    let capturedUpdateData: Record<string, unknown> | undefined;

    const executedStatements: unknown[] = [];
    const fakeTx = {
      cash_registers: {
        findUnique: jest.fn(async () => ({ ...baseRegisterRow })),
        update: jest.fn(async (args: any) => {
          capturedUpdateData = args.data;
          return {
            ...baseRegisterRow,
            updated_at: new Date("2024-01-03T09:00:00Z"),
          };
        }),
      },
      warehouses: {
        findFirst: jest.fn(),
      },
      sequence_definitions: {
        findUnique: jest.fn(),
      },
      customers: {
        findUnique: jest.fn(async () => ({ id: BigInt(5) })),
        findMany: jest.fn(async () => [
          {
            id: BigInt(5),
            code: "CLI-001",
            name: "Cliente Mostrador",
            payment_terms: { code: "CONTADO" },
          },
        ]),
      },
      $executeRaw: jest.fn(async (statement: unknown) => {
        executedStatements.push(statement);
        return 1;
      }),
    };

    const fakePrisma = {
      $transaction: jest.fn(async (callback: (tx: typeof fakeTx) => Promise<unknown>) => {
        transactionAttempts += 1;
        if (transactionAttempts === 1) {
          throw new Error("missing relation default_customer");
        }
        return callback(fakeTx);
      }),
    } as unknown as PrismaClient;

    const repository = new CashRegisterRepository(fakePrisma);

    const result = await repository.updateCashRegister("caja2", { defaultCustomerCode: "cli-001" });

    expect(transactionAttempts).toBe(2);
    expect(fakeTx.customers.findUnique).toHaveBeenCalledTimes(1);
    expect(fakeTx.customers.findMany).toHaveBeenCalledWith({
      where: { id: { in: [5] } },
      select: expect.any(Object),
    });
    expect(Object.prototype.hasOwnProperty.call(capturedUpdateData ?? {}, "default_customer")).toBe(false);
    expect(fakeTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(executedStatements[0]).toBeDefined();
    const executedSql =
      executedStatements[0] && typeof executedStatements[0] === "object" && "strings" in (executedStatements[0] as any)
        ? ((executedStatements[0] as any).strings as string[]).join("")
        : String(executedStatements[0]);
    expect(executedSql).toContain('"app"."cash_registers"');
    expect(result.defaultCustomer).toEqual({
      id: 5,
      code: "CLI-001",
      name: "Cliente Mostrador",
      paymentTermCode: "CONTADO",
    });
  });
});
