import { prisma } from "@/lib/db/prisma";
import type {
  ExchangeRateRow,
  IExchangeRateRepository,
  UpsertExchangeRateInput,
} from "@/lib/repositories/exchange-rates/IExchangeRateRepository";

const DEFAULT_HISTORY_LIMIT = 7;
type ExchangeRateEntity = Awaited<ReturnType<typeof prisma.exchange_rates.findMany>>[number];

export class ExchangeRateRepository implements IExchangeRateRepository {
  constructor(private readonly client = prisma) {}

  async listRates(limit = DEFAULT_HISTORY_LIMIT): Promise<ExchangeRateRow[]> {
    const normalizedLimit = this.normalizeLimit(limit);
    const rows = await this.client.exchange_rates.findMany({
      orderBy: { rate_date: "desc" },
      take: normalizedLimit,
    });
    return rows.map((row: ExchangeRateEntity) => this.mapRow(row));
  }

  async findRateByDate(rateDate: Date): Promise<ExchangeRateRow | null> {
    const normalizedDate = this.normalizeDate(rateDate);
    const row = await this.client.exchange_rates.findFirst({
      where: { rate_date: normalizedDate },
      orderBy: { created_at: "desc" },
    });
    return row ? this.mapRow(row) : null;
  }

  async upsertRate(input: UpsertExchangeRateInput): Promise<ExchangeRateRow> {
    const normalizedDate = this.normalizeDate(input.rateDate);
    const persistencePayload = this.buildPersistencePayload({ ...input, rateDate: normalizedDate });
    const row = await this.client.exchange_rates.upsert({
      where: {
        rate_date_base_currency_code_quote_currency_code: {
          rate_date: normalizedDate,
          base_currency_code: input.baseCurrencyCode,
          quote_currency_code: input.quoteCurrencyCode,
        },
      },
      create: persistencePayload,
      update: { ...persistencePayload, updated_at: new Date() },
    });
    return this.mapRow(row);
  }

  private normalizeLimit(limit: number | undefined): number {
    if (!limit || !Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_HISTORY_LIMIT;
    }
    return Math.floor(limit);
  }

  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
  }

  private buildPersistencePayload(input: UpsertExchangeRateInput & { rateDate: Date }) {
    return {
      rate_date: input.rateDate,
      rate_value: input.rateValue,
      base_currency_code: input.baseCurrencyCode,
      quote_currency_code: input.quoteCurrencyCode,
      source_name: input.sourceName ?? null,
    };
  }

  private mapRow(row: ExchangeRateEntity): ExchangeRateRow {
    return {
      id: row.id,
      rateDate: row.rate_date,
      rateValue: Number(row.rate_value),
      baseCurrencyCode: row.base_currency_code,
      quoteCurrencyCode: row.quote_currency_code,
      sourceName: row.source_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? null,
    };
  }
}
