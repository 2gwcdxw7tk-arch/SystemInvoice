"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function parseISODate(value?: string | null) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const dayNames = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

function buildCalendarGrid(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const startDay = startOfMonth.getDay();
  const totalCells = 42; // 6 filas × 7 columnas
  return Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - startDay;
    return new Date(year, month, dayOffset + 1);
  });
}

export function DatePicker({ value, onChange, min, max, placeholder = "Selecciona fecha", className, disabled = false }: DatePickerProps) {
  const selectedDate = useMemo(() => parseISODate(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate || new Date());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const todayIso = useMemo(() => formatISODate(new Date()), []);

  const localizedLabel = useMemo(() => {
    if (!selectedDate) return placeholder;
    const formatter = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "long", year: "numeric" });
    const text = formatter.format(selectedDate);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [selectedDate, placeholder]);

  const days = useMemo(() => buildCalendarGrid(viewDate), [viewDate]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const isWithinBounds = (date: Date) => {
    const iso = formatISODate(date);
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  };

  return (
    <div ref={containerRef} className={cn("relative inline-block w-full", className)}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-3 rounded-2xl border border-muted bg-background px-3 text-left text-sm font-medium text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          open ? "ring-2 ring-primary/60" : "",
          disabled && "cursor-not-allowed bg-muted/40 text-muted-foreground"
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={cn("flex-1 whitespace-nowrap", !selectedDate && "text-muted-foreground")}>{localizedLabel}</span>
        <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="absolute right-0 z-50 mt-3 w-[296px] rounded-3xl border border-muted bg-background p-4 shadow-2xl">
          <div className="flex items-center justify-between text-sm font-medium text-foreground">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
              onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="capitalize">
              {new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(viewDate)}
            </span>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
              onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs uppercase text-muted-foreground">
            {dayNames.map((name) => (
              <span key={name} className="py-1">
                {name}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1 text-sm">
            {days.map((date, index) => {
              const iso = formatISODate(date);
              const isCurrentMonth = date.getMonth() === viewDate.getMonth();
              const isSelected = selectedDate && iso === formatISODate(selectedDate);
              const isToday = iso === todayIso;
              const disabled = !isWithinBounds(date);
              return (
                <button
                  key={`${iso}-${index}`}
                  type="button"
                  data-iso={iso}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "inline-flex h-9 w-full items-center justify-center rounded-xl transition",
                    isSelected && "bg-primary text-primary-foreground shadow",
                    !isSelected && !disabled && "hover:bg-muted",
                    isToday && !isSelected && "border border-primary/40",
                    !isCurrentMonth && "text-muted-foreground/60",
                    disabled && "cursor-not-allowed text-muted-foreground/40"
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
