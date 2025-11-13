"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption<T = string> {
  value: T;
  label: string;
  description?: string;
}

interface ComboboxProps<T = string> {
  value: T | null;
  onChange: (value: T) => void;
  options: Array<ComboboxOption<T>>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchEnabled?: boolean;
  emptyText?: string;
  label?: string;
  ariaLabel?: string;
}

function optionToString<T>(option: ComboboxOption<T>) {
  return `${option.label} ${option.description ?? ""}`.toLowerCase();
}

export function Combobox<T = string>({
  value,
  onChange,
  options,
  placeholder = "Selecciona una opción",
  className,
  disabled,
  searchEnabled = true,
  emptyText = "Sin resultados",
  label,
  ariaLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const labelText = label || placeholder;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => optionToString(option).includes(term));
  }, [options, query]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      const firstSelected = listRef.current?.querySelector('[data-selected="true"]') as HTMLLIElement | null;
      firstSelected?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {label ? (
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      ) : null}
      <button
        type="button"
        ref={buttonRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel || labelText}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-2xl border border-muted bg-background px-3 text-left text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-muted-foreground")}> 
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-full min-w-[240px] rounded-3xl border border-muted bg-background p-3 shadow-2xl">
          {searchEnabled && options.length > 6 ? (
            <div className="mb-2 flex items-center gap-2 rounded-2xl border border-muted bg-background px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                placeholder="Buscar..."
              />
            </div>
          ) : null}
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto pr-1 text-sm"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((option) => {
                const isSelected = value === option.value;
                return (
                  <li key={String(option.value)}
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected}
                    tabIndex={-1}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={cn(
                      "group flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-3 py-2 transition",
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    <div>
                      <span className="block text-sm font-medium">{option.label}</span>
                      {option.description ? (
                        <span
                          className={cn(
                            "text-xs transition-colors",
                            isSelected ? "text-primary-foreground/90" : "text-muted-foreground/80 group-hover:text-muted-foreground"
                          )}
                        >
                          {option.description}
                        </span>
                      ) : null}
                    </div>
                    {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}