import type { Decimal, JsonValue } from "@prisma/client/runtime/library";

export type DecimalLike = Decimal | number | string | bigint | null | undefined;

export const decimalToNumber = (value: DecimalLike, fallback = 0): number => {
  if (value === null || typeof value === "undefined") {
    return fallback;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof (value as Decimal).toNumber === "function") {
    return (value as Decimal).toNumber();
  }
  return fallback;
};

export const bigIntToNumber = (value: bigint | number | null | undefined): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return 0;
};

export const dateTimeToIso = (value: Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  return value.toISOString();
};

export const dateOnlyToIso = (value: Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
};

export const jsonToRecord = (value: JsonValue | null): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
};
