"use client";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/config/currency";

export type TotalsSummaryItem = {
  label: string;
  amount: number;
  currency?: string; // ISO 4217 code or 'local'/'foreign'
  emphasize?: boolean; // when true, renders a divider before and bold styles
};

export function TotalsSummary({
  items,
  className,
  contentClassName,
}: {
  items: TotalsSummaryItem[];
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("flex justify-end", className)}>
      <div className={cn("w-full max-w-sm", contentClassName)}>
        <div className="grid grid-cols-[1fr,auto] gap-y-1 text-sm">
          {items.map((item, idx) => {
            const prev = idx > 0 ? items[idx - 1] : undefined;
            const showDivider = item.emphasize && (!prev || !prev.emphasize);
            const amount = Number.isFinite(item.amount as number) ? (item.amount as number) : 0;
            return (
              <>
                {showDivider ? <div key={`sep-${idx}`} className="col-span-2 my-2 border-t border-muted" /> : null}
                <div key={`label-${idx}`} className={cn("pr-4 text-muted-foreground", item.emphasize && "font-semibold text-foreground")}>{item.label}</div>
                <div key={`value-${idx}`} className={cn("text-right text-foreground tabular-nums", item.emphasize && "font-semibold")}>{formatCurrency(amount, { currency: item.currency || "local" })}</div>
              </>
            );
          })}
        </div>
      </div>
    </div>
  );
}
