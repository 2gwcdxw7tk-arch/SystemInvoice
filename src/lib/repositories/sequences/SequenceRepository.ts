import type { Prisma } from "@prisma/client";
import { prisma, PrismaClient } from "@/lib/db/prisma";
import type {
  ISequenceRepository,
  InventorySequenceAssignmentRecord,
  SequenceCounterScope,
  SequenceDefinitionCreateInput,
  SequenceDefinitionRecord,
  SequenceDefinitionUpdateInput,
  SequenceScope,
} from "@/lib/repositories/sequences/ISequenceRepository";

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeScope(scope: SequenceScope | string): SequenceScope {
  const normalized = scope.toString().trim().toUpperCase();
  if (normalized === "INVENTORY") {
    return "INVENTORY";
  }
  return "INVOICE";
}

function ensureSafeNumber(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max || value < BigInt(0)) {
    throw new Error("El valor del consecutivo excede el rango seguro soportado");
  }
  return Number(value);
}

function mapDefinition(row: {
  id: number;
  code: string;
  name: string;
  scope: string;
  prefix: string;
  suffix: string;
  padding: number;
  start_value: bigint;
  step: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date | null;
}): SequenceDefinitionRecord {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    scope: normalizeScope(row.scope),
    prefix: row.prefix ?? "",
    suffix: row.suffix ?? "",
    padding: Number(row.padding),
    startValue: ensureSafeNumber(row.start_value),
    step: Number(row.step ?? 1) || 1,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  } satisfies SequenceDefinitionRecord;
}

function sequenceCounterKey(definitionId: number, scopeType: SequenceCounterScope, scopeKey: string) {
  return {
    sequence_definition_id_scope_type_scope_key: {
      sequence_definition_id: definitionId,
      scope_type: scopeType,
      scope_key: scopeKey,
    },
  } satisfies Prisma.sequence_countersWhereUniqueInput;
}

export class SequenceRepository implements ISequenceRepository {
  constructor(private readonly prismaClient: PrismaClient = prisma) {}

  async listDefinitions(params: { scope?: SequenceScope } = {}): Promise<SequenceDefinitionRecord[]> {
    const { scope } = params;
    const definitions = await this.prismaClient.sequence_definitions.findMany({
      where: scope ? { scope: normalizeScope(scope) } : undefined,
      orderBy: [{ scope: "asc" }, { code: "asc" }],
    });
    return definitions.map((row) => mapDefinition({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      scope: row.scope,
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      start_value: row.start_value,
      step: row.step,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async getDefinitionByCode(code: string): Promise<SequenceDefinitionRecord | null> {
    const normalizedCode = normalizeCode(code);
    const row = await this.prismaClient.sequence_definitions.findUnique({ where: { code: normalizedCode } });
    if (!row) return null;
    return mapDefinition({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      scope: row.scope,
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      start_value: row.start_value,
      step: row.step,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  async getDefinitionById(id: number): Promise<SequenceDefinitionRecord | null> {
    const row = await this.prismaClient.sequence_definitions.findUnique({ where: { id: Number(id) } });
    if (!row) return null;
    return mapDefinition({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      scope: row.scope,
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      start_value: row.start_value,
      step: row.step,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  async createDefinition(input: SequenceDefinitionCreateInput): Promise<SequenceDefinitionRecord> {
    const scope = normalizeScope(input.scope);
    const row = await this.prismaClient.sequence_definitions.create({
      data: {
        code: normalizeCode(input.code),
        name: input.name.trim(),
        scope,
        prefix: input.prefix.trim(),
        suffix: input.suffix?.trim() ?? "",
        padding: Math.max(1, Math.min(18, Math.trunc(input.padding))),
        start_value: BigInt(Math.max(0, Math.trunc(input.startValue))),
        step: Math.max(1, Math.trunc(input.step ?? 1)),
        is_active: input.isActive ?? true,
      },
    });
    return mapDefinition({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      scope: row.scope,
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      start_value: row.start_value,
      step: row.step,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  async updateDefinition(code: string, input: SequenceDefinitionUpdateInput): Promise<SequenceDefinitionRecord> {
    const normalizedCode = normalizeCode(code);
    const data: Prisma.sequence_definitionsUpdateInput = {};

    if (typeof input.name === "string") {
      data.name = input.name.trim();
    }
    if (typeof input.prefix === "string") {
      data.prefix = input.prefix.trim();
    }
    if (typeof input.suffix !== "undefined") {
      data.suffix = input.suffix ? input.suffix.trim() : "";
    }
    if (typeof input.padding === "number" && Number.isFinite(input.padding)) {
      data.padding = Math.max(1, Math.min(18, Math.trunc(input.padding)));
    }
    if (typeof input.startValue === "number" && Number.isFinite(input.startValue)) {
      data.start_value = BigInt(Math.max(0, Math.trunc(input.startValue)));
    }
    if (typeof input.step === "number" && Number.isFinite(input.step)) {
      data.step = Math.max(1, Math.trunc(input.step));
    }
    if (typeof input.isActive === "boolean") {
      data.is_active = input.isActive;
    }

    const row = await this.prismaClient.sequence_definitions.update({
      where: { code: normalizedCode },
      data,
    });

    return mapDefinition({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      scope: row.scope,
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      start_value: row.start_value,
      step: row.step,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  async getCounterValue(
    definitionId: number,
    scopeType: SequenceCounterScope,
    scopeKey: string
  ): Promise<bigint | null> {
    const counter = await this.prismaClient.sequence_counters.findUnique({
      where: sequenceCounterKey(Number(definitionId), scopeType, scopeKey),
      select: { current_value: true },
    });
    return counter ? counter.current_value : null;
  }

  async incrementCounter(
    definition: SequenceDefinitionRecord,
    scopeType: SequenceCounterScope,
    scopeKey: string
  ): Promise<bigint> {
    const now = new Date();
    const result = await this.prismaClient.sequence_counters.upsert({
      where: sequenceCounterKey(definition.id, scopeType, scopeKey),
      update: {
        current_value: { increment: BigInt(definition.step) },
        updated_at: now,
      },
      create: {
        sequence_definition_id: definition.id,
        scope_type: scopeType,
        scope_key: scopeKey,
        current_value: BigInt(Math.max(0, definition.startValue)),
        updated_at: now,
      },
    });
    return result.current_value;
  }

  async listInventoryAssignments(): Promise<InventorySequenceAssignmentRecord[]> {
    const rows = await this.prismaClient.inventory_sequence_settings.findMany({
      include: {
        sequence_definitions: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: { transaction_type: "asc" },
    });

    return rows.map((row) => ({
      transactionType: row.transaction_type,
      sequenceDefinitionId: row.sequence_definition_id ? Number(row.sequence_definition_id) : null,
      sequenceCode: row.sequence_definitions ? row.sequence_definitions.code : null,
      sequenceName: row.sequence_definitions ? row.sequence_definitions.name : null,
    }));
  }

  async setInventoryAssignment(transactionType: string, definitionId: number | null): Promise<void> {
    const normalizedType = transactionType.trim().toUpperCase();

    if (definitionId == null) {
      await this.prismaClient.inventory_sequence_settings.deleteMany({ where: { transaction_type: normalizedType } });
      return;
    }

    await this.prismaClient.inventory_sequence_settings.upsert({
      where: { transaction_type: normalizedType },
      update: {
        sequence_definition_id: definitionId,
        updated_at: new Date(),
      },
      create: {
        transaction_type: normalizedType,
        sequence_definition_id: definitionId,
      },
    });
  }
}

export const sequenceRepository = new SequenceRepository();
