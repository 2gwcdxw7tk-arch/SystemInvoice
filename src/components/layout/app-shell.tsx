"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { Sidebar } from "@/components/layout/sidebar";
import { BackToDashboard } from "@/components/layout/back-to-dashboard";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { useToast } from "@/components/ui/toast-provider";
import { isSessionAdministrator, isSessionFacturadorOnly } from "@/lib/auth/session-roles";
import { useRef } from "react";
import { Modal } from "@/components/ui/modal";

const HIDE_CHROME_PATHS = new Set<string>(["/", "/meseros/comandas"]);
const FACTURADOR_ALLOWED_PATHS = ["/dashboard", "/facturacion", "/facturas", "/caja", "/reportes"] as const;

function canFacturadorVisit(pathname: string): boolean {
  return FACTURADOR_ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

export function AppShell({ children, session }: { children: ReactNode; session: SessionPayload | null }) {
  return (
    <SessionProvider value={session}>
      <AppShellInner>{children}</AppShellInner>
    </SessionProvider>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const session = useSession();

  const hideNavigation = !pathname || HIDE_CHROME_PATHS.has(pathname);

  const navigationRestricted = useMemo(() => {
    if (!session) return false;
    if (isSessionAdministrator(session)) return false;
    if (!pathname) return false;
    if (!isSessionFacturadorOnly(session)) return false;
    return !canFacturadorVisit(pathname);
  }, [pathname, session]);

  useEffect(() => {
    if (!navigationRestricted || !pathname) return;
    toast({
      variant: "warning",
      title: "Acceso restringido",
      description: "Solo puedes acceder a Dashboard, Facturación y Reportes.",
    });
    router.replace("/facturacion");
  }, [navigationRestricted, pathname, router, toast]);

  // Escucha el evento global para abrir el menú móvil desde el header
  useEffect(() => {
    const handler = () => setMobileNavOpen(true);
    window.addEventListener("open-mobile-nav", handler as EventListener);
    return () => window.removeEventListener("open-mobile-nav", handler as EventListener);
  }, []);

  // Bloquear scroll del body cuando el modal móvil está abierto
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  return hideNavigation ? (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  ) : (
    <>
      <SiteHeader />
      {/* Menú móvil tipo Modal (sin gestos de deslizamiento para evitar back gesture) */}
      <div className="lg:hidden">
        <Modal
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          className="items-start justify-start"
          contentClassName="h-screen max-h-none w-[18rem] sm:w-[20rem] rounded-none rounded-r-2xl p-0"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b p-3">
              <span className="text-sm font-semibold text-muted-foreground">Menú</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="text-sm text-muted-foreground hover:underline"
                aria-label="Cerrar menú"
              >
                Cerrar
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-2">
              <Sidebar variant="mobile" collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </div>
        </Modal>
      </div>
      <div
        className={cn(
          "min-h-screen overflow-x-hidden lg:grid lg:gap-4",
          collapsed ? "lg:grid-cols-[5rem,1fr]" : "lg:grid-cols-[16rem,1fr]"
        )}
      >
        <aside className="sticky top-20 hidden self-start lg:block">
          <div className={cn(collapsed ? "w-[5rem]" : "w-[16rem]")}> {/* Removed ml-4 to avoid width overflow */}
            <div className="max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border bg-background/90 p-2 shadow-lg backdrop-blur">
              <div className="flex h-[calc(100vh-6rem)] flex-col">
                <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((prev) => !prev)} />
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 px-4 pb-10 pt-4 sm:px-6 lg:pt-8">
          <BackToDashboard />
          {children}
        </main>
      </div>
    </>
  );
}
