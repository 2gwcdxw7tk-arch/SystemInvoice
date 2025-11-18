export interface ExchangeRateRow {
  id: number;
  rateDate: Date;
  rateValue: number;
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  sourceName: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface UpsertExchangeRateInput {
  rateDate: Date;
  rateValue: number;
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  sourceName?: string | null;
}

export interface IExchangeRateRepository {
  listRates(limit?: number): Promise<ExchangeRateRow[]>;
  findRateByDate(rateDate: Date): Promise<ExchangeRateRow | null>;
  upsertRate(input: UpsertExchangeRateInput): Promise<ExchangeRateRow>;
}
