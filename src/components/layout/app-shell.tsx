"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { Sidebar } from "@/components/layout/sidebar";
import { BackToDashboard } from "@/components/layout/back-to-dashboard";
import { cn } from "@/lib/utils";

const HIDE_CHROME_PATHS = new Set<string>(["/", "/meseros/comandas"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const hideNavigation = !pathname || HIDE_CHROME_PATHS.has(pathname);

  if (hideNavigation) {
    return (
      <>
        <SiteHeader />
        <main className="min-h-[calc(100vh-4rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </>
    );
  }

  return (
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
