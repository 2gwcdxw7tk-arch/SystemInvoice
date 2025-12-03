import "server-only";

import { z } from "zod";

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const parseBooleanFlag = (input: string | undefined, defaultValue: boolean) => {
  if (typeof input !== "string" || input.trim().length === 0) {
    return defaultValue;
  }
  const normalized = input.trim().toLowerCase();
  if (truthy.has(normalized)) {
    return true;
  }
  if (falsy.has(normalized)) {
    return false;
  }
  return defaultValue;
};

const parsePositiveInteger = (input: string | undefined) => {
  if (typeof input !== "string" || input.trim().length === 0) {
    return null;
  }
  const value = Number.parseInt(input.trim(), 10);
  if (Number.isNaN(value) || value <= 0) {
    return null;
  }
  return value;
};

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_APP_URL: z
      .string()
      .trim()
      .url("NEXT_APP_URL debe ser una URL válida")
      .default("http://localhost:3000"),
    NEXT_PUBLIC_COMPANY_NAME: z
      .string()
      .trim()
      .min(1, "NEXT_PUBLIC_COMPANY_NAME es requerido")
      .default("Facturador"),
    NEXT_PUBLIC_COMPANY_ACRONYM: z.string().trim().optional(),
    NEXT_PUBLIC_COMPANY_ADDRESS: z.string().trim().optional(),
    NEXT_PUBLIC_ES_RESTAURANTE: z.string().trim().optional(),
    DB_CONNECTION_STRING: z.string().trim().optional(),
    MOCK_DATA: z.string().trim().optional(),
    NEXT_PUBLIC_CLIENT_LOGO_URL: z.string().trim().optional(),
    NEXT_PUBLIC_LOCAL_CURRENCY_CODE: z.string().trim().optional(),
    NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL: z.string().trim().optional(),
    NEXT_PUBLIC_FOREIGN_CURRENCY_CODE: z.string().trim().optional(),
    NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL: z.string().trim().optional(),
    DEFAULT_SALES_WAREHOUSE_CODE: z.string().trim().optional(),
    LICENSE_MAX_CASH_REGISTERS: z.string().trim().optional(),
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET debe contener al menos 32 caracteres"),
  })
  .superRefine((value, ctx) => {
    const useMockData = value.MOCK_DATA ? truthy.has(value.MOCK_DATA.toLowerCase()) : false;

    if (!useMockData && (!value.DB_CONNECTION_STRING || value.DB_CONNECTION_STRING.length === 0)) {
      ctx.addIssue({
        path: ["DB_CONNECTION_STRING"],
        code: z.ZodIssueCode.custom,
        message: "DB_CONNECTION_STRING es requerido cuando MOCK_DATA es false",
      });
    }
  })
  .transform((value) => {
    const useMockData = value.MOCK_DATA ? truthy.has(value.MOCK_DATA.toLowerCase()) : false;
    const isRestaurant = parseBooleanFlag(value.NEXT_PUBLIC_ES_RESTAURANTE, true);
    const maxCashRegisters = parsePositiveInteger(value.LICENSE_MAX_CASH_REGISTERS);
    const resolveCode = (input: string | undefined, fallback: string) => {
      const trimmed = input?.trim();
      return trimmed && trimmed.length > 0 ? trimmed.toUpperCase() : fallback;
    };

    const resolveSymbol = (input: string | undefined, fallback: string) => {
      const trimmed = input?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : fallback;
    };

    const localCurrencyCode = resolveCode(value.NEXT_PUBLIC_LOCAL_CURRENCY_CODE, "MXN");
    const localCurrencySymbol = resolveSymbol(value.NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL, "$");
    const foreignCurrencyCode = resolveCode(value.NEXT_PUBLIC_FOREIGN_CURRENCY_CODE, "USD");
    const foreignCurrencySymbol = resolveSymbol(value.NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL, "$");
    const defaultSalesWarehouseCode = resolveCode(value.DEFAULT_SALES_WAREHOUSE_CODE, "");

    const normalizedAppUrl = value.NEXT_APP_URL.replace(/\/+$/, "");
    const features = {
      isRestaurant,
      retailModeEnabled: !isRestaurant,
    } as const;

    const licenses = {
      maxCashRegisters,
      hasCashRegisterLimit: typeof maxCashRegisters === "number",
    } as const;

    return {
      ...value,
      DB_CONNECTION_STRING: value.DB_CONNECTION_STRING ?? "",
      NEXT_APP_URL: normalizedAppUrl,
      MOCK_DATA: useMockData,
      useMockData,
      appUrl: normalizedAppUrl,
      currency: {
        local: {
          code: localCurrencyCode,
          symbol: localCurrencySymbol,
        },
        foreign: {
          code: foreignCurrencyCode,
          symbol: foreignCurrencySymbol,
        },
      },
      exchangeRate: {
        baseCurrencyCode: localCurrencyCode,
        quoteCurrencyCode: foreignCurrencyCode,
      },
      defaultSalesWarehouseCode: defaultSalesWarehouseCode.length > 0 ? defaultSalesWarehouseCode : null,
      company: {
        name: value.NEXT_PUBLIC_COMPANY_NAME,
        acronym:
          value.NEXT_PUBLIC_COMPANY_ACRONYM && value.NEXT_PUBLIC_COMPANY_ACRONYM.length > 0
            ? value.NEXT_PUBLIC_COMPANY_ACRONYM
            : value.NEXT_PUBLIC_COMPANY_NAME.split(/\s+/)
                .filter(Boolean)
                .map((word) => word[0]?.toUpperCase() ?? "")
                .join("")
                .slice(0, 4) || value.NEXT_PUBLIC_COMPANY_NAME.slice(0, 4).toUpperCase(),
        address:
          value.NEXT_PUBLIC_COMPANY_ADDRESS && value.NEXT_PUBLIC_COMPANY_ADDRESS.length > 0
            ? value.NEXT_PUBLIC_COMPANY_ADDRESS
            : null,
        logoUrl:
          value.NEXT_PUBLIC_CLIENT_LOGO_URL && value.NEXT_PUBLIC_CLIENT_LOGO_URL.length > 0
            ? value.NEXT_PUBLIC_CLIENT_LOGO_URL
            : null,
      },
      isProduction: value.NODE_ENV === "production",
      features,
      publicFeatures: {
        isRestaurant: features.isRestaurant,
        retailModeEnabled: features.retailModeEnabled,
      },
      licenses,
    };
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Error al validar variables de entorno", parsed.error.flatten().fieldErrors);
  throw new Error("Variables de entorno inválidas. Revisa el archivo .env");
}

export const env = parsed.data;

export type AppEnv = typeof env;
