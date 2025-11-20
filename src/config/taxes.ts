const PERCENT_FORMATTER = new Intl.NumberFormat("es-NI", { style: "percent", maximumFractionDigits: 1 });

function parseRate(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const numeric = Number(raw);
  if (Number.isNaN(numeric) || numeric < 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

export const VAT_RATE = parseRate(process.env.NEXT_PUBLIC_VAT_RATE, 0.15);
export const SERVICE_RATE = parseRate(process.env.NEXT_PUBLIC_SERVICE_RATE, 0);

export function formatPercent(rate: number): string {
  return PERCENT_FORMATTER.format(rate);
}
