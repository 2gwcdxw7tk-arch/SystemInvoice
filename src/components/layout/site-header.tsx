"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LogOut, Menu } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { useSession, useSessionActions } from "@/components/providers/session-provider";
import { isSessionAdministrator, isSessionFacturador, normalizeSessionRoles } from "@/lib/auth/session-roles";
import { useToast } from "@/components/ui/toast-provider";

function getInitials(source: string): string {
  const cleaned = source.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return cleaned.slice(0, 2).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

function humanizeRole(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return "";
  return normalized
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SiteHeader() {
  const session = useSession();
  const { clearSession } = useSessionActions();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const displayName = session?.name?.trim() || session?.sub || "Invitado";
  const normalizedRoles = normalizeSessionRoles(session);
  let roleLabel = "Sin rol";

  if (isSessionAdministrator(session)) {
    roleLabel = "Administrador";
  } else if (isSessionFacturador(session)) {
    roleLabel = "Facturador";
  } else if (session?.role === "waiter") {
    roleLabel = "Mesero";
  } else if (normalizedRoles.length > 0) {
    roleLabel = humanizeRole(normalizedRoles[0]!);
  }

  const initials = getInitials(displayName);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      const response = await fetch("/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Respuesta inesperada: ${response.status}`);
      }

      clearSession();
      router.replace("/?logout=1");
      router.refresh();
    } catch (error) {
      console.error("No se pudo cerrar sesión", error);
      toast({
        variant: "error",
        title: "No se pudo cerrar sesión",
        description: "Intenta nuevamente o verifica tu conexión.",
      });
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, router, toast, clearSession]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold">
          {/* Botón menú móvil */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl lg:hidden"
            aria-label="Abrir menú"
            title="Abrir menú"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("open-mobile-nav"));
              }
            }}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-muted/60 bg-background/90">
            {siteConfig.logoUrl ? (
              <Image
                src={siteConfig.logoUrl}
                alt={`Logotipo de ${siteConfig.name}`}
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            ) : (
              <span className="text-sm font-semibold text-primary">{siteConfig.acronym}</span>
            )}
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold text-foreground">{siteConfig.name}</span>
            <span className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:inline-flex">
              {siteConfig.acronym}
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-3">
          {session ? (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-muted/60 bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="max-w-[40vw] truncate text-sm font-medium text-foreground sm:max-w-none">{displayName}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{roleLabel}</p>
              </div>
            </div>
          ) : null}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            disabled={isLoggingOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}
