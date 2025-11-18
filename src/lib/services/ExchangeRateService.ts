import { env } from "@/lib/env";
import type {
  ExchangeRateRow,
  IExchangeRateRepository,
  UpsertExchangeRateInput,
} from "@/lib/repositories/exchange-rates/IExchangeRateRepository";
import { ExchangeRateRepository } from "@/lib/repositories/exchange-rates/ExchangeRateRepository";

const DEFAULT_HISTORY_LIMIT = 7;
const MOCK_HISTORY_DAYS = 14;

type MockExchangeRateRecord = ExchangeRateRow;

function createMockExchangeRates(): MockExchangeRateRecord[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const baseCurrencyCode = env.currency.local.code;
  const quoteCurrencyCode = env.currency.foreign.code;

  return Array.from({ length: MOCK_HISTORY_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - index);
    const oscillation = Math.sin(index / 2.5) * 0.12;
    const baseline = 17.35 + oscillation;
    const rateValue = Number(baseline.toFixed(4));

    return {
      id: index + 1,
      rateDate: date,
      rateValue,
      baseCurrencyCode,
      quoteCurrencyCode,
      sourceName: "Mock data",
      createdAt: date,
      updatedAt: date,
    } satisfies MockExchangeRateRecord;
  });
}

const mockExchangeRates: MockExchangeRateRecord[] | null = env.useMockData ? createMockExchangeRates() : null;

export class ExchangeRateService {
  constructor(private readonly repository: IExchangeRateRepository = new ExchangeRateRepository()) {}

  async getExchangeRateHistory(limit = DEFAULT_HISTORY_LIMIT): Promise<ExchangeRateRow[]> {
    const normalizedLimit = this.normalizeLimit(limit);

    if (env.useMockData && mockExchangeRates) {
      return mockExchangeRates.slice(0, normalizedLimit).map((entry) => ({ ...entry }));
    }

    return this.repository.listRates(normalizedLimit);
  }

  async getCurrentExchangeRate(): Promise<ExchangeRateRow | null> {
    const history = await this.getExchangeRateHistory(1);
    return history[0] ?? null;
  }

  async getExchangeRateForDate(rateDate: Date): Promise<ExchangeRateRow | null> {
    const normalizedDate = this.normalizeDate(rateDate);

    if (env.useMockData && mockExchangeRates) {
      return (
        mockExchangeRates.find((entry) => entry.rateDate.getTime() === normalizedDate.getTime()) ?? null
      );
    }

    return this.repository.findRateByDate(normalizedDate);
  }

  async upsertExchangeRate(input: UpsertExchangeRateInput): Promise<ExchangeRateRow> {
    const normalizedDate = this.normalizeDate(input.rateDate);

    if (env.useMockData && mockExchangeRates) {
      const existingIndex = mockExchangeRates.findIndex(
        (entry) => entry.rateDate.getTime() === normalizedDate.getTime()
      );

      if (existingIndex >= 0) {
        mockExchangeRates[existingIndex] = {
          ...mockExchangeRates[existingIndex],
          rateValue: input.rateValue,
          sourceName: input.sourceName ?? mockExchangeRates[existingIndex].sourceName,
          updatedAt: new Date(),
        };
        return { ...mockExchangeRates[existingIndex] };
      }

      const newRecord: MockExchangeRateRecord = {
        id: mockExchangeRates[mockExchangeRates.length - 1]?.id + 1 || 1,
        rateDate: normalizedDate,
        rateValue: input.rateValue,
        baseCurrencyCode: input.baseCurrencyCode,
        quoteCurrencyCode: input.quoteCurrencyCode,
        sourceName: input.sourceName ?? "Mock data",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockExchangeRates.unshift(newRecord);
      return { ...newRecord };
    }

    return this.repository.upsertRate({
      ...input,
      rateDate: normalizedDate,
    });
  }

  private normalizeLimit(limit?: number | null): number {
    if (!limit || !Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_HISTORY_LIMIT;
    }
    return Math.floor(limit);
  }

  private normalizeDate(value: Date): Date {
    const normalized = new Date(value);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
  }
}

export const exchangeRateService = new ExchangeRateService();
