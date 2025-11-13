"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex min-h-[44px] items-center space-x-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <span className="rounded bg-primary px-2 py-0.5 text-xs uppercase tracking-widest text-primary-foreground">
            {siteConfig.acronym}
          </span>
          <span className="hidden sm:inline-flex text-sm font-medium text-muted-foreground">
            {siteConfig.name}
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" type="button" asChild>
            <Link href="/logout" aria-label="Cerrar sesión" prefetch={false}>
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
