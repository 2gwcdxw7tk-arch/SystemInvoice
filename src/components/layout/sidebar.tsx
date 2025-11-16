"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, LayoutDashboard, ListChecks, PackageSearch, Receipt, Settings, Table, Users, BarChart3, ShieldCheck, Wallet, Shield, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";
import { isSessionAdministrator, isSessionFacturadorOnly } from "@/lib/auth/session-roles";

export type NavItem = {
  label: string;
  href: { pathname: string; hash?: string };
  icon: LucideIcon;
  description: string;
};

type SidebarNavItem = NavItem & { disabled?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: { pathname: "/dashboard" }, icon: LayoutDashboard, description: "Resumen operativo y KPIs" },
  { label: "Facturación", href: { pathname: "/facturacion" }, icon: Receipt, description: "Procesar ventas y revisar historial" },
  { label: "Caja", href: { pathname: "/caja" }, icon: Wallet, description: "Aperturas, cierres y reportes" },
  { label: "Artículos", href: { pathname: "/articulos" }, icon: PackageSearch, description: "Catálogo y precios" },
  { label: "Inventario", href: { pathname: "/inventario" }, icon: ListChecks, description: "Stock, kardex y compras" },
  { label: "Mesas", href: { pathname: "/mesas" }, icon: Table, description: "Mantenimiento de mesas y zonas" },
  { label: "Meseros", href: { pathname: "/meseros" }, icon: Users, description: "Staff y permisos" },
  { label: "Usuarios", href: { pathname: "/usuarios" }, icon: ShieldCheck, description: "Cuentas administrativas y roles" },
  { label: "Roles", href: { pathname: "/roles" }, icon: Shield, description: "Roles del sistema y permisos" },
  { label: "Reportes", href: { pathname: "/reportes" }, icon: BarChart3, description: "KPIs y descargas" },
  { label: "Preferencias", href: { pathname: "/preferencias" }, icon: Settings, description: "Ajustes y catálogos auxiliares" },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  variant?: "desktop" | "mobile";
  session: SessionPayload | null;
}

export function Sidebar({ collapsed = false, onToggleCollapse, variant = "desktop", session }: SidebarProps) {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState<string>("#resumen");

  const sessionIsAdministrator = isSessionAdministrator(session);
  const sessionIsFacturadorOnly = isSessionFacturadorOnly(session);

  const allowedPathsForFacturador = new Set(["/dashboard", "/facturacion", "/facturas", "/caja", "/reportes"]);

  const navItems: SidebarNavItem[] = NAV_ITEMS.map((item) => {
    const isAllowed = sessionIsAdministrator || allowedPathsForFacturador.has(item.href.pathname);
    return {
      ...item,
      disabled: sessionIsFacturadorOnly && !isAllowed,
    };
  });

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash || "#resumen");
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior de control mínima: solo botón de colapso en desktop */}
      {variant === "desktop" && (
        <div className={cn("mb-2 flex items-center justify-end")}
        >
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse} aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const itemHash = item.href.hash ? `#${item.href.hash}` : null;
          const pathMatch = pathname === item.href.pathname || pathname.startsWith(`${item.href.pathname}/`);
          const isActive = pathMatch && (!itemHash || currentHash === itemHash);
          const isDisabled = !!item.disabled;
          const handleClick = isDisabled
            ? (event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : undefined;
          const key = `${item.href.pathname}${item.href.hash ? `#${item.href.hash}` : ""}`;
          return (
            <Link key={key} href={item.href} aria-current={isActive ? "page" : undefined}
              tabIndex={isDisabled ? -1 : undefined}
              aria-disabled={isDisabled || undefined}
              onClick={handleClick}
              prefetch={!isDisabled}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-left transition-all duration-200 ease-out",
                isDisabled
                  ? "cursor-not-allowed opacity-60 hover:border-transparent hover:bg-transparent"
                  : "hover:border-primary/40 hover:bg-primary/5",
                isActive && !isDisabled ? "border-primary/70 bg-primary/10 text-primary" : "text-muted-foreground",
                collapsed && "justify-center px-3"
              )}
            >
              <Icon className="h-5 w-5" />
              {!collapsed && (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground/80 line-clamp-2 leading-snug">{item.description}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {/* Botón de logout convertido en item de menú arriba. Este bloque se elimina para integrarlo en la lista. */}
    </div>
  );
}
