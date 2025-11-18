import { PrismaClient, prisma } from "@/lib/db/prisma";
import type { IUnitRepository, UnitRow, UpsertUnitInput } from "@/lib/repositories/units/IUnitRepository";

export class UnitRepository implements IUnitRepository {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async listUnits(): Promise<UnitRow[]> {
    const rows = await this.prisma.units.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, is_active: true },
    });
    return rows.map((r) => ({ id: Number(r.id), code: r.code, name: r.name, is_active: !!r.is_active }));
  }

  async upsertUnit(input: UpsertUnitInput): Promise<{ id: number }> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const is_active = typeof input.is_active === "boolean" ? input.is_active : true;
    const result = await this.prisma.units.upsert({
      where: { code },
      update: { name, is_active },
      create: { code, name, is_active },
      select: { id: true },
    });
    return { id: Number(result.id) };
  }
}
