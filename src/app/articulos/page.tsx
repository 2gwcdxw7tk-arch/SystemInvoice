"use client";

import Link from "next/link";
import { Boxes, PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MENU_ITEMS = [
  {
    href: "/articulos/catalogo",
    title: "Catálogo de artículos",
    description: "Consulta, filtra y administra productos en existencia.",
    icon: PackageSearch,
  },
  {
    href: "/articulos/ensamble",
    title: "Ensamble de kits",
    description: "Define componentes y cantidades para los kits comercializados.",
    icon: Boxes,
  },
] as const;

export default function ArticulosPage() {
  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Artículos</h1>
        <p className="text-sm text-muted-foreground">Elige el submódulo para gestionar productos individuales o kits.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.href} className="flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
              <CardHeader className="space-y-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </span>
                <div className="space-y-2">
                  <CardTitle className="text-xl font-semibold text-foreground">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button type="button" className="w-full rounded-2xl" asChild>
                  <Link href={item.href}>Ingresar</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
