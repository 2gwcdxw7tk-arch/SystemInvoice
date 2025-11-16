"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { Sidebar } from "@/components/layout/sidebar";
import { BackToDashboard } from "@/components/layout/back-to-dashboard";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";
import { SessionProvider } from "@/components/providers/session-provider";
import { useToast } from "@/components/ui/toast-provider";
import { isSessionAdministrator, isSessionFacturadorOnly } from "@/lib/auth/session-roles";

const HIDE_CHROME_PATHS = new Set<string>(["/", "/meseros/comandas"]);
const FACTURADOR_ALLOWED_PATHS = ["/dashboard", "/facturacion", "/facturas", "/caja", "/reportes"] as const;

function canFacturadorVisit(pathname: string): boolean {
  return FACTURADOR_ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

export function AppShell({ children, session }: { children: ReactNode; session: SessionPayload | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <SessionProvider value={session}>
      {hideNavigation ? (
        <>
          <SiteHeader />
          <main className="min-h-[calc(100vh-4rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </>
      ) : (
        <>
          <SiteHeader />
          <div
            className={cn(
              "min-h-screen lg:grid lg:gap-4",
              collapsed ? "lg:grid-cols-[5rem,1fr]" : "lg:grid-cols-[16rem,1fr]"
            )}
          >
            <aside className="sticky top-20 hidden self-start lg:block">
              <div className={cn("ml-4", collapsed ? "w-[5rem]" : "w-[16rem]")}>
                <div className="max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border bg-background/90 p-2 shadow-lg backdrop-blur">
                  <div className="flex h-[calc(100vh-6rem)] flex-col">
                    <Sidebar
                      collapsed={collapsed}
                      onToggleCollapse={() => setCollapsed((prev) => !prev)}
                      session={session}
                    />
                  </div>
                </div>
              </div>
            </aside>
            <main className="flex-1 px-4 pb-10 pt-4 sm:px-6 lg:pt-8">
              <BackToDashboard session={session} />
              {children}
            </main>
          </div>
        </>
      )}
    </SessionProvider>
  );
}
