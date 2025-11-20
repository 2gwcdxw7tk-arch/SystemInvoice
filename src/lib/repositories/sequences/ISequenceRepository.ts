export type SequenceScope = "INVOICE" | "INVENTORY";
export type SequenceCounterScope = "GLOBAL" | "CASH_REGISTER" | "INVENTORY_TYPE";

export type SequenceDefinitionRecord = {
  id: number;
  code: string;
  name: string;
  scope: SequenceScope;
  prefix: string;
  suffix: string;
  padding: number;
  startValue: number;
  step: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type SequenceDefinitionCreateInput = {
  code: string;
  name: string;
  scope: SequenceScope;
  prefix: string;
  suffix?: string;
  padding: number;
  startValue: number;
  step?: number;
  isActive?: boolean;
};

export type SequenceDefinitionUpdateInput = {
  name?: string;
  prefix?: string;
  suffix?: string | null;
  padding?: number;
  startValue?: number;
  step?: number;
  isActive?: boolean;
};

export type InventorySequenceAssignmentRecord = {
  transactionType: string;
  sequenceDefinitionId: number | null;
  sequenceCode: string | null;
  sequenceName: string | null;
};

export interface ISequenceRepository {
  listDefinitions(params?: { scope?: SequenceScope }): Promise<SequenceDefinitionRecord[]>;
  getDefinitionByCode(code: string): Promise<SequenceDefinitionRecord | null>;
  getDefinitionById(id: number): Promise<SequenceDefinitionRecord | null>;
  createDefinition(input: SequenceDefinitionCreateInput): Promise<SequenceDefinitionRecord>;
  updateDefinition(code: string, input: SequenceDefinitionUpdateInput): Promise<SequenceDefinitionRecord>;
  getCounterValue(definitionId: number, scopeType: SequenceCounterScope, scopeKey: string): Promise<bigint | null>;
  incrementCounter(
    definition: SequenceDefinitionRecord,
    scopeType: SequenceCounterScope,
    scopeKey: string
  ): Promise<bigint>;
  listInventoryAssignments(): Promise<InventorySequenceAssignmentRecord[]>;
  setInventoryAssignment(transactionType: string, definitionId: number | null): Promise<void>;
}
