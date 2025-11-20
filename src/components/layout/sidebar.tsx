"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, LayoutDashboard, ListChecks, PackageSearch, Receipt, Settings, Table, Users, BarChart3, ShieldCheck, Wallet, Shield, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasSessionPermission, isSessionAdministrator, isSessionFacturadorOnly } from "@/lib/auth/session-roles";
import { useSession } from "@/components/providers/session-provider";

export type NavItem = {
  label: string;
  href: { pathname: string; hash?: string };
  icon: LucideIcon;
  description: string;
  permissionCode?: string;
};

type SidebarNavItem = NavItem & { disabled?: boolean };

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: { pathname: "/dashboard" },
    icon: LayoutDashboard,
    description: "Resumen operativo y KPIs",
    permissionCode: "menu.dashboard.view",
  },
  {
    label: "Facturación",
    href: { pathname: "/facturacion" },
    icon: Receipt,
    description: "Procesar ventas y revisar historial",
    permissionCode: "menu.facturacion.view",
  },
  {
    label: "Caja",
    href: { pathname: "/caja" },
    icon: Wallet,
    description: "Aperturas, cierres y reportes",
    permissionCode: "menu.caja.view",
  },
  {
    label: "Artículos",
    href: { pathname: "/articulos" },
    icon: PackageSearch,
    description: "Catálogo y precios",
    permissionCode: "menu.articulos.view",
  },
  {
    label: "Inventario",
    href: { pathname: "/inventario" },
    icon: ListChecks,
    description: "Stock, kardex y compras",
    permissionCode: "menu.inventario.view",
  },
  {
    label: "Mesas",
    href: { pathname: "/mesas" },
    icon: Table,
    description: "Mantenimiento de mesas y zonas",
    permissionCode: "menu.mesas.view",
  },
  {
    label: "Meseros",
    href: { pathname: "/meseros" },
    icon: Users,
    description: "Staff y permisos",
    permissionCode: "menu.meseros.view",
  },
  {
    label: "Usuarios",
    href: { pathname: "/usuarios" },
    icon: ShieldCheck,
    description: "Cuentas administrativas y roles",
    permissionCode: "menu.usuarios.view",
  },
  {
    label: "Roles",
    href: { pathname: "/roles" },
    icon: Shield,
    description: "Roles del sistema y permisos",
    permissionCode: "menu.roles.view",
  },
  {
    label: "Reportes",
    href: { pathname: "/reportes" },
    icon: BarChart3,
    description: "KPIs y descargas",
    permissionCode: "menu.reportes.view",
  },
  {
    label: "Preferencias",
    href: { pathname: "/preferencias" },
    icon: Settings,
    description: "Ajustes y catálogos auxiliares",
    permissionCode: "menu.preferencias.view",
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapse, variant = "desktop", onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState<string>("#resumen");
  const session = useSession();

  const sessionIsAdministrator = isSessionAdministrator(session);
  const sessionIsFacturadorOnly = isSessionFacturadorOnly(session);

  const navItems: SidebarNavItem[] = NAV_ITEMS.map((item) => {
    const requiredPermission = item.permissionCode;
    const hasAccess = sessionIsAdministrator || !requiredPermission || hasSessionPermission(session, requiredPermission);
    return {
      ...item,
      disabled: !hasAccess && (sessionIsFacturadorOnly || !sessionIsAdministrator),
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

      <nav className="flex-1 space-y-1 overflow-x-hidden pr-1">
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
            : (variant === "mobile" && onNavigate)
              ? () => {
                  // Cerrar el drawer móvil al navegar
                  onNavigate();
                }
              : undefined;
          const key = `${item.href.pathname}${item.href.hash ? `#${item.href.hash}` : ""}`;
          return (
            <Link key={key} href={item.href} aria-current={isActive ? "page" : undefined}
              tabIndex={isDisabled ? -1 : undefined}
              aria-disabled={isDisabled || undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? `${item.label} – ${item.description}` : undefined}
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
                <span className="flex min-w-0 flex-1 flex-col" aria-hidden={collapsed ? true : undefined}>
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
