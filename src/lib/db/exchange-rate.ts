import { exchangeRateService } from "@/lib/services/ExchangeRateService";
import type { ExchangeRateRow, UpsertExchangeRateInput } from "@/lib/repositories/exchange-rates/IExchangeRateRepository";

/**
 * @deprecated Usa `exchangeRateService` directamente. Este módulo se mantiene temporalmente
 * para mantener compatibilidad con importaciones existentes mientras se completa la migración.
 */
export type ExchangeRateRecord = ExchangeRateRow;

export async function getExchangeRateHistory(limit = 7): Promise<ExchangeRateRecord[]> {
  return exchangeRateService.getExchangeRateHistory(limit);
}

export async function getCurrentExchangeRate(): Promise<ExchangeRateRecord | null> {
  return exchangeRateService.getCurrentExchangeRate();
}

export async function getExchangeRateForDate(rateDate: Date): Promise<ExchangeRateRecord | null> {
  return exchangeRateService.getExchangeRateForDate(rateDate);
}

export async function upsertExchangeRate(input: UpsertExchangeRateInput): Promise<ExchangeRateRecord> {
  return exchangeRateService.upsertExchangeRate(input);
}
