"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Componente: BackToDashboard
 * Propósito: Proveer un botón consistente y accesible para regresar al Dashboard desde cualquier página.
 * Reglas:
 * - No se muestra cuando ya estamos en /dashboard.
 * - Área táctil mínima 44x44.
 * - Compatible con tema claro/oscuro y contraste adecuado.
 * - Accesible por teclado (rol botón + aria-label descriptivo).
 */
export function BackToDashboard({ className, session }: { className?: string; session: SessionPayload | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!pathname) return null;

  const normalizedRoles = (session?.roles ?? []).map((role) => role.trim().toUpperCase());
  const isAdministrator = session?.role === "admin" || normalizedRoles.includes("ADMINISTRADOR");
  const isFacturadorOnly = normalizedRoles.includes("FACTURADOR") && !isAdministrator;
  if (isFacturadorOnly) return null;

  if (pathname === "/") return null;
  if (pathname.startsWith("/dashboard")) return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 1) return null;
  if (searchParams?.has("mode")) return null;

  return (
    <div className={cn("mb-6", className)}>
      <Link
        href="/dashboard"
        aria-label="Volver al Dashboard"
        className={cn(
          "group inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-4 py-2 text-sm font-medium shadow-sm backdrop-blur transition-colors",
          "hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "active:scale-[0.97]",
          "min-h-[44px] min-w-[44px]"
        )}
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        <span className="hidden sm:inline">Volver al Dashboard</span>
        <span className="sr-only">Ir al Dashboard principal</span>
      </Link>
    </div>
  );
}
