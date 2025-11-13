import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

export type ExchangeRateRecord = {
  rateDate: Date;
  rateValue: number;
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  sourceName: string | null;
};

const mockExchangeRates: ExchangeRateRecord[] | null = env.useMockData
  ? (() => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const baseCurrencyCode = env.currency.local.code;
      const quoteCurrencyCode = env.currency.foreign.code;

      return Array.from({ length: 14 }, (_, index) => {
        const date = new Date(today);
        date.setUTCDate(today.getUTCDate() - index);
        const oscillation = Math.sin(index / 2.5) * 0.12;
        const baseline = 17.35 + oscillation;
        const rateValue = Number(baseline.toFixed(4));

        return {
          rateDate: date,
          rateValue,
          baseCurrencyCode,
          quoteCurrencyCode,
          sourceName: "Mock data",
        } satisfies ExchangeRateRecord;
      });
    })()
  : null;

function mapRecord(row: {
  rate_date: Date;
  rate_value: number;
  base_currency_code: string;
  quote_currency_code: string;
  source_name: string | null;
}): ExchangeRateRecord {
  return {
    rateDate: row.rate_date instanceof Date ? row.rate_date : new Date(row.rate_date),
    rateValue: Number(row.rate_value),
    baseCurrencyCode: row.base_currency_code,
    quoteCurrencyCode: row.quote_currency_code,
    sourceName: row.source_name,
  };
}

export async function getExchangeRateHistory(limit = 7): Promise<ExchangeRateRecord[]> {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 7;

  if (env.useMockData && mockExchangeRates) {
    return mockExchangeRates.slice(0, normalizedLimit);
  }

  const result = await query<{
    rate_date: Date;
    rate_value: number;
    base_currency_code: string;
    quote_currency_code: string;
    source_name: string | null;
  }>(
    `SELECT
       rate_date,
       rate_value,
       base_currency_code,
       quote_currency_code,
       source_name
     FROM app.exchange_rates
     ORDER BY rate_date DESC
     LIMIT $1`,
    [normalizedLimit]
  );

  return result.rows.map(mapRecord);
}

export async function getCurrentExchangeRate(): Promise<ExchangeRateRecord | null> {
  const history = await getExchangeRateHistory(1);
  return history[0] ?? null;
}

export async function getExchangeRateForDate(rateDate: Date): Promise<ExchangeRateRecord | null> {
  const normalizedDate = new Date(rateDate);
  normalizedDate.setUTCHours(0, 0, 0, 0);

  if (env.useMockData && mockExchangeRates) {
    return mockExchangeRates.find((entry) => entry.rateDate.getTime() === normalizedDate.getTime()) ?? null;
  }

  const result = await query<{
    rate_date: Date;
    rate_value: number;
    base_currency_code: string;
    quote_currency_code: string;
    source_name: string | null;
  }>(
    `SELECT
       rate_date,
       rate_value,
       base_currency_code,
       quote_currency_code,
       source_name
     FROM app.exchange_rates
     WHERE rate_date = $1::date
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedDate]
  );

  return result.rows.length > 0 ? mapRecord(result.rows[0]) : null;
}
