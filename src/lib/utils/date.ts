const MINUTES_IN_HOUR = 60;
const MILLISECONDS_IN_MINUTE = 60_000;
const MILLISECONDS_IN_DAY = 24 * 60 * MILLISECONDS_IN_MINUTE;

const CENTRAL_TIME_OFFSET_MINUTES = -6 * MINUTES_IN_HOUR; // UTC-6
const CENTRAL_TIME_OFFSET_MS = CENTRAL_TIME_OFFSET_MINUTES * MILLISECONDS_IN_MINUTE;
const TIMEZONE_NAME = "America/Managua";

function assertValidDateParts(year: number, monthIndex: number, day: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    throw new Error("Fecha inválida");
  }
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error("Mes inválido");
  }
  if (day < 1 || day > 31) {
    throw new Error("Día inválido");
  }
  const probe = new Date(Date.UTC(year, monthIndex, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== monthIndex ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("Fecha inválida");
  }
}

function buildCentralMidnightDate(year: number, monthIndex: number, day: number): Date {
  assertValidDateParts(year, monthIndex, day);
  const utcMs = Date.UTC(year, monthIndex, day) - CENTRAL_TIME_OFFSET_MS;
  return new Date(utcMs);
}

function extractCentralDateParts(date: Date): { year: number; monthIndex: number; day: number } {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Fecha inválida");
  }
  const centralMs = timestamp + CENTRAL_TIME_OFFSET_MS;
  const central = new Date(centralMs);
  return {
    year: central.getUTCFullYear(),
    monthIndex: central.getUTCMonth(),
    day: central.getUTCDate(),
  };
}

function normalizeInputDate(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Fecha inválida");
    }
    return new Date(value.getTime());
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Fecha vacía");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr, dayStr] = trimmed.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const day = Number(dayStr);
    return buildCentralMidnightDate(year, monthIndex, day);
  }

  const normalized = trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Fecha inválida");
  }
  return parsed;
}

export function toCentralClosedDate(value: string | Date): Date {
  const base = normalizeInputDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(typeof value === "string" ? value.trim() : "")) {
    return base;
  }
  const { year, monthIndex, day } = extractCentralDateParts(base);
  return buildCentralMidnightDate(year, monthIndex, day);
}

export function toCentralEndOfDay(value: string | Date): Date {
  const startOfDay = toCentralClosedDate(value);
  return new Date(startOfDay.getTime() + MILLISECONDS_IN_DAY - 1);
}

export function getCentralTimezoneOffsetMinutes(): number {
  return CENTRAL_TIME_OFFSET_MINUTES;
}

export function getCentralTimezoneName(): string {
  return TIMEZONE_NAME;
}
