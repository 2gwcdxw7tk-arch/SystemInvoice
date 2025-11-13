const rawLocalCode = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE?.trim();
const rawLocalSymbol = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL?.trim();
const rawForeignCode = process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_CODE?.trim();
const rawForeignSymbol = process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL?.trim();
const defaultLocale = "es-MX";

const normalizeCode = (value: string | undefined, fallback: string) => {
  if (!value || value.length === 0) {
    return fallback;
  }
  return value.toUpperCase();
};

const normalizeSymbol = (value: string | undefined, fallback: string) => {
  if (!value || value.length === 0) {
    return fallback;
  }
  return value;
};

const localCode = normalizeCode(rawLocalCode, "MXN");
const localSymbol = normalizeSymbol(rawLocalSymbol, "$");
const foreignCode = normalizeCode(rawForeignCode, "USD");
const foreignSymbol = normalizeSymbol(rawForeignSymbol, "$");

export const currencyConfig = {
  local: {
    code: localCode,
    symbol: localSymbol,
  },
  foreign: {
    code: foreignCode,
    symbol: foreignSymbol,
  },
  locale: defaultLocale,
} as const;

type FormatCurrencyOptions = {
  currency?: "local" | "foreign" | string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function resolveCurrencyCode(currency: FormatCurrencyOptions["currency"]): string {
  if (!currency || currency === "local") {
    return currencyConfig.local.code;
  }
  if (currency === "foreign") {
    return currencyConfig.foreign.code;
  }
  return String(currency).toUpperCase();
}

function resolveCurrencySymbol(currency: FormatCurrencyOptions["currency"]): string {
  if (!currency || currency === "local") {
    return currencyConfig.local.symbol;
  }
  if (currency === "foreign") {
    return currencyConfig.foreign.symbol;
  }
  return String(currency);
}

function getFormatter(key: string, locale: string, code: string, minimumFractionDigits?: number, maximumFractionDigits?: number) {
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        minimumFractionDigits,
        maximumFractionDigits,
      })
    );
  }

  return formatterCache.get(key)!;
}

export function formatCurrency(value: number, options: FormatCurrencyOptions = {}): string {
  const { currency = "local", locale = currencyConfig.locale, minimumFractionDigits, maximumFractionDigits } = options;
  const code = resolveCurrencyCode(currency);
  const formatterKey = [locale, code, minimumFractionDigits ?? "", maximumFractionDigits ?? ""].join("|");
  const formatter = getFormatter(formatterKey, locale, code, minimumFractionDigits, maximumFractionDigits);
  const formatted = formatter.format(value);
  const desiredSymbol = resolveCurrencySymbol(currency);

  const parts = formatter.formatToParts(1);
  const defaultSymbol = parts.find((part) => part.type === "currency")?.value ?? desiredSymbol;

  if (defaultSymbol === desiredSymbol) {
    return formatted;
  }

  return formatted.replace(defaultSymbol, desiredSymbol);
}

export function getCurrencySymbol(target: "local" | "foreign" = "local"): string {
  return target === "local" ? currencyConfig.local.symbol : currencyConfig.foreign.symbol;
}
