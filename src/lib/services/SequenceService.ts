import type {
  InventorySequenceAssignmentRecord,
  ISequenceRepository,
  SequenceCounterScope,
  SequenceDefinitionCreateInput,
  SequenceDefinitionRecord,
  SequenceDefinitionUpdateInput,
  SequenceScope,
} from "@/lib/repositories/sequences/ISequenceRepository";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import type { CashRegisterRecord } from "@/lib/services/cash-registers/types";
import { SequenceRepository } from "@/lib/repositories/sequences/SequenceRepository";

const INVENTORY_TYPES = [
  { code: "PURCHASE", label: "Compras" },
  { code: "CONSUMPTION", label: "Consumo" },
  { code: "ADJUSTMENT", label: "Ajustes" },
  { code: "TRANSFER", label: "Traspasos" },
] as const;

export type InventorySequenceType = (typeof INVENTORY_TYPES)[number]["code"];

export type SequenceDefinitionView = SequenceDefinitionRecord & {
  nextPreview: string | null;
};

export type CashRegisterSequenceView = {
  id: number;
  code: string;
  name: string;
  warehouseCode: string;
  warehouseName: string;
  isActive: boolean;
  sequenceCode: string | null;
  sequenceName: string | null;
  nextPreview: string | null;
};

export type InventorySequenceView = {
  transactionType: InventorySequenceType;
  label: string;
  sequenceCode: string | null;
  sequenceName: string | null;
  nextPreview: string | null;
};

function formatSequence(definition: SequenceDefinitionRecord, value: bigint): string {
  const digits = value.toString();
  const padding = Math.max(0, Math.trunc(definition.padding));
  const padded = padding > 0 ? digits.padStart(padding, "0") : digits;
  const prefix = definition.prefix ?? "";
  const suffix = definition.suffix ?? "";
  return `${prefix}${padded}${suffix}`;
}

function nextCandidate(definition: SequenceDefinitionRecord, currentValue: bigint | null): bigint {
  if (currentValue === null) {
    return BigInt(Math.max(0, definition.startValue));
  }
  return currentValue + BigInt(Math.max(1, definition.step));
}

export class SequenceService {
  constructor(private readonly repository: ISequenceRepository = new SequenceRepository()) {}

  async listDefinitions(scope?: SequenceScope): Promise<SequenceDefinitionView[]> {
    const definitions = await this.repository.listDefinitions(scope ? { scope } : {});
    const views = await Promise.all(
      definitions.map(async (definition) => {
        const currentValue = await this.repository.getCounterValue(definition.id, "GLOBAL", "");
        const candidate = nextCandidate(definition, currentValue);
        const formatted = formatSequence(definition, candidate);
        return {
          ...definition,
          nextPreview: formatted,
        } satisfies SequenceDefinitionView;
      })
    );
    return views;
  }

  async createDefinition(input: SequenceDefinitionCreateInput): Promise<SequenceDefinitionRecord> {
    return this.repository.createDefinition(input);
  }

  async updateDefinition(code: string, input: SequenceDefinitionUpdateInput): Promise<SequenceDefinitionRecord> {
    return this.repository.updateDefinition(code, input);
  }

  async listCashRegisterAssignments(): Promise<CashRegisterSequenceView[]> {
    const registers = await cashRegisterService.listCashRegisters({ includeInactive: true });
    const result: CashRegisterSequenceView[] = [];
    for (const register of registers) {
      const preview = register.invoiceSequenceDefinitionId
        ? await this.previewNextForCashRegister(register)
        : null;
      result.push({
        id: register.id,
        code: register.code,
        name: register.name,
        warehouseCode: register.warehouseCode,
        warehouseName: register.warehouseName,
        isActive: register.isActive,
        sequenceCode: register.invoiceSequenceCode,
        sequenceName: register.invoiceSequenceName,
        nextPreview: preview,
      });
    }
    return result;
  }

  async setCashRegisterSequence(params: { cashRegisterCode: string; sequenceCode: string | null }): Promise<CashRegisterRecord> {
    let definitionId: number | null = null;
    let definition: SequenceDefinitionRecord | null = null;
    if (params.sequenceCode) {
      definition = await this.repository.getDefinitionByCode(params.sequenceCode);
      if (!definition) {
        throw new Error("La secuencia indicada no existe");
      }
      if (definition.scope !== "INVOICE") {
        throw new Error("La secuencia seleccionada no pertenece a facturación");
      }
      definitionId = definition.id;
    }
    const register = await cashRegisterService.setInvoiceSequenceForRegister({
      cashRegisterCode: params.cashRegisterCode,
      sequenceDefinitionId: definitionId,
    });

    if (!definitionId) {
      return {
        ...register,
        invoiceSequenceDefinitionId: null,
        invoiceSequenceCode: null,
        invoiceSequenceName: null,
      } satisfies CashRegisterRecord;
    }

    return {
      ...register,
      invoiceSequenceDefinitionId: definitionId,
      invoiceSequenceCode: definition?.code ?? register.invoiceSequenceCode,
      invoiceSequenceName: definition?.name ?? register.invoiceSequenceName,
    } satisfies CashRegisterRecord;
  }

  async generateInvoiceNumber(params: {
    cashRegisterId: number;
    cashRegisterCode: string;
    sessionId: number;
  }): Promise<string> {
    const register = await cashRegisterService.getCashRegisterById(params.cashRegisterId);
    if (!register) {
      throw new Error("Caja no encontrada");
    }
    if (!register.invoiceSequenceDefinitionId) {
      throw new Error("Configura un consecutivo para la caja antes de facturar");
    }
    const definition = await this.repository.getDefinitionById(register.invoiceSequenceDefinitionId);
    if (!definition || definition.scope !== "INVOICE") {
      throw new Error("La secuencia asignada a la caja no es válida para facturación");
    }

    const scopeType: SequenceCounterScope = "CASH_REGISTER";
    const scopeKey = String(register.id);

    const nextValue = await this.repository.incrementCounter(definition, scopeType, scopeKey);
    const display = formatSequence(definition, nextValue);

    await cashRegisterService.recordInvoiceSequenceUsage(params.sessionId, display);

    return display;
  }

  async previewNextForCashRegister(register: CashRegisterRecord): Promise<string | null> {
    if (!register.invoiceSequenceDefinitionId) {
      return null;
    }
    const definition = await this.repository.getDefinitionById(register.invoiceSequenceDefinitionId);
    if (!definition) {
      return null;
    }
    const currentValue = await this.repository.getCounterValue(definition.id, "CASH_REGISTER", String(register.id));
    return formatSequence(definition, nextCandidate(definition, currentValue));
  }

  async listInventoryAssignments(): Promise<InventorySequenceView[]> {
    const assignments = await this.repository.listInventoryAssignments();
    const map = new Map<string, InventorySequenceAssignmentRecord>();
    for (const assignment of assignments) {
      map.set(assignment.transactionType, assignment);
    }

    const results: InventorySequenceView[] = [];
    for (const descriptor of INVENTORY_TYPES) {
      const assignment = map.get(descriptor.code) ?? null;
      let preview: string | null = null;
      if (assignment?.sequenceDefinitionId) {
        const definition = await this.repository.getDefinitionById(assignment.sequenceDefinitionId);
        if (definition) {
          const currentValue = await this.repository.getCounterValue(definition.id, "INVENTORY_TYPE", descriptor.code);
          preview = formatSequence(definition, nextCandidate(definition, currentValue));
        }
      }
      results.push({
        transactionType: descriptor.code,
        label: descriptor.label,
        sequenceCode: assignment?.sequenceCode ?? null,
        sequenceName: assignment?.sequenceName ?? null,
        nextPreview: preview,
      });
    }
    return results;
  }

  async setInventorySequence(params: { transactionType: InventorySequenceType; sequenceCode: string | null }): Promise<void> {
    const descriptor = INVENTORY_TYPES.find((item) => item.code === params.transactionType);
    if (!descriptor) {
      throw new Error("Tipo de movimiento de inventario no soportado");
    }
    let definitionId: number | null = null;
    if (params.sequenceCode) {
      const definition = await this.repository.getDefinitionByCode(params.sequenceCode);
      if (!definition) {
        throw new Error("La secuencia indicada no existe");
      }
      if (definition.scope !== "INVENTORY") {
        throw new Error("La secuencia seleccionada no es válida para inventario");
      }
      definitionId = definition.id;
    }
    await this.repository.setInventoryAssignment(descriptor.code, definitionId);
  }

  async generateInventoryCode(transactionType: InventorySequenceType): Promise<string> {
    const descriptor = INVENTORY_TYPES.find((item) => item.code === transactionType);
    if (!descriptor) {
      throw new Error("Tipo de movimiento de inventario no soportado");
    }
    const assignment = await this.repository.listInventoryAssignments();
    const match = assignment.find((item) => item.transactionType === descriptor.code);
    if (!match || !match.sequenceDefinitionId) {
      throw new Error("Configura un consecutivo para este tipo de movimiento de inventario");
    }
    const definition = await this.repository.getDefinitionById(match.sequenceDefinitionId);
    if (!definition || definition.scope !== "INVENTORY") {
      throw new Error("La secuencia asignada no es válida para inventario");
    }
    const nextValue = await this.repository.incrementCounter(definition, "INVENTORY_TYPE", descriptor.code);
    return formatSequence(definition, nextValue);
  }
}

export const sequenceService = new SequenceService();
