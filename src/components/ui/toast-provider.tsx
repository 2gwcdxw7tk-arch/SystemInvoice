"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastItem = {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  content?: React.ReactNode | ((ctx: { close: () => void }) => React.ReactNode);
};

type ToastContextValue = {
  toast: (t: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const item: ToastItem = {
      id,
      variant: t.variant || "info",
      durationMs: t.durationMs ?? 4000,
      title: t.title,
      description: t.description,
      content: t.content,
    };
    setItems((prev) => [...prev, item]);
    // Solo autocerrar si durationMs > 0; durationMs = 0 o < 0 implica persistente
    if ((item.durationMs ?? 0) > 0) {
      timers.current[id] = setTimeout(() => remove(id), item.durationMs);
    }
  }, [remove]);

  const value = useMemo(() => ({ toast }), [toast]);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t));
      timers.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster items={items} onClose={remove} />
    </ToastContext.Provider>
  );
}

function Toaster({ items, onClose }: { items: ToastItem[]; onClose: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-end gap-2 p-4 sm:p-6">
      <div className="ml-auto w-full max-w-sm space-y-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto relative w-full overflow-hidden rounded-2xl border p-3 shadow-lg backdrop-blur transition-all",
              variantClasses(t.variant)
            )}
          >
            <button
              type="button"
              aria-label="Cerrar notificación"
              onClick={() => onClose(t.id)}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 hover:bg-foreground/10"
            >
              <X className="h-4 w-4" />
            </button>
            {t.title && <p className="pr-8 text-sm font-semibold text-foreground">{t.title}</p>}
            {t.description && <p className="pr-8 text-sm text-foreground/80">{t.description}</p>}
            {t.content && (
              <div className="mt-2 pr-8 text-sm text-foreground/90">
                {typeof t.content === "function" ? t.content({ close: () => onClose(t.id) }) : t.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function variantClasses(variant: ToastVariant = "info") {
  switch (variant) {
    case "success":
      return "border-emerald-500/40 bg-emerald-500/10";
    case "error":
      return "border-red-500/40 bg-red-500/10";
    case "warning":
      return "border-amber-500/40 bg-amber-500/10";
    case "info":
    default:
      return "border-blue-500/40 bg-blue-500/10";
  }
}
